/* 担当 A: 設定（通知・パスワードの変更・退会）・プロフィール（ニックネーム・紹介文・アイコン）・マイページの出し分け。
   人を壊す操作（パスワード変更・退会）と、プロフィールの書き換えは、使い捨ての人（freshUser）で行う */
import type { Page } from "@playwright/test";
import { admin, cast, freshUser, lit, loginAs, seedListing, sql } from "./_db";
import { expect, test } from "./_fixtures";
import { anonClient, jpegWithExif, loginKnowingPassword, noisyPng, pngBuffer, tok, uniqueIp, webpBuffer } from "./_a";

/* ───────── 通知 ───────── */

test.describe("通知の設定", () => {
  test("通知のスイッチを切り替えると保存され、読み込み直しても残る", async ({ page, context }) => {
    const user = await freshUser("set-notify", { role: "buyer" });
    await loginAs(context, user);
    const read = async () =>
      (await sql<{ v: boolean }>(`select notify_new_listing as v from public.profiles where id = ${lit(user.id)}`))[0]!.v;
    const before = await read();
    await page.goto("/settings");
    const sw = page.getByRole("checkbox", { name: "新しい出品" });
    await expect(sw).toBeChecked({ checked: before });
    // 本物の checkbox は見えない形にしてあるので、見えているスイッチ（つまみ）を押す
    await page.locator(".setting-row", { has: sw }).locator(".toggle-slider").click();
    await expect(sw).toBeChecked({ checked: !before });
    await expect.poll(read).toBe(!before);
    await page.reload();
    await expect(page.getByRole("checkbox", { name: "新しい出品" })).toBeChecked({ checked: !before });
  });

  test("出品者と購入者で、出る通知のスイッチが違う", async ({ page, context }) => {
    await loginAs(context, await cast("seller"));
    await page.goto("/settings");
    await expect(page.getByRole("checkbox", { name: "フォローの通知" })).toHaveCount(1);
    await expect(page.getByRole("checkbox", { name: "新しい出品" })).toHaveCount(0);
    await loginAs(context, await cast("buyer"));
    await page.goto("/settings");
    await expect(page.getByRole("checkbox", { name: "新しい出品" })).toHaveCount(1);
    await expect(page.getByRole("checkbox", { name: "フォローの通知" })).toHaveCount(0);
  });
});

/* ───────── パスワードの変更 ───────── */

async function fillPassword(page: Page, current: string, next: string, again: string) {
  await page.getByLabel("今のパスワード").fill(current);
  await page.getByLabel("新しいパスワード", { exact: true }).fill(next);
  await page.getByLabel("新しいパスワード（確認）").fill(again);
  await page.getByRole("button", { name: "パスワードを変える" }).click();
}

test.describe("パスワードの変更", () => {
  test("誤りの文が出たあと、正しく変えると新しいパスワードで入れ、ほかの端末のログインは切れる", async ({ page, context }) => {
    test.setTimeout(60_000);
    await page.setExtraHTTPHeaders({ "x-vercel-forwarded-for": uniqueIp() });
    const user = await freshUser("set-pw", { role: "buyer" });
    const pw = await loginKnowingPassword(context, user);
    // ほかの端末のつもりのログイン
    const other = anonClient();
    const signedIn = await other.auth.signInWithPassword({ email: user.email, password: pw });
    expect(signedIn.error).toBeNull();

    await page.goto("/settings");
    await page.locator(".setting-row", { hasText: "パスワード" }).getByRole("button", { name: "変更" }).click();
    const submit = page.getByRole("button", { name: "パスワードを変える" });
    await expect(submit).toBeDisabled();

    const strong = `E2e${tok(6)}x9`;
    await fillPassword(page, pw, strong, `${strong}zz`);
    await expect(page.getByText("新しいパスワードが、確認の欄と合っていません。")).toBeVisible();
    await fillPassword(page, pw, "short", "short");
    await expect(page.getByText(/新しいパスワードは\d+〜\d+文字で、英字と数字を両方入れてください。/)).toBeVisible();
    await fillPassword(page, `Wrong${tok()}1`, strong, strong);
    await expect(page.getByText("今のパスワードが違います。")).toBeVisible();
    await fillPassword(page, pw, pw, pw);
    await expect(page.getByText("今と同じパスワードです。")).toBeVisible();

    await fillPassword(page, pw, strong, strong);
    await expect(page.getByText("パスワードを変更しました。ほかの端末ではログインし直しになります。")).toBeVisible();

    // この端末はそのまま
    await page.reload();
    await expect(page).toHaveURL(/\/settings$/);
    // ほかの端末は切れている
    const refreshed = await other.auth.refreshSession();
    expect(refreshed.error, "ほかの端末のセッションが残っている").not.toBeNull();
    // 新しいパスワードで入れて、古いパスワードでは入れない
    expect((await anonClient().auth.signInWithPassword({ email: user.email, password: strong })).error).toBeNull();
    expect((await anonClient().auth.signInWithPassword({ email: user.email, password: pw })).error).not.toBeNull();
  });
});

/* ───────── 退会 ───────── */

test.describe("退会", () => {
  test.use({ consoleAllow: [/status of 404/] });

  test("確かめの文字とパスワードを入れて退会すると、トップに戻り、もうログインできず、出品も消える", async ({ page, context }) => {
    test.setTimeout(60_000);
    await page.setExtraHTTPHeaders({ "x-vercel-forwarded-for": uniqueIp() });
    const seller = await freshUser("set-quit", { role: "seller", nickname: `E2E退会${tok()}` });
    const listing = await seedListing(seller, { title: `E2E退会の商品${tok()}` });
    const pw = await loginKnowingPassword(context, seller);

    await page.goto("/settings");
    const zone = page.locator("section.acc-danger-zone");
    await zone.getByRole("button", { name: "手続きへ" }).click();
    const submit = zone.getByRole("button", { name: "退会する", exact: true });
    await zone.getByLabel(/退会の理由/).fill("E2E の試験です");
    await zone.getByLabel(/確認のため/).fill("たいかい");
    await zone.getByLabel(/今のパスワード/).fill(pw);
    await expect(submit).toBeDisabled();

    await zone.getByLabel(/確認のため/).fill("退会する");
    await zone.getByLabel(/今のパスワード/).fill(`Wrong${tok()}1`);
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(zone.getByText("今のパスワードが違います。")).toBeVisible();
    const still = await sql<{ status: string }>(`select status from public.profiles where id = ${lit(seller.id)}`);
    expect(still[0]!.status).toBe("active");

    await zone.getByLabel(/今のパスワード/).fill(pw);
    await submit.click();
    await expect(page).toHaveURL("http://localhost:3100/");

    const after = await sql<{ status: string }>(`select status from public.profiles where id = ${lit(seller.id)}`);
    expect(after[0]!.status).toBe("withdrawn");
    const l = await sql<{ status: string }>(`select status from public.listings where id = ${lit(listing)}`);
    expect(l[0]?.status ?? "deleted").not.toBe("published");
    expect((await page.goto(`/items/${listing}`))?.status()).toBe(404);
    expect((await page.goto(`/sellers/${seller.id}`))?.status()).toBe(404);

    // 同じメールとパスワードでは、もう入れない（登録の有無が分からない同じ文）
    await context.clearCookies();
    await page.goto("/auth");
    await page.locator("#loginEmail").fill(seller.email);
    await page.locator("#loginPw").fill(pw);
    await page.getByRole("button", { name: "🔑 ログイン" }).click();
    await expect(page.locator("p.pt-msg.error")).toHaveText("メールアドレスかパスワードが違います。");
  });
});

/* ───────── プロフィール ───────── */

const avatarInput = (page: Page) => page.locator(".mp-field", { hasText: "アイコン" }).locator('input[type="file"]');

async function avatarPath(id: string): Promise<string | null> {
  return (await sql<{ p: string | null }>(`select avatar_path as p from public.profiles where id = ${lit(id)}`))[0]!.p;
}

async function download(path: string): Promise<Buffer> {
  const { data, error } = await admin().storage.from("avatars").download(path);
  if (error || !data) throw new Error(`アイコンを読めませんでした: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}

test.describe("プロフィール", () => {
  test("PNG・WebP・EXIF 付きの JPEG をアイコンにすると、どれも WebP で保存され、EXIF は残らない", async ({ page, context }) => {
    test.setTimeout(60_000);
    const user = await freshUser("set-avatar", { role: "buyer" });
    await loginAs(context, user);
    await page.goto("/mypage/profile");
    await expect(page.getByRole("heading", { name: "プロフィールの編集" })).toBeVisible();
    const marker = `E2EEXIF${tok()}`;
    const files = [
      { name: "icon.png", mimeType: "image/png", buffer: await pngBuffer() },
      { name: "icon.webp", mimeType: "image/webp", buffer: await webpBuffer() },
      { name: "icon.jpg", mimeType: "image/jpeg", buffer: await jpegWithExif(marker) },
    ];
    const seen = new Set<string>();
    for (const f of files) {
      const thumb = page.locator(".mp-field", { hasText: "アイコン" }).locator('img[alt="画像 1"]');
      if (await thumb.count()) await page.locator(".mp-field", { hasText: "アイコン" }).getByRole("button", { name: "外す" }).click();
      await avatarInput(page).setInputFiles(f);
      await expect(thumb).toBeVisible();
      await page.getByRole("button", { name: "保存する" }).click();
      await expect(page.getByText("プロフィールを保存しました。")).toBeVisible();
      const path = await avatarPath(user.id);
      expect(path, f.name).toMatch(new RegExp(`^${user.id}/[0-9a-f-]{36}\\.webp$`));
      expect(seen.has(path!), "毎回新しいファイルになる").toBe(false);
      seen.add(path!);
      const bytes = await download(path!);
      expect(bytes.subarray(0, 4).toString("latin1"), f.name).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("latin1"), f.name).toBe("WEBP");
      expect(bytes.includes(Buffer.from(marker)), `${f.name} に EXIF が残っている`).toBe(false);
      await page.reload();
    }
  });

  test("大きな（約7MB の）PNG を選んでも、手元で縮めてアイコンにできる", async ({ page, context }) => {
    test.setTimeout(60_000);
    const user = await freshUser("set-big", { role: "buyer" });
    await loginAs(context, user);
    await page.goto("/mypage/profile");
    const big = await noisyPng(1600);
    expect(big.length).toBeGreaterThan(4 * 1024 * 1024);
    await avatarInput(page).setInputFiles({ name: "big.png", mimeType: "image/png", buffer: big });
    await expect(page.locator(".mp-field", { hasText: "アイコン" }).locator('img[alt="画像 1"]')).toBeVisible({ timeout: 30_000 });
  });

  test("画像でない中身のファイルを選ぶと、使える形式の案内が出る", async ({ page, context }) => {
    const user = await freshUser("set-txt", { role: "buyer" });
    await loginAs(context, user);
    await page.goto("/mypage/profile");
    await avatarInput(page).setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("これは画像ではありません".repeat(20)) });
    await expect(page.locator(".mp-field", { hasText: "アイコン" }).locator("p.pt-msg.error")).toHaveText("JPEG・PNG・WebP の画像だけ使えます。");
    expect(await avatarPath(user.id)).toBeNull();
  });

  test.describe(() => {
    test.use({ consoleAllow: [/status of (413|500)/] });
    test("5MB の画像でないファイル（PDF）を選ぶと、形式か大きさの案内が出る（通信の失敗とは出ない）", async ({ page, context }) => {
      const user = await freshUser("set-pdf", { role: "buyer" });
      await loginAs(context, user);
      await page.goto("/mypage/profile");
      const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(5 * 1024 * 1024, 0x20)]);
      await avatarInput(page).setInputFiles({ name: "doc.pdf", mimeType: "application/pdf", buffer: pdf });
      const msg = page.locator(".mp-field", { hasText: "アイコン" }).locator("p.pt-msg.error");
      await expect(msg).toBeVisible();
      await expect(msg).toHaveText(/JPEG・PNG・WebP の画像だけ使えます。|画像が大きすぎます/);
    });
  });

  test("ニックネームを空にして保存すると、誤りが出て保存されない", async ({ page, context }) => {
    const user = await freshUser("set-nick0", { role: "buyer" });
    await loginAs(context, user);
    await page.goto("/mypage/profile");
    await page.locator("#pf-nickname").fill("");
    await page.getByRole("button", { name: "保存する" }).click();
    await expect(page.getByText("ニックネームは1〜20字で入れてください。")).toBeVisible();
    const n = await sql<{ nickname: string }>(`select nickname from public.profiles where id = ${lit(user.id)}`);
    expect(n[0]!.nickname).toBe(user.nickname);
  });

  test("出品者がニックネームと紹介文を変えて保存すると、公開中のページに出る", async ({ page, context }) => {
    const seller = await freshUser("set-prof", { role: "seller" });
    await loginAs(context, seller);
    const nick = `E2E名前${tok(3)}`;
    const bio = `E2E の紹介文です ${tok()}`;
    await page.goto("/mypage/profile");
    await page.locator("#pf-nickname").fill(nick);
    await page.locator("#pf-bio").fill(bio);
    await page.getByRole("button", { name: "保存する" }).click();
    await expect(page.getByText("プロフィールを保存しました。")).toBeVisible();
    await page.getByRole("link", { name: "公開中のページを見る →" }).click();
    await expect(page).toHaveURL(`/sellers/${seller.id}`);
    await expect(page.getByText(nick).first()).toBeVisible();
    await expect(page.getByText(bio)).toBeVisible();
  });
});

/* ───────── マイページの出し分け ───────── */

test.describe("マイページの出し分け", () => {
  test("出品者のマイページには、対応が必要な注文・最近の出品と、出品者のメニューが出る", async ({ page, context }) => {
    await loginAs(context, await cast("seller"));
    await page.goto("/mypage");
    await expect(page.locator(".pm-handle")).toHaveText("出品者アカウント");
    await expect(page.getByRole("heading", { name: /対応が必要な注文/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /最近の出品/ })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "マイページのメニュー" });
    for (const name of ["出品管理", "売上", "振込"]) await expect(nav.getByRole("link", { name })).toBeVisible();
    await expect(nav.getByRole("link", { name: "お気に入り" })).toHaveCount(0);
  });

  test("購入者のマイページには、最近の注文と購入者のメニューが出て、出品者の画面は開けない", async ({ page, context }) => {
    await loginAs(context, await cast("buyer"));
    await page.goto("/mypage");
    await expect(page.locator(".pm-handle")).toHaveText("購入者アカウント");
    await expect(page.getByRole("heading", { name: /最近の注文/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /対応が必要な注文/ })).toHaveCount(0);
    const nav = page.getByRole("navigation", { name: "マイページのメニュー" });
    for (const name of ["お気に入り", "フォロー中"]) await expect(nav.getByRole("link", { name })).toBeVisible();
    for (const name of ["出品管理", "売上", "振込"]) await expect(nav.getByRole("link", { name })).toHaveCount(0);
    for (const path of ["/mypage/items", "/mypage/sales"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/mypage$/);
    }
  });

  test("ログインしていない人がマイページ・設定・プロフィールを開くと、ログインへ回される", async ({ page }) => {
    for (const path of ["/mypage", "/settings", "/mypage/profile"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(new RegExp(`/auth\\?next=${encodeURIComponent(path)}`));
    }
  });
});

