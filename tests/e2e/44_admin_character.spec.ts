/* 管理画面: キャラ（運営で入れた売手）
   運営のメールで登録した売手のアカウントに、管理者が「キャラ」の印を付ける → 管理画面からキャラの名前で出品する。
   取引（メッセージ・発送）と出品の編集は、運営がキャラでログインして、ふつうの売手の道で行う（2026-11-18 に決めた）。
   印を付けると本人確認は「済み」になる（記録 kyc.character_skip）。印を外しても、本人確認と出品はそのまま。
   375px の幅で横にはみ出さないかは 90_layout.mobile.spec.ts（スマホの試験はファイル名で分けている）。 */
import type { Page } from "@playwright/test";
import { freshUser, lit, loginAs, sql } from "./_db";
import { pngImage } from "./_b";
import { act, asAdmin, auditOf, rid, rowOf } from "./_d";
import { expect, test } from "./_fixtures";

const fileInput = (page: Page) => page.locator('input[type="file"]');

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
      await page.goto(`/admin/users/${seller.id}`);
      await expect(page.getByRole("button", { name: "キャラにする", exact: true })).toHaveCount(1);
      await expect(page.getByRole("button", { name: "キャラを外す", exact: true })).toHaveCount(0);
    });
  });
});
