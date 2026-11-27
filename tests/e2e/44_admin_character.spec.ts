/* 管理画面: キャラ（運営で入れた売手）
   運営のメールで登録した売手のアカウントに、管理者が「キャラ」の印を付ける → 管理画面からキャラの名前で出品する。
   取引（メッセージ・発送）と出品の編集は、運営がキャラでログインして、ふつうの売手の道で行う（2026-11-18 に決めた）。
   印を付けると本人確認は「済み」になる（記録 kyc.character_skip）。印を外しても、本人確認と出品はそのまま。
   375px の幅で横にはみ出さないかは 90_layout.mobile.spec.ts（スマホの試験はファイル名で分けている）。 */
import type { Page } from "@playwright/test";
import { admin, BASE_URL, cast, type Cast, freshUser, lit, loginAs, sql } from "./_db";
import { uniqueIp } from "./_a";
import { pngImage } from "./_b";
import { act, asAdmin, auditOf, rid, rowOf } from "./_d";
import { expect, test } from "./_fixtures";

const fileInput = (page: Page) => page.locator('input[type="file"]');

const LINK = /^http:\/\/localhost:3100\/auth\/start\?token_hash=[A-Za-z0-9_-]{16,}$/;

/** 作成のフォームを埋める */
async function fillCreate(page: Page, v: { email: string; nickname: string; age?: string; note?: string }) {
  await page.getByLabel(/^メールアドレス/).fill(v.email);
  await page.getByLabel(/^キャラの名前/).fill(v.nickname);
  if (v.age !== undefined) await page.getByLabel(/^年齢/).fill(v.age);
  if (v.note !== undefined) await page.getByLabel(/^運営のメモ/).fill(v.note);
}

async function createdOf(userId: string) {
  const [r] = await sql<{ created_via: string; link_issue_count: number; password_set_at: string | null; marked_by: string; note: string }>(
    `select created_via, link_issue_count, password_set_at, marked_by, note from public.character_accounts where user_id = ${lit(userId)}`,
  );
  return r;
}

/** 代理登録した人を直に作る（画面の登録と同じ道: createUser → admin_proxy_register） */
async function seedProxy(adm: Cast): Promise<Cast> {
  const nickname = `F代理${rid()}`;
  const email = `e2e-proxy-${Date.now().toString(36)}${rid()}@example.test`;
  const { data, error } = await admin().auth.admin.createUser({ email, email_confirm: true, user_metadata: { nickname, role: "seller", age: "25" } });
  if (error || !data.user) throw new Error(`代理登録の人を作れませんでした: ${error?.message}`);
  const marked = await admin().rpc("admin_proxy_register", { p_admin: adm.id, p_user: data.user.id, p_note: "E2E の下ごしらえ" });
  if (marked.error) throw new Error(`代理登録の印を付けられませんでした: ${marked.error.message}`);
  return { key: email, id: data.user.id, email, nickname, role: "seller" };
}

async function profileOf(userId: string) {
  const [r] = await sql<{ kyc_status: string }>(`select kyc_status from public.profiles where id = ${lit(userId)}`);
  return r;
}

async function markOf(userId: string) {
  const [r] = await sql<{ note: string; marked_by: string }>(
    `select note, marked_by from public.character_accounts where user_id = ${lit(userId)}`,
  );
  return r;
}

async function listingByTitle(title: string) {
  return sql<{ id: string; status: string; seller_id: string; image_paths: string[]; price: number }>(
    `select id, status, seller_id, image_paths, price from public.listings where title = ${lit(title)}`,
  );
}

test.describe("キャラ", () => {
  test("印を付けて一覧に出し、キャラの名前で出品し、キャラでログインして編集でき、印を外しても出品は残る", async ({ page, context }) => {
    const adm = await asAdmin(context);
    const chara = await freshUser("e-chr", { role: "seller", kyc: "unsubmitted", nickname: `Fキャラ${rid()}` });

    // ユーザーの詳細で「キャラにする」
    await page.goto(`/admin/users/${chara.id}`);
    await act(page, page, { button: "キャラにする", title: "キャラにする", reason: "E2E の試験のキャラ", confirm: "キャラにする", done: "キャラにしました。" });
    await expect(page.getByText("運営で入れたキャラです")).toBeVisible();
    expect(await markOf(chara.id)).toEqual({ note: "E2E の試験のキャラ", marked_by: adm.id });
    // 本人確認は済みになり、省いた記録が残る
    expect((await profileOf(chara.id)).kyc_status).toBe("approved");
    const actions = (await auditOf(chara.id)).map((a) => a.action);
    expect(actions).toContain("kyc.character_skip");
    expect(actions).toContain("user.character_mark");
    // 記録の画面では、操作の名前ではなく文で読める
    await page.goto(`/admin/logs?q=${chara.id}`);
    await expect(page.getByText(`${adm.nickname}さんが売手をキャラにしました（メモ: E2E の試験のキャラ）`, { exact: true })).toBeVisible();

    // 一覧「キャラ」に出る
    await page.goto("/admin/characters");
    await expect(page.getByRole("heading", { name: "キャラ", level: 1 })).toBeVisible();
    const row = rowOf(page, chara.nickname);
    await expect(row).toHaveCount(1);
    await row.getByRole("link", { name: "出品する" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/characters/${chara.id}/new$`));

    // キャラの名前で出品する
    await expect(page.getByText("このキャラの名前で出品します")).toBeVisible();
    await expect(page.locator(".adm-chara-banner").getByText(chara.nickname)).toBeVisible();
    await expect(page.getByRole("button", { name: /今のまま保存/ })).toHaveCount(0);
    await fileInput(page).setInputFiles({ name: "a.png", mimeType: "image/png", buffer: await pngImage("#9cf", 800, 600) });
    await expect(page.getByRole("img", { name: "画像 1" })).toBeVisible();
    const title = `E2Eキャラ出品 ${rid()}`;
    await page.getByLabel("商品タイトル").fill(title);
    await page.getByLabel("カテゴリ").selectOption("panty");
    await page.getByLabel("着用日数").selectOption("2");
    await page.getByLabel("商品説明").fill("E2E の試験でキャラの名前で出品した商品です。");
    await page.getByLabel("販売価格（円）").fill("4000");
    await page.getByRole("button", { name: "🎀 出品する" }).click();
    const done = page.getByRole("dialog", { name: "出品完了！" });
    await expect(done).toBeVisible();
    await expect.poll(async () => (await listingByTitle(title))[0]?.status).toBe("published");
    const [listing] = await listingByTitle(title);
    expect(listing.seller_id).toBe(chara.id);
    expect(listing.price).toBe(4000);
    expect(listing.image_paths).toHaveLength(1);
    expect(listing.image_paths[0]).toMatch(new RegExp(`^${chara.id}/[0-9a-f-]{36}\\.webp$`));
    expect((await auditOf(listing.id)).map((a) => a.action)).toContain("listing.character_create");
    // 1回作ったら、同じ画面からもう一度作れない（重ねて作らない）
    await page.keyboard.press("Escape");
    await expect(done).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/admin/items\\?seller=${chara.id}$`));
    await expect(rowOf(page, title)).toHaveCount(1);

    // 公開の商品ページにはキャラの名前で出る（管理者の名前は出ない）
    await page.goto(`/items/${listing.id}`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText(chara.nickname).first()).toBeVisible();
    // ヘッダーにはログイン中の運営の名前が出るので、本文（main）だけを見る
    await expect(page.locator("main").getByText(adm.nickname)).toHaveCount(0);

    // キャラでログインすると「自分の出品」に出て、編集できる
    await loginAs(context, chara);
    await page.goto("/mypage/items");
    await expect(page.locator(".my-item", { hasText: title })).toHaveCount(1);
    await page.goto(`/listings/${listing.id}/edit`);
    await expect(page.getByLabel("商品タイトル")).toHaveValue(title);
    await page.getByLabel("販売価格（円）").fill("4500");
    await page.getByRole("button", { name: "💾 変更を保存する" }).click();
    await expect.poll(async () => (await listingByTitle(title))[0]?.price).toBe(4500);

    // 「キャラを外す」と一覧から消え、出品と本人確認は残る
    await asAdmin(context);
    await page.goto(`/admin/users/${chara.id}`);
    await act(page, page, { button: "キャラを外す", title: "キャラを外す", confirm: "外す", done: "キャラを外しました。" });
    expect(await markOf(chara.id)).toBeUndefined();
    expect((await auditOf(chara.id)).map((a) => a.action)).toContain("user.character_unmark");
    await page.goto(`/admin/logs?q=${chara.id}`);
    await expect(page.getByText(`${adm.nickname}さんがキャラを外しました`, { exact: true })).toBeVisible();
    await page.goto("/admin/characters");
    await expect(rowOf(page, chara.nickname)).toHaveCount(0);
    expect((await listingByTitle(title))[0]?.status).toBe("published");
    expect((await profileOf(chara.id)).kyc_status).toBe("approved");
  });

  test.describe("印の無い人", () => {
    // わざと 404 の画面を開くので、その読み込みの console.error は許す
    test.use({ consoleAllow: [/status of 404/] });

    test("印の無い売手・購入者にはキャラの出品の画面を出さない。購入者には「キャラにする」を出さない", async ({ page, context }) => {
      await asAdmin(context);
      const seller = await freshUser("e-chr-no", { role: "seller" });
      const buyer = await freshUser("e-chr-buy", { role: "buyer" });

      const res = await page.goto(`/admin/characters/${seller.id}/new`);
      expect(res?.status()).toBe(404);
      const res2 = await page.goto(`/admin/characters/${buyer.id}/new`);
      expect(res2?.status()).toBe(404);

      await page.goto(`/admin/users/${buyer.id}`);
      await expect(page.getByRole("button", { name: "キャラにする", exact: true })).toHaveCount(0);
      // 出ないときは、出ない理由を画面に出す
      await expect(page.getByText("購入者はキャラにできません（キャラにできるのは売手だけです）。")).toBeVisible();
      await page.goto(`/admin/users/${seller.id}`);
      await expect(page.getByRole("button", { name: "キャラにする", exact: true })).toHaveCount(1);
      await expect(page.getByRole("button", { name: "キャラを外す", exact: true })).toHaveCount(0);
      await expect(page.getByText(/キャラにできません/)).toHaveCount(0);
      // ふつうの売手の窓は今までの文のまま。メモは任意で、代理登録の注意は出さない
      await page.getByRole("button", { name: "キャラにする", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: /をキャラにする$/ });
      await expect(dialog).toContainText("運営で入れた売手として印を付けます。");
      await expect(dialog.getByText("メモ（任意）")).toBeVisible();
      await expect(dialog).not.toContainText("代理で登録した人");
      await dialog.getByRole("button", { name: "やめる", exact: true }).click();
      await expect(dialog).toBeHidden();
    });
  });

  // 2026-11-27 に決めた: 代理登録で作った人も、運営が理由のメモを残してキャラにできる（DB は 0024）
  test("代理登録の人も、理由のメモを書けばキャラにでき、代理登録の印も残る。代理登録の一覧の行に「キャラ」の札が出る", async ({ page, context }) => {
    const adm = await asAdmin(context);
    const proxied = await seedProxy(adm);
    await page.goto(`/admin/users/${proxied.id}`);
    // カードの題は見出しの要素ではなく（Card は div）、前に飾りの絵文字が付くので、題の要素を中身の一部で待つ
    await expect(page.locator(".card-title", { hasText: "この利用者への操作" })).toBeVisible();
    await expect(page.getByText(/キャラにできません/)).toHaveCount(0);

    // 窓: 本人から頼まれた代理登録の人には使わない、という注意と、必須の理由
    await page.getByRole("button", { name: "キャラにする", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: /をキャラにする$/ });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("本人から頼まれて代理で登録した人には使わないでください");
    await expect(dialog.getByText("キャラにする理由（必須）")).toBeVisible();

    // 理由が空なら押しても閉じず、印も付かない
    await dialog.getByRole("button", { name: "キャラにする", exact: true }).click();
    await expect(dialog.getByRole("alert")).toHaveText("キャラにする理由を入力してください。");
    await expect(dialog).toBeVisible();
    expect(await markOf(proxied.id)).toBeUndefined();
    await dialog.getByRole("button", { name: "やめる", exact: true }).click();
    await expect(dialog).toBeHidden();

    await act(page, page, { button: "キャラにする", title: "キャラにする", reason: "先方の依頼で運営のキャラに切り替え", confirm: "キャラにする", done: "キャラにしました。" });
    await expect(page.getByText("運営で入れたキャラです")).toBeVisible();
    await expect(page.getByText("運営が代理で登録した人です")).toBeVisible();
    expect(await markOf(proxied.id)).toEqual({ note: "先方の依頼で運営のキャラに切り替え", marked_by: adm.id });
    expect((await auditOf(proxied.id)).map((a) => a.action)).toContain("user.character_mark");
    await page.goto(`/admin/logs?q=${proxied.id}`);
    await expect(
      page.getByText(`${adm.nickname}さんが代理登録の人をキャラにしました（メモ: 先方の依頼で運営のキャラに切り替え）`, { exact: true }),
    ).toBeVisible();

    // 代理登録の一覧でも、キャラにした人だと分かる
    await page.goto(`/admin/proxy?q=${encodeURIComponent(proxied.nickname)}`);
    await expect(rowOf(page, proxied.nickname).getByText("キャラ", { exact: true })).toBeVisible();
  });

  // 2026-11-27 に決めた: 強制退会したキャラは、一覧で既定で隠し、「退会済みも表示」で見る
  test("退会したキャラは一覧に既定で出ず、IDで探しても出ない。「退会済みも表示」で絞り込むと「退会済み」の札つきで出る", async ({ page, context }) => {
    const adm = await asAdmin(context);
    const gone = await freshUser("e-chr-wd", { role: "seller", nickname: `F退会キャラ${rid()}` });
    const live = await freshUser("e-chr-live", { role: "seller", nickname: `F利用キャラ${rid()}` });
    for (const u of [gone, live]) {
      const { error } = await admin().rpc("admin_mark_character", { p_admin: adm.id, p_user: u.id, p_note: "E2E の退会の試験" });
      expect(error).toBeNull();
    }
    // 画面の強制退会と同じ道（利用を停止 → admin_withdraw_user）。退会すると名前は「退会したユーザー」になるので、ID で探す
    const pre = await admin().rpc("admin_set_user_status", { p_admin: adm.id, p_user: gone.id, p_status: "suspended", p_reason: "E2E 下ごしらえ" });
    expect(pre.error).toBeNull();
    const wd = await admin().rpc("admin_withdraw_user", { p_admin: adm.id, p_user: gone.id, p_reason: "E2E の退会の試験" });
    expect(wd.error).toBeNull();
    const goneRow = page.locator("tr", { has: page.locator(`a[href="/admin/users/${gone.id}"]`) });
    const status = page.getByRole("combobox", { name: "退会済みの表示" });

    // 既定は「退会済みを除く」。利用中のキャラは出る
    await page.goto("/admin/characters");
    await expect(status).toHaveValue("");
    await expect(rowOf(page, live.nickname)).toHaveCount(1);
    await expect(goneRow).toHaveCount(0);
    await page.goto(`/admin/characters?q=${gone.id}`);
    await expect(goneRow).toHaveCount(0);
    await expect(page.getByText("条件に合うキャラはいません。退会したキャラは「退会済みも表示」で見られます。", { exact: true })).toBeVisible();

    // 「退会済みも表示」で絞り込むと出て、「退会済み」の札が付く
    await status.selectOption("all");
    await page.getByRole("button", { name: "絞り込む", exact: true }).click();
    await expect(page).toHaveURL(/[?&]status=all(&|$)/);
    await expect(goneRow).toHaveCount(1);
    await expect(goneRow.getByText("退会済み", { exact: true })).toBeVisible();
    await expect(goneRow).toContainText("退会したユーザー");
    // 利用中のキャラも、「退会済みも表示」のときに出る
    await page.goto(`/admin/characters?status=all&q=${live.id}`);
    await expect(rowOf(page, live.nickname)).toHaveCount(1);
  });
});

test.describe("キャラを新しく作る", () => {
  test("名前とメールで作ると、リンクが1回だけ出て、一覧に確認済みで出る。別の窓でパスワードを決めるとログインでき、リンクのボタンが消える", async ({
    page,
    context,
    browser,
  }) => {
    const r = rid();
    const name = `F新キャラ${r}`;
    const email = `e2e-chara-${Date.now().toString(36)}${r}@example.test`;
    const adm = await asAdmin(context);

    await page.goto("/admin/characters");
    await fillCreate(page, { email, nickname: name, age: "23", note: `E2E メモ${r}` });
    await page.getByRole("button", { name: "キャラを作る", exact: true }).click();
    const confirm = page.getByRole("dialog", { name: "キャラを作りますか？" });
    await expect(confirm).toContainText(name);
    await expect(confirm).toContainText(email);
    await expect(confirm).toContainText("メールは運営が受け取れるアドレスにしてください（パスワードを忘れたときの再設定に使います）。");
    await confirm.getByRole("button", { name: "作る", exact: true }).click();

    // リンクの窓: リンクと注意の2つ
    const made = page.getByRole("dialog", { name: "キャラを作りました" });
    await expect(made).toBeVisible();
    await expect(page.locator(".adm-toasts").getByText(/^キャラを作りました。/)).toBeVisible();
    const url = await made.getByLabel(/^パスワードを決めるリンク/).inputValue();
    expect(url).toMatch(LINK);
    await expect(made).toContainText("管理画面と同じ窓で開くと、管理者のログインが切れます。シークレットウィンドウか別のブラウザで開いてください。");
    await expect(made).toContainText("期限は約1時間。新しく作ると前のリンクは使えなくなります。");
    await made.getByRole("button", { name: "閉じる", exact: true }).click();
    await expect(made).toHaveCount(0);
    // 閉じたら、リンクはもう画面のどこにも出ない
    await expect(page.getByLabel(/^パスワードを決めるリンク/)).toHaveCount(0);

    // 作られた人: 売手・確認済み・メールは確認済み・まだログインしていない。代理登録の台帳には入らない
    const [p] = await sql<{ id: string; role: string; kyc_status: string; status: string; nickname: string; confirmed: boolean; signed_in: boolean }>(`
      select p.id, p.role, p.kyc_status, p.status, p.nickname, u.email_confirmed_at is not null as confirmed, u.last_sign_in_at is not null as signed_in
      from public.profiles p join auth.users u on u.id = p.id where u.email = ${lit(email)}`);
    expect(p).toMatchObject({ role: "seller", kyc_status: "approved", status: "active", nickname: name, confirmed: true, signed_in: false });
    const id = p.id;
    expect(await createdOf(id)).toEqual({ created_via: "create", link_issue_count: 1, password_set_at: null, marked_by: adm.id, note: `E2E メモ${r}` });
    const [proxy] = await sql<{ n: number }>(`select count(*)::int as n from public.proxy_registrations where user_id = ${lit(id)}`);
    expect(proxy.n).toBe(0);
    const actions = (await auditOf(id)).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["user.character_create", "kyc.character_skip", "user.character_link"]));
    // リンクそのものは記録に残さない
    const token = new URL(url).searchParams.get("token_hash") ?? "";
    const logs = await sql<{ detail: string }>(`select detail::text as detail from public.audit_logs where target_id = ${lit(id)}`);
    for (const l of logs) expect(l.detail).not.toContain(token);

    // 読み直さなくても、作った直後の一覧に出る（出ないと「作れていない」と思って作り直し、「もう登録されています」で詰まる）
    await expect(rowOf(page, name)).toHaveCount(1);

    // 一覧に確認済みで出て、「パスワードのリンク」がある
    await page.reload();
    const row = rowOf(page, name);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("確認済み");
    await expect(row.getByRole("button", { name: "パスワードのリンク", exact: true })).toHaveCount(1);

    // 別の窓（管理者のログインと分ける）でリンクを開いてパスワードを決める
    const strong = `E2e${Date.now().toString(36)}x9`;
    const other = await browser.newContext({ extraHTTPHeaders: { "x-vercel-forwarded-for": uniqueIp() } });
    try {
      const op = await other.newPage();
      await op.goto(url);
      await expect(op.getByRole("heading", { name: "パスワードを決めましょう" })).toBeVisible();
      await op.getByRole("button", { name: "パスワードを決める →" }).click();
      await expect(op).toHaveURL(/\/auth\/update-password$/);
      await op.locator("#newPw").fill(strong);
      await op.locator("#newPwConf").fill(strong);
      await op.getByRole("button", { name: "🔒 パスワードを変更する" }).click();
      await expect(op.getByText("パスワードを変更しました。ほかの端末からはログアウトしています。")).toBeVisible();
    } finally {
      await other.close();
    }
    await expect.poll(async () => (await createdOf(id)).password_set_at).not.toBeNull();
    const set = (await auditOf(id)).find((a) => a.action === "user.character_password");
    expect(set?.actor_id).toBe(id);

    // 決めたパスワードで、そのキャラとしてログインできる
    const third = await browser.newContext({ extraHTTPHeaders: { "x-vercel-forwarded-for": uniqueIp() } });
    try {
      const lp = await third.newPage();
      await lp.goto(`${BASE_URL}/auth`);
      await lp.locator("#loginEmail").fill(email);
      await lp.locator("#loginPw").fill(strong);
      await lp.getByRole("button", { name: "🔑 ログイン" }).click();
      await expect(lp.locator("nav.pt-nav")).toContainText(`${name}さん`);
    } finally {
      await third.close();
    }

    // 管理者のログインはそのまま。一覧の「パスワードのリンク」は消える
    await page.reload();
    await expect(page.getByRole("heading", { name: "キャラ", level: 1 })).toBeVisible();
    await expect(rowOf(page, name)).toHaveCount(1);
    await expect(rowOf(page, name).getByRole("button", { name: "パスワードのリンク", exact: true })).toHaveCount(0);
  });

  test("一覧の「パスワードのリンク」で作り直すと、回数が増えて新しいリンクが出る", async ({ page, context }) => {
    const adm = await asAdmin(context);
    const name = `F作直${rid()}`;
    const email = `e2e-chara-${Date.now().toString(36)}${rid()}@example.test`;
    const { data, error } = await admin().auth.admin.createUser({ email, email_confirm: true, user_metadata: { nickname: name, role: "seller" } });
    if (error || !data.user) throw new Error(`キャラを作れませんでした: ${error?.message}`);
    const made = await admin().rpc("admin_create_character", { p_admin: adm.id, p_user: data.user.id, p_note: "" });
    if (made.error) throw new Error(`キャラの印を付けられませんでした: ${made.error.message}`);

    await page.goto(`/admin/characters?q=${encodeURIComponent(name)}`);
    await rowOf(page, name).getByRole("button", { name: "パスワードのリンク", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "パスワードのリンクを作りますか？" })).toBeVisible();
    await expect(dialog).toContainText(name);
    await dialog.getByRole("button", { name: "作る", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "リンクを作りました" })).toBeVisible();
    await expect(page.locator(".adm-toasts").getByText("リンクを作りました（1回目）。")).toBeVisible();
    const url = await dialog.getByLabel(/^パスワードを決めるリンク/).inputValue();
    expect(url).toMatch(LINK);
    await expect(dialog).toContainText("シークレットウィンドウか別のブラウザで開いてください。");
    await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect((await createdOf(data.user.id)).link_issue_count).toBe(1);
    expect((await auditOf(data.user.id)).map((a) => a.action)).toContain("user.character_link");
  });

  test("もう使われているメールアドレスでは作らず、誤りを出す", async ({ page, context }) => {
    await asAdmin(context);
    const taken = await cast("buyer");
    await page.goto("/admin/characters");
    await expect(page.getByRole("heading", { name: "キャラ", level: 1 })).toBeVisible();

    // 空のままでは窓を出さない
    await page.getByRole("button", { name: "キャラを作る", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "メールアドレスを入れてください。" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await fillCreate(page, { email: taken.email, nickname: `F重複${rid()}` });
    await page.getByRole("button", { name: "キャラを作る", exact: true }).click();
    await page.getByRole("dialog", { name: "キャラを作りますか？" }).getByRole("button", { name: "作る", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "このメールアドレスはもう登録されています。" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const [n] = await sql<{ n: number }>(`select count(*)::int as n from public.character_accounts where user_id = ${lit(taken.id)}`);
    expect(n.n).toBe(0);
  });
});
