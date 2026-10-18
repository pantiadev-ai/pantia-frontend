/* 担当 C: つぶやき（投稿・写真・字数・いいね・編集・削除・保留）とタイムライン・フォロー */
import { BASE_URL, lit, loginAs, sql, userClient } from "./_db";
import { acceptDialogs, freshBuyer, freshSeller, rnd, seedPost } from "./_c";
import { expect, test } from "./_fixtures";

// 1×1 の PNG（写真の投稿に使う。サーバーが作り直す）
const TINY_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function postIdOf(authorId: string, body: string): Promise<{ id: string; status: string; image_paths: string[] }> {
  const rows = await sql<{ id: string; status: string; image_paths: string[] }>(
    `select id, status, image_paths from public.posts where author_id = ${lit(authorId)} and body = ${lit(body)}`,
  );
  expect(rows, "つぶやきが1件だけ入っている").toHaveLength(1);
  return rows[0]!;
}

test.describe("つぶやく", () => {
  test("本人確認済みの出品者がつぶやくと、自分の管理画面・一覧・個別のページに出る", async ({ page, context }) => {
    const seller = await freshSeller("po-new");
    await loginAs(context, seller);
    await page.goto("/mypage/tweets");
    const body = `今日のひとこと ${rnd()}`;
    await page.getByRole("textbox", { name: "つぶやきの本文" }).fill(body);
    await page.getByRole("button", { name: "つぶやく" }).click();
    await expect(page.getByRole("status")).toContainText("つぶやきました。");
    await expect(page.locator(".tweet-log-item", { hasText: body })).toBeVisible();
    const post = await postIdOf(seller.id, body);
    expect(post.status).toBe("visible");

    await page.goto(`/tweets?q=${encodeURIComponent(body)}`);
    await expect(page.getByText(body, { exact: true })).toBeVisible();
    const res = await page.goto(`/tweets/${post.id}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByText(body, { exact: true })).toBeVisible();
  });

  test("写真を付けてつぶやくと、個別のページに写真が出る", async ({ page, context }) => {
    const seller = await freshSeller("po-img");
    await loginAs(context, seller);
    await page.goto("/mypage/tweets");
    const body = `写真つき ${rnd()}`;
    await page.getByRole("textbox", { name: "つぶやきの本文" }).fill(body);
    await page.getByRole("button", { name: "画像を追加" }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: TINY_PNG });
    await expect(page.locator(".pt-uploader-item")).toHaveCount(1);
    await page.getByRole("button", { name: "つぶやく" }).click();
    await expect(page.getByRole("status")).toContainText("つぶやきました。");
    const post = await postIdOf(seller.id, body);
    expect(post.image_paths).toHaveLength(1);
    await page.goto(`/tweets/${post.id}`);
    await expect(page.getByRole("img", { name: "写真1" })).toBeVisible();
  });

  test("購入者と本人確認前の出品者には投稿の欄が出ず、DB に直に入れようとしても断られる", async ({ page, context }) => {
    const buyer = await freshBuyer("po-deny");
    const pending = await freshSeller("po-deny", "unsubmitted");

    await loginAs(context, buyer);
    await page.goto("/tweets");
    await expect(page.getByRole("textbox", { name: "つぶやきの本文" })).toHaveCount(0);
    await page.goto("/mypage/tweets");
    await expect(page).toHaveURL(/\/mypage$/);
    const asBuyer = await userClient(buyer);
    const b = await asBuyer.from("posts").insert({ body: `購入者のつぶやき ${rnd()}` }).select("id");
    expect(b.error?.code).toBe("42501");

    await loginAs(context, pending);
    await page.goto("/mypage/tweets");
    await expect(page.getByText("つぶやきの投稿には、本人確認（18歳以上の確認）が必要です。")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "つぶやきの本文" })).toHaveCount(0);
    const asPending = await userClient(pending);
    const p = await asPending.from("posts").insert({ body: `確認前のつぶやき ${rnd()}` }).select("id");
    expect(p.error?.code).toBe("42501");
  });

  test("140字を超えると『つぶやく』が押せず、DB も141字を断る", async ({ page, context }) => {
    const seller = await freshSeller("po-len");
    await loginAs(context, seller);
    await page.goto("/mypage/tweets");
    const box = page.getByRole("textbox", { name: "つぶやきの本文" });
    const btn = page.getByRole("button", { name: "つぶやく" });
    await expect(btn).toBeDisabled();
    await box.fill("あ".repeat(141));
    await expect(page.getByText("141/140")).toBeVisible();
    await expect(btn).toBeDisabled();
    await box.fill("あ".repeat(140));
    await expect(page.getByText("140/140")).toBeVisible();
    await expect(btn).toBeEnabled();

    const db = await userClient(seller);
    const r = await db.from("posts").insert({ body: "あ".repeat(141) }).select("id");
    expect(r.error?.code).toBe("23514");
  });

  test("LINE やインスタへの誘いを含むつぶやきは公開されず、確認待ちになる", async ({ page, context, browser }) => {
    const seller = await freshSeller("po-spam");
    await loginAs(context, seller);
    await page.goto("/mypage/tweets");
    const body = `インスタもやってます ${rnd()}`;
    await page.getByRole("textbox", { name: "つぶやきの本文" }).fill(body);
    await page.getByRole("button", { name: "つぶやく" }).click();
    await expect(page.getByRole("status")).toContainText("投稿を受け付けました。確認のあと公開されます。");
    await expect(page.locator(".tweet-log-item", { hasText: body }).getByText("確認中")).toBeVisible();
    const post = await postIdOf(seller.id, body);
    expect(post.status).toBe("held");

    // ほかの人には見えない
    const other = await browser.newContext();
    try {
      const op = await other.newPage();
      const res = await op.goto(`${BASE_URL}/tweets/${post.id}`);
      expect(res?.status()).toBe(404);
    } finally {
      await other.close();
    }
  });
});

test.describe("いいね・編集・削除", () => {
  test("いいねを押すと数が1つ増えて残り、もう一度押すと元に戻る", async ({ page, context }) => {
    const seller = await freshSeller("po-like");
    const buyer = await freshBuyer("po-like");
    const id = await seedPost(seller, `いいねの確かめ ${rnd()}`);
    await loginAs(context, buyer);
    await page.goto(`/tweets/${id}`);
    const like = page.getByRole("button", { name: "いいね" });
    await expect(like).toHaveAttribute("aria-pressed", "false");
    await expect(like).toHaveText("♡ 0");
    await like.click();
    await expect(like).toHaveAttribute("aria-pressed", "true");
    await expect(like).toHaveText("♥ 1");
    await expect.poll(async () => (await sql<{ n: number }>(`select like_count as n from public.posts where id = ${lit(id)}`))[0]!.n).toBe(1);
    await page.reload();
    await expect(like).toHaveAttribute("aria-pressed", "true");
    await like.click();
    await expect(like).toHaveText("♡ 0");
    await expect.poll(async () => (await sql<{ n: number }>(`select like_count as n from public.posts where id = ${lit(id)}`))[0]!.n).toBe(0);
  });

  test("自分のつぶやきを編集すると本文が変わり、『編集済み』と出る", async ({ page, context }) => {
    const seller = await freshSeller("po-edit");
    const before = `直す前 ${rnd()}`;
    const id = await seedPost(seller, before);
    await loginAs(context, seller);
    await page.goto("/mypage/tweets");
    const item = page.locator(".tweet-log-item", { hasText: before });
    await item.getByRole("button", { name: "編集" }).click();
    const after = `直した後 ${rnd()}`;
    await page.getByRole("textbox", { name: "本文", exact: true }).fill(after);
    await page.getByRole("button", { name: "保存する" }).click();
    await expect(page.locator(".tweet-log-item", { hasText: after })).toContainText("（編集済み）");
    const rows = await sql<{ body: string; edited: boolean }>(`select body, edited_at is not null as edited from public.posts where id = ${lit(id)}`);
    expect(rows[0]).toEqual({ body: after, edited: true });
  });

  test.describe(() => {
    test.use({ consoleAllow: [/status of 404/] });

    test("自分のつぶやきを削除すると一覧から消え、個別のページは 404 になる", async ({ page, context }) => {
      const seller = await freshSeller("po-del");
      const body = `消すつぶやき ${rnd()}`;
      const id = await seedPost(seller, body);
      await loginAs(context, seller);
      acceptDialogs(page);
      await page.goto("/mypage/tweets");
      await page.locator(".tweet-log-item", { hasText: body }).getByRole("button", { name: "削除" }).click();
      await expect(page.locator(".tweet-log-item", { hasText: body })).toHaveCount(0);
      const n = await sql<{ n: number }>(`select count(*)::int as n from public.posts where id = ${lit(id)}`);
      expect(n[0]!.n).toBe(0);
      const res = await page.goto(`/tweets/${id}`);
      expect(res?.status()).toBe(404);
    });
  });

  test("他人のつぶやきには管理の印が出ず、DB を直に消す・書き換えるのも0件で終わる", async ({ page, context }) => {
    const seller = await freshSeller("po-other");
    const other = await freshSeller("po-other2");
    const body = `よその人のつぶやき ${rnd()}`;
    const id = await seedPost(seller, body);
    await loginAs(context, other);
    await page.goto(`/tweets/${id}`);
    await expect(page.getByText(body, { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "自分のつぶやきの管理" })).toHaveCount(0);
    await page.goto("/mypage/tweets");
    await expect(page.getByText(body, { exact: true })).toHaveCount(0);

    const db = await userClient(other);
    const del = await db.from("posts").delete().eq("id", id).select("id");
    expect(del.data ?? []).toHaveLength(0);
    const upd = await db.from("posts").update({ body: "乗っ取り" }).eq("id", id).select("id");
    expect(upd.data ?? []).toHaveLength(0);
    const rows = await sql<{ body: string }>(`select body from public.posts where id = ${lit(id)}`);
    expect(rows[0]?.body).toBe(body);
  });
});

test.describe("フォローとタイムライン", () => {
  test("出品者をフォローすると、タイムラインとフォロー中の一覧に出て、外すと消える", async ({ page, context }) => {
    const seller = await freshSeller("po-follow");
    const buyer = await freshBuyer("po-follow");
    const body = `フォロワーへのつぶやき ${rnd()}`;
    await seedPost(seller, body);
    await loginAs(context, buyer);

    await page.goto("/timeline");
    await expect(page.getByText("🌸 まだ誰もフォローしていません")).toBeVisible();

    await page.goto(`/sellers/${seller.id}`);
    const follow = page.getByRole("button", { name: `${seller.nickname}をフォロー` });
    await expect(follow).toHaveAttribute("aria-pressed", "false");
    await follow.click();
    await expect(follow).toHaveAttribute("aria-pressed", "true");
    await expect(follow).toHaveText("♥ フォロー中");
    // ボタンは先に切り替わるので、DB に入るのを待ってから移る
    await expect
      .poll(async () => (await sql<{ n: number }>(`select count(*)::int as n from public.follows where follower_id = ${lit(buyer.id)}`))[0]!.n)
      .toBe(1);

    await page.goto("/timeline");
    await expect(page.getByText(body, { exact: true })).toBeVisible();

    await page.goto("/mypage/following");
    const row = page.getByRole("button", { name: `${seller.nickname}をフォロー` });
    await expect(row).toHaveAttribute("aria-pressed", "true");
    await row.click();
    await expect(row).toHaveAttribute("aria-pressed", "false");
    await expect
      .poll(async () => (await sql<{ n: number }>(`select count(*)::int as n from public.follows where follower_id = ${lit(buyer.id)}`))[0]!.n)
      .toBe(0);

    await page.goto("/timeline");
    await expect(page.getByText(body, { exact: true })).toHaveCount(0);
    await expect(page.getByText("🌸 まだ誰もフォローしていません")).toBeVisible();
  });
});
