/* 出品（担当 B）: 新しく出品する・入力の誤り・写真・下書き・編集・非公開・削除・本人確認・権限・出品管理のタブ */
import { cast, freshUser, lit, loginAs, seedListing, sql, userClient } from "./_db";
import { e2eEnv } from "./_env";
import { EXIF_MARK, formAlert, freshPair, jpegWithExif, listingStatus, pngImage, rand, seedPendingOrder } from "./_b";
import { expect, test } from "./_fixtures";

/** 出品の行（出品管理の一覧） */
const itemRow = (page: import("@playwright/test").Page, title: string) => page.locator(".my-item", { hasText: title });

/** 画像の選び欄（隠れている input） */
const fileInput = (page: import("@playwright/test").Page) => page.locator('input[type="file"]');

/** 出品フォームの必須の項目を入れる */
async function fillListing(page: import("@playwright/test").Page, v: { title: string; price: string }) {
  await page.getByLabel("商品タイトル").fill(v.title);
  await page.getByLabel("カテゴリ").selectOption("panty");
  await page.getByLabel("着用日数").selectOption("2");
  await page.getByLabel("商品説明").fill("E2E の試験で出品した商品です。");
  await page.getByLabel("販売価格（円）").fill(v.price);
}

async function listingByTitle(title: string) {
  return sql<{ id: string; status: string; image_paths: string[]; seller_id: string; price: number }>(
    `select id, status, image_paths, seller_id, price from public.listings where title = ${lit(title)}`,
  );
}

test.describe("出品する", () => {
  test("本人確認済みの出品者が写真と必須の項目を入れて出品すると、公開されて商品ページに出る", async ({ page, context, request }) => {
    const seller = await freshUser("b-sel", { role: "seller" });
    await loginAs(context, seller);
    await page.goto("/listings/new");

    await fileInput(page).setInputFiles([
      { name: "a.png", mimeType: "image/png", buffer: await pngImage() },
      { name: "b.jpg", mimeType: "image/jpeg", buffer: await jpegWithExif() },
    ]);
    await expect(page.getByRole("img", { name: "画像 2" })).toBeVisible();

    const title = `E2E出品 ${rand()}`;
    await fillListing(page, { title, price: "3000" });
    await page.getByRole("button", { name: "🎀 出品する" }).click();
    // 完了の窓が出ている間は /listings/new のまま。窓を閉じると編集の画面へ移る
    const done = page.getByRole("dialog", { name: "出品完了！" });
    await expect(done).toBeVisible();
    await expect.poll(async () => (await listingByTitle(title))[0]?.status).toBe("published");
    await page.keyboard.press("Escape");
    await expect(done).toHaveCount(0);
    await expect(page).toHaveURL(/\/listings\/[0-9a-f-]{36}\/edit$/);

    const [row] = await listingByTitle(title);
    expect(row.price).toBe(3000);
    expect(row.image_paths).toHaveLength(2);
    for (const p of row.image_paths) expect(p).toMatch(new RegExp(`^${seller.id}/[0-9a-f-]{36}\\.webp$`));

    // 置き場の写真は WebP に作り直され、EXIF（撮影の情報）が消えている
    const res = await request.get(`${e2eEnv().url}/storage/v1/object/public/listing-images/${row.image_paths[1]}`);
    expect(res.status()).toBe(200);
    const body = await res.body();
    expect(body.subarray(0, 4).toString("latin1")).toBe("RIFF");
    expect(body.subarray(8, 12).toString("latin1")).toBe("WEBP");
    expect(body.includes(Buffer.from(EXIF_MARK))).toBe(false);

    await page.goto(`/items/${row.id}`);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  });

  test("新しく出品すると「出品完了！」の窓が出て、画面が落ち着いたあとも残り、商品ページへ進める", async ({ page, context }) => {
    const seller = await freshUser("b-sel", { role: "seller" });
    await loginAs(context, seller);
    await page.goto("/listings/new");
    await fileInput(page).setInputFiles({ name: "a.png", mimeType: "image/png", buffer: await pngImage() });
    await expect(page.getByRole("img", { name: "画像 1" })).toBeVisible();
    const title = `E2E完了窓 ${rand()}`;
    await fillListing(page, { title, price: "3000" });
    await page.getByRole("button", { name: "🎀 出品する" }).click();

    const done = page.getByRole("dialog", { name: "出品完了！" });
    await expect(done).toBeVisible();
    // 保存のあとの読み直しが終わっても、窓は閉じない（URL は窓を閉じるまで /listings/new のまま）
    await page.waitForLoadState("networkidle");
    await expect(done).toBeVisible();
    await done.getByRole("link", { name: "商品ページを見る →" }).click();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  });

  test("必須の項目を入れずに出品すると、足りない項目が出て保存されない", async ({ page, context }) => {
    const seller = await cast("seller");
    await loginAs(context, seller);
    await page.goto("/listings/new");
    await page.getByRole("button", { name: "🎀 出品する" }).click();
    await expect(formAlert(page)).toHaveText(
      "写真（1枚以上）・タイトル・カテゴリ・着用日数・商品説明・販売価格を入れてください。",
    );
    await expect(page).toHaveURL(/\/listings\/new$/);
  });

  test("販売価格が¥500〜¥100,000の外か100円単位でないと、価格の誤りが出て保存されない", async ({ page, context }) => {
    const seller = await freshUser("b-sel", { role: "seller" });
    await loginAs(context, seller);
    await page.goto("/listings/new");
    await fileInput(page).setInputFiles({ name: "a.png", mimeType: "image/png", buffer: await pngImage() });
    await expect(page.getByRole("img", { name: "画像 1" })).toBeVisible();
    const title = `E2E価格 ${rand()}`;
    for (const price of ["400", "100100", "1050"]) {
      await fillListing(page, { title, price });
      await page.getByRole("button", { name: "🎀 出品する" }).click();
      await expect(formAlert(page)).toHaveText("販売価格は¥500〜¥100,000の間で、100円単位で入れてください。");
    }
    expect(await listingByTitle(title)).toHaveLength(0);
  });

  test("JPEG・PNG・WebP でない画像を選ぶと、誤りが出て写真に入らない", async ({ page, context }) => {
    const seller = await freshUser("b-sel", { role: "seller" });
    await loginAs(context, seller);
    await page.goto("/listings/new");
    // GIF（形式が違う）
    await fileInput(page).setInputFiles({
      name: "x.gif",
      mimeType: "image/gif",
      buffer: Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64"),
    });
    await expect(formAlert(page)).toHaveText("JPEG・PNG・WebP の画像だけ使えます。");
    // 名前と種類だけ PNG の、中身が画像でない物
    await fileInput(page).setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("これは画像ではありません") });
    await expect(formAlert(page)).toHaveText(/JPEG・PNG・WebP の画像だけ使えます。|画像を読み込めませんでした/);
    await expect(page.getByRole("img", { name: "画像 1" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /写真を追加/ })).toContainText("0/5");
  });

  test("写真を6枚選ぶと5枚までしか入らず、追加のボタンが消える", async ({ page, context }) => {
    const seller = await freshUser("b-sel", { role: "seller" });
    await loginAs(context, seller);
    await page.goto("/listings/new");
    const colors = ["#f00", "#0f0", "#00f", "#ff0", "#0ff", "#f0f"];
    const files = await Promise.all(
      colors.map(async (c, i) => ({ name: `p${i}.png`, mimeType: "image/png", buffer: await pngImage(c) })),
    );
    await fileInput(page).setInputFiles(files);
    await expect(page.getByRole("img", { name: "画像 5" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("img", { name: "画像 6" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /写真を追加/ })).toHaveCount(0);
  });

  test("下書き保存すると下書きになり、あとで編集画面から公開できる", async ({ page, context }) => {
    const seller = await freshUser("b-sel", { role: "seller" });
    await loginAs(context, seller);
    await page.goto("/listings/new");
    const title = `E2E下書き ${rand()}`;
    await page.getByLabel("商品タイトル").fill(title);
    await page.getByRole("button", { name: "💾 下書き保存" }).click();
    // 新しい下書きは編集の画面へ移り、「✓」の合図を ?saved=draft で引き継ぐ
    await expect(page).toHaveURL(/\/listings\/[0-9a-f-]{36}\/edit\?saved=draft$/);
    await expect.poll(async () => (await listingByTitle(title)).length).toBe(1);
    const [row] = await listingByTitle(title);
    expect(row.status).toBe("draft");

    // 出品管理の「下書き」に出る
    await page.goto("/mypage/items?status=draft");
    await expect(itemRow(page, title)).toBeVisible();

    // 編集画面で残りを入れて公開する
    await page.goto(`/listings/${row.id}/edit`);
    await fileInput(page).setInputFiles({ name: "a.png", mimeType: "image/png", buffer: await pngImage() });
    await expect(page.getByRole("img", { name: "画像 1" })).toBeVisible();
    await fillListing(page, { title, price: "2500" });
    await page.getByRole("button", { name: "🎀 出品する" }).click();
    await expect(page.getByRole("dialog", { name: "出品完了！" })).toBeVisible();
    await expect.poll(() => listingStatus(row.id)).toBe("published");
  });

  test("公開中の出品を編集して保存すると、商品ページの内容が変わる", async ({ page, context }) => {
    const seller = await freshUser("b-sel", { role: "seller" });
    const id = await seedListing(seller, { title: `E2E編集前 ${rand()}` });
    await loginAs(context, seller);
    await page.goto(`/listings/${id}/edit`);
    const title = `E2E編集後 ${rand()}`;
    await page.getByLabel("商品タイトル").fill(title);
    await page.getByLabel("販売価格（円）").fill("4200");
    await page.getByRole("button", { name: "💾 変更を保存する" }).click();
    await expect(page.getByRole("status").filter({ hasText: "保存しました。" })).toBeVisible();
    const [row] = await sql<{ title: string; price: number; status: string }>(
      `select title, price, status from public.listings where id = ${lit(id)}`,
    );
    expect(row).toEqual({ title, price: 4200, status: "published" });
    await page.goto(`/items/${id}`);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  });
});

test.describe("出品管理（非公開・削除・タブ）", () => {
  test.use({ consoleAllow: [/status of 404/] });

  test("公開中の出品を非公開にすると、ほかの人には404になり、公開し直せる", async ({ page, context }) => {
    const seller = await freshUser("b-sel", { role: "seller" });
    const title = `E2E非公開 ${rand()}`;
    const id = await seedListing(seller, { title });
    await loginAs(context, seller);
    await page.goto(`/mypage/items?q=${encodeURIComponent(title)}`);
    await itemRow(page, title).getByRole("button", { name: "非公開" }).click();
    await expect.poll(() => listingStatus(id)).toBe("private");

    const buyer = await cast("buyer");
    await loginAs(context, buyer);
    const res = await page.goto(`/items/${id}`);
    expect(res?.status()).toBe(404);

    await loginAs(context, seller);
    await page.goto(`/mypage/items?q=${encodeURIComponent(title)}`);
    await itemRow(page, title).getByRole("button", { name: "公開する" }).click();
    await expect.poll(() => listingStatus(id)).toBe("published");
  });

  test("出品管理で削除すると、一覧から消え、商品ページは404になる", async ({ page, context }) => {
    const seller = await freshUser("b-sel", { role: "seller" });
    const title = `E2E削除 ${rand()}`;
    const id = await seedListing(seller, { title });
    await loginAs(context, seller);
    await page.goto(`/mypage/items?q=${encodeURIComponent(title)}`);
    await itemRow(page, title).getByRole("button", { name: "削除" }).click();
    const dialog = page.getByRole("dialog", { name: "出品を削除しますか？" });
    await expect(dialog).toContainText(title);
    await dialog.getByRole("button", { name: "削除する" }).click();
    await expect(itemRow(page, title)).toHaveCount(0);
    expect(await listingStatus(id)).toBe("deleted");
    const res = await page.goto(`/items/${id}`);
    expect(res?.status()).toBe(404);
  });

  test("支払い待ちの注文がある出品は、削除できず理由が出る", async ({ page, context }) => {
    const { seller, buyer } = await freshPair();
    const title = `E2E予約中 ${rand()}`;
    const id = await seedListing(seller, { title });
    await seedPendingOrder(buyer, [id]);
    await loginAs(context, seller);
    await page.goto(`/mypage/items?q=${encodeURIComponent(title)}`);
    await itemRow(page, title).getByRole("button", { name: "削除" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "削除する" }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toHaveText("この商品は、ほかの方が購入の手続き中です。");
    expect(await listingStatus(id)).toBe("published");
  });

  test("支払い待ちの注文がある出品は、Supabase を直に叩いても削除にできない", async () => {
    const { seller, buyer } = await freshPair();
    const id = await seedListing(seller, { title: `E2E予約中直 ${rand()}` });
    await seedPendingOrder(buyer, [id]);
    const db = await userClient(seller);
    const { data } = await db.from("listings").update({ status: "deleted" }).eq("id", id).select("id");
    // 断られる（エラー）か、1行も変わらない
    expect(data ?? []).toHaveLength(0);
    expect(await listingStatus(id)).toBe("published");
  });

  test("売り切れの出品は編集できず、削除はできる", async ({ page, context }) => {
    const seller = await freshUser("b-sel", { role: "seller" });
    const title = `E2E売切 ${rand()}`;
    const id = await seedListing(seller, { title, status: "sold" });
    await loginAs(context, seller);
    await page.goto(`/listings/${id}/edit`);
    await expect(page.getByText("売り切れの出品は編集できません。")).toBeVisible();

    await page.goto(`/mypage/items?q=${encodeURIComponent(title)}`);
    const row = itemRow(page, title);
    await expect(row.getByRole("link", { name: "編集" })).toHaveCount(0);
    await row.getByRole("button", { name: "削除" }).click();
    await page.getByRole("dialog", { name: "出品を削除しますか？" }).getByRole("button", { name: "削除する" }).click();
    await expect(row).toHaveCount(0);
    expect(await listingStatus(id)).toBe("deleted");
  });

  test("出品管理のタブの件数が、状態ごとの出品の数と合い、タブで絞り込める", async ({ page, context }) => {
    const seller = await freshUser("b-sel", { role: "seller" });
    const r = rand();
    const draft = `E2Eタブ下書き ${r}`;
    await seedListing(seller, { title: draft, status: "draft" });
    await seedListing(seller, { title: `E2Eタブ公開A ${r}` });
    await seedListing(seller, { title: `E2Eタブ公開B ${r}` });
    await seedListing(seller, { title: `E2Eタブ非公開 ${r}`, status: "private" });
    await seedListing(seller, { title: `E2Eタブ売切 ${r}`, status: "sold" });
    await seedListing(seller, { title: `E2Eタブ停止 ${r}`, status: "hidden" });
    await loginAs(context, seller);
    await page.goto("/mypage/items");
    const tabs = page.getByRole("navigation", { name: "出品の状態" });
    const expected: [string, string][] = [
      ["すべて", "6"],
      ["下書き", "1"],
      ["公開中", "2"],
      ["非公開", "1"],
      ["売り切れ", "1"],
      ["停止", "1"],
    ];
    for (const [label, n] of expected) {
      await expect(tabs.getByRole("link").filter({ hasText: label }).locator("small")).toHaveText(n);
    }
    await tabs.getByRole("link").filter({ hasText: "下書き" }).click();
    await expect(page).toHaveURL(/status=draft/);
    await expect(page.locator(".my-item")).toHaveCount(1);
    await expect(itemRow(page, draft)).toBeVisible();
  });
});

test.describe("出品の権限", () => {
  test.use({ consoleAllow: [/status of 404/] });

  test("本人確認が済んでいない出品者は出品（公開）できず、下書きは保存できる", async ({ page, context }) => {
    const seller = await freshUser("b-sel", { role: "seller", kyc: "unsubmitted" });
    await loginAs(context, seller);
    await page.goto("/listings/new");
    await expect(page.getByText("出品（公開）するには本人確認が必要です。下書きは今すぐ保存できます。")).toBeVisible();
    await expect(page.getByRole("button", { name: "🎀 出品する" })).toBeDisabled();
    const title = `E2E未確認 ${rand()}`;
    await page.getByLabel("商品タイトル").fill(title);
    await page.getByRole("button", { name: "💾 下書き保存" }).click();
    // 新しい下書きは編集の画面へ移り、「✓」の合図を ?saved=draft で引き継ぐ
    await expect(page).toHaveURL(/\/listings\/[0-9a-f-]{36}\/edit\?saved=draft$/);
    await expect.poll(async () => (await listingByTitle(title)).length).toBe(1);
    const [row] = await listingByTitle(title);
    expect(row.status).toBe("draft");

    // 出品管理の「公開する」も押せない
    await page.goto(`/mypage/items?q=${encodeURIComponent(title)}`);
    await expect(itemRow(page, title).getByRole("button", { name: "公開する" })).toBeDisabled();

    // Supabase を直に叩いて公開しても断られる（完成した出品でも）
    const full = await seedListing(seller, { status: "draft" });
    const db = await userClient(seller);
    const { error } = await db.from("listings").update({ status: "published" }).eq("id", full);
    expect(error?.code).toBe("42501");
    expect(await listingStatus(full)).toBe("draft");
  });

  test("購入者が出品の画面を開くと、マイページに回される", async ({ page, context }) => {
    const buyer = await cast("buyer");
    await loginAs(context, buyer);
    await page.goto("/listings/new");
    await expect(page).toHaveURL(/\/mypage$/);
  });

  test("ほかの出品者の出品の編集画面は404になり、直に書き換えもできない", async ({ page, context }) => {
    const owner = await freshUser("b-sel", { role: "seller" });
    const title = `E2E他人 ${rand()}`;
    const id = await seedListing(owner, { title });
    const other = await cast("seller2");
    await loginAs(context, other);
    const res = await page.goto(`/listings/${id}/edit`);
    expect(res?.status()).toBe(404);

    const db = await userClient(other);
    const { data } = await db.from("listings").update({ title: "乗っ取り" }).eq("id", id).select("id");
    expect(data ?? []).toHaveLength(0);
    const [row] = await sql<{ title: string }>(`select title from public.listings where id = ${lit(id)}`);
    expect(row.title).toBe(title);
  });
});
