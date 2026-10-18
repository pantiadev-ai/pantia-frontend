/* 担当 C: 通報（出品・利用者・つぶやき・メッセージ／理由／二重の通報）とブロック（見えなくなる・送れない・解除） */
import { BASE_URL, lit, loginAs, seedListing, sql, userClient } from "./_db";
import { acceptDialogs, freshBuyer, freshSeller, rnd, seedMessage, seedPost, seedThread } from "./_c";
import { expect, test } from "./_fixtures";
import type { Page } from "@playwright/test";

const DONE = "通報を受け付けました。運営が確認します。ご協力ありがとうございます。";

type Report = { target_type: string; target_owner: string; reason: string; detail: string };
async function reportsBy(reporterId: string, targetId: string): Promise<Report[]> {
  return sql<Report>(
    `select target_type, target_owner, reason, detail from public.reports where reporter_id = ${lit(reporterId)} and target_id = ${lit(targetId)}`,
  );
}

/** 開いた通報の小窓で、理由を選んで送る */
async function submitReport(page: Page, reason?: string, detail?: string) {
  const dialog = page.getByRole("dialog", { name: "通報する" });
  await expect(dialog).toBeVisible();
  if (reason) await dialog.getByLabel("理由").selectOption(reason);
  if (detail !== undefined) await dialog.getByLabel(/^詳しい内容/).fill(detail);
  await dialog.getByRole("button", { name: "通報する" }).click();
  return dialog;
}

test.describe("通報", () => {
  test("商品を通報すると受け付けられ、同じ商品をもう一度通報すると『通報済み』と出る", async ({ page, context }) => {
    const seller = await freshSeller("sa-item");
    const buyer = await freshBuyer("sa-item");
    const listingId = await seedListing(seller);
    await loginAs(context, buyer);
    await page.goto(`/items/${listingId}`);
    await page.getByRole("button", { name: "🚩 この商品を通報する" }).click();
    const dialog = await submitReport(page, "spam");
    await expect(dialog.getByRole("status")).toHaveText(DONE);
    expect(await reportsBy(buyer.id, listingId)).toEqual([{ target_type: "listing", target_owner: seller.id, reason: "spam", detail: "" }]);

    // 閉じて開き直すと、入力の欄に戻る（受け付けの文のまま残らない）
    await dialog.getByRole("button", { name: "閉じる" }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: "🚩 この商品を通報する" }).click();
    const again = await submitReport(page);
    await expect(again.getByRole("alert")).toHaveText("この内容はすでに通報済みです。ご協力ありがとうございます。");
    expect(await reportsBy(buyer.id, listingId)).toHaveLength(1);
  });

  test("理由を『その他』にして内容を書かないと通報できず、書くと利用者を通報できる", async ({ page, context }) => {
    const seller = await freshSeller("sa-user");
    const buyer = await freshBuyer("sa-user");
    await loginAs(context, buyer);
    await page.goto(`/sellers/${seller.id}`);
    await page.getByRole("button", { name: "🚩 このユーザーを通報する" }).click();
    const dialog = await submitReport(page, "other");
    await expect(dialog.getByRole("alert")).toHaveText("「その他」のときは、詳しい内容を書いてください。");
    expect(await reportsBy(buyer.id, seller.id)).toHaveLength(0);

    const detail = `プロフィールの写真が他人の物に見えます ${rnd()}`;
    const ok = await submitReport(page, undefined, detail);
    await expect(ok.getByRole("status")).toHaveText(DONE);
    expect(await reportsBy(buyer.id, seller.id)).toEqual([{ target_type: "user", target_owner: seller.id, reason: "other", detail }]);
  });

  test("つぶやきの『通報』を押して送ると、そのつぶやきの通報が受け付けられる", async ({ page, context }) => {
    const seller = await freshSeller("sa-post");
    const buyer = await freshBuyer("sa-post");
    const id = await seedPost(seller, `通報されるつぶやき ${rnd()}`);
    await loginAs(context, buyer);
    await page.goto(`/tweets/${id}`);
    await page.getByRole("button", { name: "通報", exact: true }).click();
    const dialog = await submitReport(page, "harassment");
    await expect(dialog.getByRole("status")).toHaveText(DONE);
    expect(await reportsBy(buyer.id, id)).toEqual([{ target_type: "post", target_owner: seller.id, reason: "harassment", detail: "" }]);
  });

  test("会話の中で相手のメッセージを通報でき、自分のメッセージには通報のボタンが出ない", async ({ page, context }) => {
    const seller = await freshSeller("sa-msg");
    const buyer = await freshBuyer("sa-msg");
    const tid = await seedThread(seller, buyer);
    const theirs = await seedMessage(tid, seller, `相手の言葉 ${rnd()}`);
    await seedMessage(tid, buyer, `自分の言葉 ${rnd()}`);
    await loginAs(context, buyer);
    await page.goto(`/messages/${tid}`);
    await expect(page.locator(".msg-row")).toHaveCount(2);
    await expect(page.locator(".msg-row.mine").getByRole("button", { name: "通報" })).toHaveCount(0);
    await page.locator(".msg-row:not(.mine)").getByRole("button", { name: "通報" }).click();
    const dialog = await submitReport(page, "fraud");
    await expect(dialog.getByRole("status")).toHaveText(DONE);
    expect(await reportsBy(buyer.id, theirs)).toEqual([{ target_type: "message", target_owner: seller.id, reason: "fraud", detail: "" }]);
  });

  test("開いている間に消えたつぶやきを通報すると、商品の話ではない文で断られる", async ({ page, context }) => {
    const seller = await freshSeller("sa-gone");
    const buyer = await freshBuyer("sa-gone");
    const id = await seedPost(seller, `すぐ消えるつぶやき ${rnd()}`);
    await loginAs(context, buyer);
    await page.goto(`/tweets/${id}`);
    await page.getByRole("button", { name: "通報", exact: true }).click();
    await sql(`delete from public.posts where id = ${lit(id)}`);
    const dialog = await submitReport(page, "spam");
    const alert = dialog.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect.soft(alert).not.toContainText("商品");
    expect(await reportsBy(buyer.id, id)).toHaveLength(0);
  });

  test("通報の記録は利用者の権限では読めず、自分自身の通報や、決まりに無い理由・501字の内容は断られる", async () => {
    const seller = await freshSeller("sa-perm");
    const other = await freshBuyer("sa-perm");
    const db = await userClient(seller);
    const read = await db.from("reports").select("id").limit(1);
    expect(read.data ?? []).toHaveLength(0);
    const self = await db.rpc("file_report", { p_type: "user", p_target: seller.id, p_reason: "spam", p_detail: "" });
    expect(self.error?.message ?? "").toMatch(/unavailable/);
    expect(await reportsBy(seller.id, seller.id)).toHaveLength(0);

    const badReason = await db.rpc("file_report", { p_type: "user", p_target: other.id, p_reason: "bogus", p_detail: "" });
    expect(badReason.error?.message ?? "").toMatch(/bad_report/);
    const tooLong = await db.rpc("file_report", { p_type: "user", p_target: other.id, p_reason: "spam", p_detail: "あ".repeat(501) });
    expect(tooLong.error?.message ?? "").toMatch(/bad_report/);
    expect(await reportsBy(seller.id, other.id)).toHaveLength(0);
  });
});

test.describe("ブロック", () => {
  test.use({ consoleAllow: [/status of 404/] });

  test("出品者をブロックすると商品・つぶやき・送るボタンが消えてフォローも外れ、設定から解除すると元に戻る", async ({ page, context }) => {
    const seller = await freshSeller("sa-blk");
    const buyer = await freshBuyer("sa-blk");
    const title = `ブロックの確かめ ${rnd()}`;
    const listingId = await seedListing(seller, { title });
    const body = `ブロックされるつぶやき ${rnd()}`;
    const postId = await seedPost(seller, body);
    await sql(`insert into public.follows (follower_id, seller_id) values (${lit(buyer.id)}, ${lit(seller.id)})`);
    await loginAs(context, buyer);
    acceptDialogs(page);

    await page.goto(`/sellers/${seller.id}?tab=items`);
    await expect(page.getByText(title)).toBeVisible();
    await page.getByRole("button", { name: "🚫 ブロックする" }).click();
    await expect(page.getByText("このユーザーをブロックしているため、表示できません").first()).toBeVisible();
    await expect(page.getByText(title)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "✉ メッセージを送る" })).toHaveCount(0);
    await expect
      .poll(async () => (await sql<{ n: number }>(`select count(*)::int as n from public.follows where follower_id = ${lit(buyer.id)}`))[0]!.n)
      .toBe(0);

    expect((await page.goto(`/items/${listingId}`))?.status()).toBe(404);
    expect((await page.goto(`/tweets/${postId}`))?.status()).toBe(404);
    await page.goto(`/tweets?q=${encodeURIComponent(body)}`);
    await expect(page.getByText(body, { exact: true })).toHaveCount(0);

    // 設定の「ブロックした人」から外す
    await page.goto("/settings");
    const row = page.locator(".setting-row", { hasText: seller.nickname });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "ブロック解除" }).click();
    // 解除すると画面が読み直され、一覧から消える
    await expect(row).toHaveCount(0);
    await expect(page.getByText("ブロックしている人はいません。")).toBeVisible();
    await expect
      .poll(async () => (await sql<{ n: number }>(`select count(*)::int as n from public.blocks where blocker_id = ${lit(buyer.id)}`))[0]!.n)
      .toBe(0);

    await page.goto(`/sellers/${seller.id}?tab=items`);
    await expect(page.getByText(title)).toBeVisible();
    await expect(page.getByRole("button", { name: "✉ メッセージを送る" })).toBeVisible();
    expect((await page.goto(`/tweets/${postId}`))?.status()).toBe(200);
  });

  test("出品者が会話の中で購入者をブロックすると、購入者からは出品者の商品が見えず、会話も始められない", async ({ page, context, browser }) => {
    const seller = await freshSeller("sa-blk2");
    const buyer = await freshBuyer("sa-blk2");
    const title = `見えなくなる商品 ${rnd()}`;
    const listingId = await seedListing(seller, { title });
    const tid = await seedThread(seller, buyer);
    await seedMessage(tid, buyer, `こんにちは ${rnd()}`);

    const sellerCtx = await browser.newContext();
    try {
      await loginAs(sellerCtx, seller);
      const sp = await sellerCtx.newPage();
      sp.on("dialog", (d) => void d.accept());
      await sp.goto(`${BASE_URL}/messages/${tid}`);
      await sp.getByRole("button", { name: "この相手をブロック" }).click();
      await expect(sp.getByText("この相手をブロックしています。送るには、上の 🚫 でブロックを外してください。")).toBeVisible();
    } finally {
      await sellerCtx.close();
    }

    await loginAs(context, buyer);
    await page.goto(`/sellers/${seller.id}?tab=items`);
    await expect(page.getByText("このユーザーの出品とつぶやきは表示できません").first()).toBeVisible();
    await expect(page.getByText(title)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "✉ メッセージを送る" })).toHaveCount(0);
    expect((await page.goto(`/items/${listingId}`))?.status()).toBe(404);

    const db = await userClient(buyer);
    const open = await db.rpc("open_thread", { p_other: seller.id });
    expect(open.error?.message ?? "").toMatch(/unavailable/);
    // ブロックの記録は、した本人にしか見えない
    const peek = await db.from("blocks").select("blocker_id").eq("blocker_id", seller.id);
    expect(peek.data ?? []).toHaveLength(0);
  });
});
