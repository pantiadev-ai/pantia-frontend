/* 管理画面: 代理登録（担当 D）
   本人に頼まれて運営が代わりにアカウントを作る → パスワードを決めるリンクを本人に送る → 本人が決めると「渡し済み」。
   代理で登録した人は、本人確認の書類と審査を省いて、その場で「確認済み」にする（2026-11-07 に決めた。年齢は本人の申告と18歳以上の印で受ける）。
   リンクは /auth/start（開いただけでは使わない）を通り、ボタンを押したときだけ /auth/callback で使う。 */
import type { Page } from "@playwright/test";
import { admin, cast, type Cast, freshUser, lit, sql } from "./_db";
import { act, asAdmin, auditOf, closeKyc, rid, rowOf } from "./_d";
import { expect, test } from "./_fixtures";

/** 代理登録した人を直に作る（画面の登録と同じ道: createUser → admin_proxy_register） */
async function seedProxy(adm: Cast, opts: { role?: "seller" | "buyer"; nickname?: string } = {}): Promise<Cast> {
  const nickname = opts.nickname ?? `F代理${rid()}`;
  const role = opts.role ?? "buyer";
  const email = `e2e-proxy-${Date.now().toString(36)}${rid()}@example.test`;
  const { data, error } = await admin().auth.admin.createUser({ email, email_confirm: true, user_metadata: { nickname, role, age: "25" } });
  if (error || !data.user) throw new Error(`代理登録の人を作れませんでした: ${error?.message}`);
  const marked = await admin().rpc("admin_proxy_register", { p_admin: adm.id, p_user: data.user.id, p_note: "E2E の下ごしらえ" });
  if (marked.error) throw new Error(`代理登録の印を付けられませんでした: ${marked.error.message}`);
  return { key: email, id: data.user.id, email, nickname, role };
}

async function ledgerOf(userId: string) {
  const [r] = await sql<{ registered_by: string; note: string; link_issue_count: number; handed_over_at: string | null }>(
    `select registered_by, note, link_issue_count, handed_over_at from public.proxy_registrations where user_id = ${lit(userId)}`,
  );
  return r;
}

/** 登録のフォームを埋める */
async function fillRegister(page: Page, v: { email: string; nickname: string; role: "seller" | "buyer"; age?: string; note?: string }) {
  await page.getByLabel(/^本人のメールアドレス/).fill(v.email);
  await page.getByLabel(/^呼び名/).fill(v.nickname);
  await page.getByLabel(/^使い方/).selectOption(v.role);
  if (v.age !== undefined) await page.getByLabel(/^年齢/).fill(v.age);
  if (v.note !== undefined) await page.getByLabel(/^運営のメモ/).fill(v.note);
  await page.getByRole("checkbox", { name: /登録を頼まれ/ }).check();
  await page.getByRole("checkbox", { name: /18歳以上だと申告しました/ }).check();
}

test.describe("代理で登録する", () => {
  test("足りない入力・登録済みのメールアドレスでは作らず、窓を出さないか誤りを出す", async ({ page, context }) => {
    await asAdmin(context);
    await page.goto("/admin/proxy");
    await expect(page.getByRole("heading", { name: "代理登録", level: 1 })).toBeVisible();

    // 空のまま
    await page.getByRole("button", { name: "代理で登録する", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "本人のメールアドレスを入れてください。" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // 出品者で年齢なし
    await fillRegister(page, { email: `e2e-proxy-ng${rid()}@example.test`, nickname: `F年齢${rid()}`, role: "seller" });
    await page.getByRole("button", { name: "代理で登録する", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "出品者は年齢を18〜99で入力してください" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByLabel(/^年齢/).fill("17");
    await page.getByRole("button", { name: "代理で登録する", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "出品者は年齢を18〜99で入力してください" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // 同意・18歳以上の申告の印が無い
    await page.getByLabel(/^年齢/).fill("24");
    const consent = page.getByRole("checkbox", { name: /登録を頼まれ/ });
    const adult = page.getByRole("checkbox", { name: /18歳以上だと申告しました/ });
    await consent.uncheck();
    await page.getByRole("button", { name: "代理で登録する", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "規約とプライバシーポリシーに同意してもらったことを確かめてください。" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await consent.check();
    await adult.uncheck();
    await page.getByRole("button", { name: "代理で登録する", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "本人が18歳以上だと申告したことを確かめてください。" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await adult.check();

    // もういる人のメールアドレス
    const taken = await cast("buyer");
    await page.getByLabel(/^本人のメールアドレス/).fill(taken.email);
    await page.getByLabel(/^年齢/).fill("24");
    await page.getByRole("button", { name: "代理で登録する", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "代理で登録しますか？" });
    await dialog.getByRole("button", { name: "登録する", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "このメールアドレスはもう登録されています。" })).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/proxy$/);
    const [n] = await sql<{ n: number }>(`select count(*)::int as n from public.proxy_registrations where user_id = ${lit(taken.id)}`);
    expect(n.n).toBe(0);
  });

  test("代理で登録した人は一覧に出て、リンクは開いただけでは使われず、本人がボタンから決めると渡し済みになる", async ({ page, context, request }) => {
    const r = rid();
    const name = `F代理${r}`;
    const email = `e2e-proxy-${Date.now().toString(36)}${r}@example.test`;
    const adm = await asAdmin(context);

    await page.goto("/admin/proxy");
    await fillRegister(page, { email, nickname: name, role: "seller", age: "24", note: `E2E メモ${r}` });
    await page.getByRole("button", { name: "代理で登録する", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "代理で登録しますか？" });
    await expect(dialog).toContainText(name);
    await expect(dialog).toContainText("出品者・24歳");
    await expect(dialog).toContainText("本人確認の書類と審査は省き");
    await dialog.getByRole("button", { name: "登録する", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/proxy\/[0-9a-f-]{36}$/);
    // 知らせは、移った先の詳しい画面でも読める（移る前の一瞬だけではない）
    await expect(page.getByRole("heading", { name: "代理登録の詳細", level: 1 })).toBeVisible();
    await expect(page.locator(".adm-toasts").getByText("代理で登録しました。次に、パスワードを決めるリンクを作って本人に送ってください。")).toBeVisible();
    const id = page.url().split("/").pop() ?? "";

    // 作られた人: 本人確認は省いて確認済み（申請は作らない）。台帳には登録した運営とメモ
    const [p] = await sql<{ role: string; kyc_status: string; status: string; email: string; confirmed: boolean; signed_in: boolean }>(`
      select p.role, p.kyc_status, p.status, u.email, u.email_confirmed_at is not null as confirmed, u.last_sign_in_at is not null as signed_in
      from public.profiles p join auth.users u on u.id = p.id where p.id = ${lit(id)}`);
    expect(p).toEqual({ role: "seller", kyc_status: "approved", status: "active", email, confirmed: true, signed_in: false });
    const [apps] = await sql<{ n: number }>(`select count(*)::int as n from public.kyc_applications where user_id = ${lit(id)}`);
    expect(apps.n).toBe(0);
    const led = await ledgerOf(id);
    expect(led.registered_by).toBe(adm.id);
    expect(led.note).toBe(`E2E メモ${r}`);
    expect(led.link_issue_count).toBe(0);
    const actions = (await auditOf(id)).map((a) => a.action);
    expect(actions).toContain("user.proxy_register");
    expect(actions).toContain("kyc.proxy_skip");

    // 詳細: 本人確認は省いた印。代理で書類を出す欄は無い
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByText(adm.nickname).first()).toBeVisible();
    await expect(page.getByText("代理で登録したので、本人確認は省いています（確認済み）。")).toBeVisible();
    await expect(page.getByRole("button", { name: "本人確認を代理で出す" })).toHaveCount(0);
    await expect(page.getByText(/代理登録のため、本人確認を省きました/)).toBeVisible();

    // 一覧: メールアドレスは出さない
    await page.goto(`/admin/proxy?q=${encodeURIComponent(name)}&handover=waiting`);
    await expect(rowOf(page, name)).toHaveCount(1);
    await expect(rowOf(page, name)).toContainText("リンク未作成");
    await expect(rowOf(page, name)).not.toContainText("@");
    await page.goto(`/admin/proxy?q=${encodeURIComponent(name)}&handover=done`);
    await expect(rowOf(page, name)).toHaveCount(0);

    // ユーザーの詳細にも代理登録の印
    await page.goto(`/admin/users/${id}`);
    await expect(page.locator(".alert-banner").filter({ hasText: "運営が代理で登録した人です（まだ本人に渡していません）" })).toBeVisible();
    await page.getByRole("link", { name: "代理登録の詳細" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/proxy/${id}$`));

    // リンクを作る（2回作ると、前のリンクは使えない）
    await act(page, page, { button: "パスワードを決めるリンクを作る", title: "リンクを作りますか？", confirm: "作る", done: "リンクを作りました（1回目）。本人だけに送ってください。" });
    const first = await page.getByLabel(/^パスワードを決めるリンク/).inputValue();
    await act(page, page, { button: "リンクを作り直す", title: "リンクを作りますか？", confirm: "作る", done: "リンクを作りました（2回目）。本人だけに送ってください。" });
    const url = await page.getByLabel(/^パスワードを決めるリンク/).inputValue();
    expect(url).toMatch(/^http:\/\/localhost:3100\/auth\/start\?token_hash=[A-Za-z0-9_-]{16,}$/);
    expect(url).not.toBe(first);
    const token = new URL(url).searchParams.get("token_hash") ?? "";
    expect((await ledgerOf(id)).link_issue_count).toBe(2);
    // リンクそのものは記録に残さない
    const logs = await sql<{ detail: string }>(`select detail::text as detail from public.audit_logs where target_id = ${lit(id)}`);
    for (const l of logs) expect(l.detail).not.toContain(token);
    await page.goto("/admin/proxy?q=" + encodeURIComponent(name));
    await expect(rowOf(page, name)).toContainText("リンク作成済み（2回）");

    // LINE などのプレビューが先に読みに来ても、トークンは使われない
    for (let i = 0; i < 2; i++) {
      const res = await request.get(url, { maxRedirects: 0 });
      expect(res.status()).toBe(200);
      const html = await res.text();
      expect(html).toContain("パスワードを決めましょう");
      expect(html).toMatch(/<meta name="referrer" content="no-referrer"/);
      expect(html).toMatch(/<meta name="robots" content="noindex, nofollow"/);
    }

    // 本人（ログインしていない）が開いてボタンを押す
    await context.clearCookies();
    // 作り直す前のリンクは使えない
    await page.goto(first);
    await page.getByRole("button", { name: "パスワードを決める →" }).click();
    await expect(page).toHaveURL(/\/auth\?error=link$/);

    await page.goto(url);
    await expect(page.getByRole("heading", { name: "パスワードを決めましょう" })).toBeVisible();
    await page.getByRole("button", { name: "パスワードを決める →" }).click();
    await expect(page).toHaveURL(/\/auth\/update-password$/);
    const strong = `E2e${Date.now().toString(36)}x9`;
    await page.locator("#newPw").fill(strong);
    await page.locator("#newPwConf").fill(strong);
    await page.getByRole("button", { name: "🔒 パスワードを変更する" }).click();
    await expect(page.getByText("パスワードを変更しました。ほかの端末からはログアウトしています。")).toBeVisible();

    const done = await ledgerOf(id);
    expect(done.handed_over_at).not.toBeNull();
    const handover = (await auditOf(id)).find((a) => a.action === "user.proxy_handover");
    expect(handover?.actor_id).toBe(id);

    // 使ったリンクは2回目は使えない
    await context.clearCookies();
    await page.goto(url);
    await page.getByRole("button", { name: "パスワードを決める →" }).click();
    await expect(page).toHaveURL(/\/auth\?error=link$/);

    // 運営の画面: 渡し済みで、もうリンクは作れない
    await asAdmin(context);
    await page.goto(`/admin/proxy/${id}`);
    await expect(page.getByText(/にパスワードを決めました。運営からはリンクを作れません/)).toBeVisible();
    await expect(page.getByRole("button", { name: "リンクを作り直す" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "パスワードを決めるリンクを作る" })).toHaveCount(0);
    await page.goto(`/admin/proxy?q=${encodeURIComponent(name)}&handover=done`);
    await expect(rowOf(page, name)).toContainText("渡し済み");
    await page.goto(`/admin/users/${id}`);
    await expect(page.locator(".alert-banner").filter({ hasText: "運営が代理で登録した人です（本人に渡し済み" })).toBeVisible();
  });
});

test.describe("一覧での見分け", () => {
  test("ユーザー一覧と本人確認の一覧で、代理登録の人・代理で出した申請にだけ「代理登録」の札が付く", async ({ page, context }) => {
    const adm = await asAdmin(context);
    const r = rid();
    const proxy = await seedProxy(adm, { role: "seller", nickname: `F代理${r}` });
    const self = await freshUser("d-self", { role: "seller", kyc: "unsubmitted", nickname: `F本人${r}` });
    const apps: string[] = [];
    try {
      for (const [u, by] of [[proxy, adm.id], [self, null]] as const) {
        const [a] = await sql<{ id: string }>(`
          insert into public.kyc_applications (user_id, provider, doc_type, birth_date, status, submitted_by)
          values (${lit(u.id)}, 'manual', 'license', '1990-01-01', 'pending', ${by ? lit(by) : "null"}) returning id`);
        apps.push(a.id);
      }

      await page.goto(`/admin/users?q=${encodeURIComponent(r)}`);
      await expect(rowOf(page, proxy.nickname).getByText("代理登録", { exact: true })).toBeVisible();
      await expect(rowOf(page, self.nickname)).toBeVisible();
      await expect(rowOf(page, self.nickname).getByText("代理登録", { exact: true })).toHaveCount(0);

      await page.goto("/admin/kyc?status=all");
      await expect(rowOf(page, proxy.nickname).getByText("代理登録", { exact: true })).toBeVisible();
      await expect(rowOf(page, self.nickname)).toBeVisible();
      await expect(rowOf(page, self.nickname).getByText("代理登録", { exact: true })).toHaveCount(0);

      // 審査の画面: 申請者の欄に登録の仕方
      await page.goto(`/admin/kyc/${apps[0]}`);
      await expect(page.getByRole("link", { name: "運営が代理で登録", exact: true })).toHaveAttribute("href", `/admin/proxy/${proxy.id}`);
      await page.goto(`/admin/kyc/${apps[1]}`);
      await expect(page.getByText("本人が登録", { exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "運営が代理で登録", exact: true })).toHaveCount(0);
    } finally {
      for (const id of apps) await closeKyc(id);
    }
  });
});

test.describe("代理登録でない人・おかしなリンク", () => {
  test.use({ consoleAllow: [/status of 404/] });

  test("ふつうに登録した人は代理登録の詳細が 404 で、ユーザーの詳細にも印が出ない", async ({ page, context }) => {
    const u = await freshUser("d-noproxy", { role: "buyer", kyc: "unsubmitted" });
    await asAdmin(context);
    const res = await page.goto(`/admin/proxy/${u.id}`);
    expect(res?.status()).toBe(404);
    await page.goto(`/admin/users/${u.id}`);
    await expect(page.getByRole("heading", { name: "ユーザーの詳細", level: 1 })).toBeVisible();
    await expect(page.getByText("運営が代理で登録した人です")).toHaveCount(0);
  });

  test("形のおかしいリンク・トークンの無いリンクは、ボタンを出さず案内だけ", async ({ page }) => {
    for (const path of ["/auth/start", "/auth/start?token_hash=abc", `/auth/start?token_hash=${"x".repeat(20)}%22%3E`]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "このリンクは使えません" }), path).toBeVisible();
      await expect(page.getByRole("button", { name: "パスワードを決める →" }), path).toHaveCount(0);
    }
  });
});
