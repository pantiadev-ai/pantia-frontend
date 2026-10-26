/* 管理画面の入口と権限（担当 D）
   ・管理者でない人には /admin の下のどのページも 404（管理画面があること自体を見せない）
   ・二段階認証の前の管理者は /admin/mfa へ回される。新しい管理者は認証アプリを登録して入る
   ・画面を通さずに管理の関数（admin_*）を呼んでも断られる（service_role だけが呼べる） */
import { admin, cast, forgetSession, freshUser, lit, loginAs, sql, userClient } from "./_db";
import { expect, test } from "./_fixtures";
import { freshTotp } from "./_totp";

const ZERO = "00000000-0000-4000-8000-000000000000";
/** 管理画面のページ（詳しい所は、ありもしない ID で開く） */
const ADMIN_PAGES = [
  "/admin",
  "/admin/users",
  `/admin/users/${ZERO}`,
  "/admin/proxy",
  `/admin/proxy/${ZERO}`,
  "/admin/kyc",
  `/admin/kyc/${ZERO}`,
  "/admin/items",
  "/admin/orders",
  `/admin/orders/${ZERO}`,
  "/admin/reports",
  "/admin/moderation",
  "/admin/sales",
  "/admin/logs",
  "/admin/search",
  "/admin/settings",
];

test.describe("管理者でない人", () => {
  // 404 の画面の読み込みは console に出る
  test.use({ consoleAllow: [/status of 404/] });

  test("購入者が管理画面のどのページを開いても 404 になる", async ({ page, context }) => {
    await loginAs(context, await cast("buyer"));
    for (const path of [...ADMIN_PAGES, "/admin/mfa"]) {
      const res = await context.request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(404);
    }
    // 画面で開いても「見つかりません」で、管理のメニューは出ない
    const res = await page.goto("/admin/users");
    expect(res?.status()).toBe(404);
    await expect(page.locator("body")).toContainText("見つかりません");
    await expect(page.getByRole("navigation", { name: "管理メニュー" })).toHaveCount(0);
  });

  test("出品者が管理画面を開いても 404 になる", async ({ context }) => {
    await loginAs(context, await cast("seller"));
    for (const path of ["/admin", "/admin/mfa", "/admin/users", "/admin/settings"]) {
      const res = await context.request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(404);
    }
  });

  test("ログインしていない人が管理画面を開くとログインへ回される", async ({ page }) => {
    for (const path of ["/admin", "/admin/users", "/admin/mfa"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/auth\?next=%2Fadmin/);
    }
  });
});

test.describe("二段階認証", () => {
  test("二段階認証の前の管理者は、どの管理画面を開いても /admin/mfa へ回され、番号を入れる欄が出る", async ({ page, context }) => {
    await loginAs(context, await cast("admin"));
    for (const path of ADMIN_PAGES) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/admin\/mfa$/);
    }
    // 認証アプリは登録済みなので、登録ではなく番号の確認だけ
    await expect(page.locator(".card-title")).toContainText("二段階認証");
    await expect(page.getByLabel("認証アプリに出ている6桁のコード")).toBeVisible();
    await expect(page.getByRole("button", { name: "登録を始める" })).toHaveCount(0);
    // 外枠（件数の入ったメニュー）は出さない
    await expect(page.getByRole("navigation", { name: "管理メニュー" })).toHaveCount(0);
  });

  test("二段階認証を済ませた管理者が /admin/mfa を開くと /admin へ回される", async ({ page, context }) => {
    await loginAs(context, await cast("admin"), { aal2: true });
    await page.goto("/admin/mfa");
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "ダッシュボード", level: 1 })).toBeVisible();
  });

  test("新しい管理者が認証アプリを登録すると管理画面に入れ、違う番号では入れない", async ({ page, context }) => {
    const adm = await freshUser("d-adm", { role: "buyer", admin: true });
    try {
      await loginAs(context, adm);
      await page.goto("/admin");
      await expect(page).toHaveURL(/\/admin\/mfa$/);

      // 登録を始めると QR コードと手で入れるキーが出る
      await page.getByRole("button", { name: "登録を始める" }).click();
      await expect(page.getByRole("img", { name: "二段階認証の QR コード" })).toBeVisible();
      const secret = (await page.locator("code.adm-code").innerText()).replace(/\s/g, "");
      expect(secret).toMatch(/^[A-Z2-7]{16,}$/);

      const code = page.getByLabel("認証アプリに出ている6桁のコード");
      const submit = page.getByRole("button", { name: "確認する" });

      // 6桁でないと、送る前に止まる
      await code.fill("12345");
      await submit.click();
      await expect(page.getByRole("alert").filter({ hasText: "認証アプリに出ている6桁の数字を入れてください。" })).toBeVisible();

      // 違う番号では入れない
      const right = await freshTotp(secret);
      const wrong = String((Number(right) + 500_000) % 1_000_000).padStart(6, "0");
      await code.fill(wrong);
      await submit.click();
      await expect(page.getByRole("alert").filter({ hasText: "認証コードが違うか、時間切れです。" })).toBeVisible();
      await expect(page).toHaveURL(/\/admin\/mfa$/);

      // 正しい番号で管理画面に入れる
      await code.fill(await freshTotp(secret));
      await submit.click();
      await expect(page).toHaveURL(/\/admin$/);
      await expect(page.getByRole("heading", { name: "ダッシュボード", level: 1 })).toBeVisible();

      // 次にログインしたときは、登録ではなく番号を入れるだけで入れる
      await context.clearCookies();
      forgetSession(adm);
      await loginAs(context, adm);
      await page.goto("/admin/users");
      await expect(page).toHaveURL(/\/admin\/mfa$/);
      await expect(page.getByRole("button", { name: "登録を始める" })).toHaveCount(0);
      await page.getByLabel("認証アプリに出ている6桁のコード").fill(await freshTotp(secret));
      await page.getByRole("button", { name: "確認する" }).click();
      await expect(page).toHaveURL(/\/admin$/);
    } finally {
      await sql(`delete from public.admin_users where user_id = ${lit(adm.id)}`);
      const all = await admin().auth.admin.mfa.listFactors({ userId: adm.id });
      for (const f of all.data?.factors ?? []) await admin().auth.admin.mfa.deleteFactor({ userId: adm.id, id: f.id });
      forgetSession(adm);
    }
  });
});

test.describe("画面を通さない管理の操作", () => {
  /** 断られたこと（関数の権限が無い 42501・permission denied） */
  function denied(error: { code?: string; message?: string } | null): boolean {
    return !!error && (error.code === "42501" || /permission denied/i.test(error.message ?? ""));
  }

  test("一般の人や管理者がログインの鍵で管理の関数を直に呼ぶと、二段階認証の有無にかかわらず断られる", async () => {
    const buyer = await cast("buyer");
    const adm = await cast("admin");
    const target = await freshUser("d-perm", { role: "seller" });
    const callers = [
      { who: "購入者", client: await userClient(buyer) },
      { who: "二段階認証の前の管理者", client: await userClient(adm) },
      { who: "二段階認証を済ませた管理者", client: await userClient(adm, { aal2: true }) },
    ];
    for (const { who, client } of callers) {
      const stop = await client.rpc("admin_set_user_status", { p_admin: adm.id, p_user: target.id, p_status: "suspended", p_reason: "E2E" });
      expect(denied(stop.error), `${who}: 停止`).toBe(true);
      const money = await client.rpc("admin_ledger_adjust", { p_admin: adm.id, p_user: target.id, p_amount: 100000, p_note: "E2E" });
      expect(denied(money.error), `${who}: 台帳の調整`).toBe(true);
      const bal = await client.rpc("admin_user_balance", { p_admin: adm.id, p_user: target.id });
      expect(denied(bal.error), `${who}: 残高を読む`).toBe(true);
      // 中身の無い変更（もし通っても設定は変わらない）
      const set = await client.rpc("admin_update_settings", { p_admin: adm.id, p_patch: {} });
      expect(denied(set.error), `${who}: サイト設定`).toBe(true);
    }
    // 断られたので、相手は止まっておらず、台帳も増えていない
    const rows = await sql<{ status: string; total: number | string }>(`
      select p.status, (select coalesce(sum(amount), 0) from public.ledger_entries e where e.user_id = p.id) as total
      from public.profiles p where p.id = ${lit(target.id)}`);
    expect(rows[0].status).toBe("active");
    expect(Number(rows[0].total)).toBe(0);
  });

  test("一般の人が管理者の表・操作の記録を読もうとしても何も返らず、自分を管理者に足すこともできない", async () => {
    const buyer = await cast("buyer");
    const client = await userClient(buyer);
    const admins = await client.from("admin_users").select("user_id");
    expect(admins.error !== null || (admins.data ?? []).length === 0, "admin_users が読めない").toBe(true);
    const logs = await client.from("audit_logs").select("id").limit(5);
    expect(logs.error !== null || (logs.data ?? []).length === 0, "audit_logs が読めない").toBe(true);
    const mails = await client.from("mail_outbox").select("id").limit(5);
    expect(mails.error !== null || (mails.data ?? []).length === 0, "mail_outbox が読めない").toBe(true);

    const ins = await client.from("admin_users").insert({ user_id: buyer.id, note: "E2E" });
    try {
      expect(ins.error, "自分を管理者に足せない").not.toBeNull();
    } finally {
      // 万一通ってしまったときは消しておく（ほかの試験に響かないように）
      if (!ins.error) await sql(`delete from public.admin_users where user_id = ${lit(buyer.id)} and note = 'E2E'`);
    }
  });
});
