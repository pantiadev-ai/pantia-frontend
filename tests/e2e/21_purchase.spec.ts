/* お気に入り・カート・購入・注文の流れ（担当 B）。
   払うのは PAYMENT_MODE=mock の「テスト決済」（/checkout/mock?group=…）。 */
import type { Page } from "@playwright/test";
import { cast, freshUser, lit, loginAs, seedListing, sql, userClient, type Cast } from "./_db";
import { e2eEnv } from "./_env";
import {
  ADDRESS,
  formAlert,
  freshPair,
  listingStatus,
  moneySettings,
  orderRow,
  rand,
  seedCompleted,
  seedPaidOrder,
  seedPendingOrder,
  seedShipped,
} from "./_b";
import { expect, test } from "./_fixtures";

const cron = (path: string) => ({ path, headers: { authorization: `Bearer ${e2eEnv().cronSecret}` } });

/** カートに直に入れる（下ごしらえ） */
async function seedCart(user: Cast, listingId: string): Promise<void> {
  await sql(`insert into public.cart_items (user_id, listing_id) values (${lit(user.id)}, ${lit(listingId)}) on conflict do nothing`);
}

async function cartCount(user: Cast): Promise<number> {
  const [r] = await sql<{ n: number }>(`select count(*)::int as n from public.cart_items where user_id = ${lit(user.id)}`);
  return r.n;
}

async function favCount(user: Cast, listingId: string): Promise<number> {
  const [r] = await sql<{ n: number }>(
    `select count(*)::int as n from public.favorites where user_id = ${lit(user.id)} and listing_id = ${lit(listingId)}`,
  );
  return r.n;
}

/** お届け先を入れて、同意して、注文を確定する */
async function fillAndPlace(page: Page): Promise<void> {
  await page.getByLabel("お名前").fill(ADDRESS.name);
  await page.getByLabel("郵便番号").fill(ADDRESS.postal);
  await page.getByLabel("都道府県").selectOption(ADDRESS.prefecture);
  await page.getByLabel("市区町村・番地").fill(ADDRESS.address1);
  await page.getByLabel("電話番号").fill(ADDRESS.phone);
  await page.getByRole("checkbox", { name: /を確かめました/ }).check();
  await page.getByRole("button", { name: "注文を確定してお支払いへ" }).click();
}

/** 注文の詳細の、状態の札 */
const statusChip = (page: Page, label: string) => page.locator("span.chip", { hasText: label });

test.describe("お気に入り", () => {
  test("購入者が商品ページでお気に入りに入れると一覧に出て、外すと消える", async ({ page, context }) => {
    const seller = await freshUser("b-sel", { role: "seller" });
    const title = `E2Eお気に入り ${rand()}`;
    const id = await seedListing(seller, { title });
    const buyer = await freshUser("b-buy", { role: "buyer" });
    await loginAs(context, buyer);

    await page.goto(`/items/${id}`);
    const heart = page.getByRole("button", { name: "お気に入り" });
    await expect(heart).toHaveAttribute("aria-pressed", "false");
    await heart.click();
    await expect(heart).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => favCount(buyer, id)).toBe(1);

    await page.goto("/mypage/favorites");
    // 写真と題名の2つのリンクが同じ商品ページへ向く
    await expect(page.getByRole("link", { name: title })).toHaveCount(2);
    await expect(page.getByRole("link", { name: title }).first()).toHaveAttribute("href", `/items/${id}`);
    await page.getByRole("button", { name: "お気に入り" }).click();
    await expect.poll(() => favCount(buyer, id)).toBe(0);
    await page.reload();
    await expect(page.getByText("お気に入りに入れた商品は、まだありません。")).toBeVisible();
  });

  test("自分の出品にはお気に入りのボタンが出ず、直に入れても断られる", async ({ page, context }) => {
    const seller = await freshUser("b-sel", { role: "seller" });
    const id = await seedListing(seller);
    await loginAs(context, seller);
    await page.goto(`/items/${id}`);
    await expect(page.getByText("あなたの出品です。")).toBeVisible();
    await expect(page.getByRole("button", { name: "お気に入り" })).toHaveCount(0);

    const db = await userClient(seller);
    const { error } = await db.from("favorites").insert({ listing_id: id });
    expect(error).not.toBeNull();
    expect(await favCount(seller, id)).toBe(0);
  });
});

test.describe("カート", () => {
  test("購入者が商品をカートに入れると一覧に出て、削除すると空になる", async ({ page, context }) => {
    const { seller, buyer } = await freshPair();
    const title = `E2Eカート ${rand()}`;
    const id = await seedListing(seller, { title });
    await loginAs(context, buyer);
    await page.goto(`/items/${id}`);
    await page.getByRole("button", { name: "🛍 カートに入れる" }).click();
    await expect(page.getByRole("status").filter({ hasText: "カートに入れました。" })).toBeVisible();
    expect(await cartCount(buyer)).toBe(1);

    await page.getByRole("link", { name: "カートを見る" }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByRole("checkbox", { name: `${title}を購入する` })).toBeChecked();
    await page.getByRole("button", { name: "削除" }).click();
    await expect(page.getByText("カートは空です。")).toBeVisible();
    expect(await cartCount(buyer)).toBe(0);
  });

  test("出品者は自分の出品もほかの人の出品もカートに入れられない", async ({ page, context }) => {
    const seller = await freshUser("b-sel", { role: "seller" });
    const own = await seedListing(seller);
    await loginAs(context, seller);
    // ① 自分の出品: ボタンが無い
    await page.goto(`/items/${own}`);
    await expect(page.getByText("あなたの出品です。")).toBeVisible();
    await expect(page.getByRole("button", { name: "🛍 カートに入れる" })).toHaveCount(0);
    // ① ほかの出品者の出品: 出品者のアカウントでは買えない
    const other = await seedListing(await cast("seller2"));
    await page.goto(`/items/${other}`);
    await expect(page.getByText("出品者のアカウントでは購入できません。購入には購入者のアカウントが必要です。")).toBeVisible();
    await expect(page.getByRole("button", { name: "🛍 カートに入れる" })).toHaveCount(0);
    // ③ 自分の出品を直にカートへ入れても断られる
    const db = await userClient(seller);
    const { error } = await db.from("cart_items").insert({ listing_id: own });
    expect(error).not.toBeNull();
    expect(await cartCount(seller)).toBe(0);
  });
});

test.describe("購入の手続き", () => {
  test("同意や入力が足りないまま注文を確定すると、誤りが出て注文は作られない", async ({ page, context }) => {
    const { seller, buyer } = await freshPair();
    const id = await seedListing(seller);
    await seedCart(buyer, id);
    await loginAs(context, buyer);
    await page.goto(`/checkout?items=${id}`);

    // 支払い方法は、使える「テスト決済」1つだけで、初めから選ばれている
    const methods = page.getByRole("radiogroup", { name: "お支払い方法" }).getByRole("radio");
    await expect(methods).toHaveCount(1);
    await expect(page.getByRole("radio", { name: /テスト決済/ })).toBeChecked();

    const submit = page.getByRole("button", { name: "注文を確定してお支払いへ" });
    await submit.click();
    await expect(formAlert(page)).toHaveText("利用規約と特定商取引法に基づく表記を確かめて、チェックを入れてください。");

    await page.getByRole("checkbox", { name: /を確かめました/ }).check();
    await submit.click();
    await expect(formAlert(page)).toHaveText("お届け先を確かめてください。");

    // 郵便番号の形が違う
    await page.getByLabel("お名前").fill(ADDRESS.name);
    await page.getByLabel("郵便番号").fill("12-34");
    await page.getByLabel("都道府県").selectOption(ADDRESS.prefecture);
    await page.getByLabel("市区町村・番地").fill(ADDRESS.address1);
    await page.getByLabel("電話番号").fill(ADDRESS.phone);
    await submit.click();
    await expect(formAlert(page)).toHaveText("お届け先を確かめてください。");

    const [r] = await sql<{ n: number }>(`select count(*)::int as n from public.orders where buyer_id = ${lit(buyer.id)}`);
    expect(r.n).toBe(0);
    expect(await listingStatus(id)).toBe("published");
  });

  test("カートから注文してテスト決済で払うと、支払い済みになり商品は売り切れ・カートは空になる", async ({ page, context }) => {
    const { seller, buyer } = await freshPair();
    const title = `E2E購入 ${rand()}`;
    const id = await seedListing(seller, { title, price: 3500 });
    await loginAs(context, buyer);

    await page.goto(`/items/${id}`);
    await page.getByRole("button", { name: "🛍 カートに入れる" }).click();
    await expect(page.getByRole("status").filter({ hasText: "カートに入れました。" })).toBeVisible();
    await page.goto("/cart");
    await page.getByRole("button", { name: "購入手続きへ" }).click();
    await expect(page).toHaveURL(new RegExp(`/checkout\\?items=${id}$`));

    await fillAndPlace(page);
    await expect(page).toHaveURL(/\/checkout\/mock\?group=[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "テスト決済" })).toBeVisible();
    const group = new URL(page.url()).searchParams.get("group")!;
    const [pending] = await sql<{ id: string; status: string; total: number }>(
      `select id, status, total from public.orders where group_id = ${lit(group)}`,
    );
    expect(pending.status).toBe("pending");
    expect(pending.total).toBeGreaterThanOrEqual(3500);

    await page.getByRole("button", { name: "支払う（テスト）" }).click();
    await expect(page).toHaveURL(new RegExp(`/orders\\?group=${group}`));
    await expect(page.getByText(/お支払いを確認しました。/)).toBeVisible();

    expect((await orderRow(pending.id)).status).toBe("paid");
    expect(await listingStatus(id)).toBe("sold");
    expect(await cartCount(buyer)).toBe(0);
    // お届け先が注文に結ばれている
    const [addr] = await sql<{ name: string; postal: string }>(
      `select name, postal from public.order_addresses where order_id = ${lit(pending.id)}`,
    );
    expect(addr).toEqual({ name: ADDRESS.name, postal: ADDRESS.postal });
  });

  test("ほかの人が支払い待ちの商品は、注文を確定しようとしても断られ、売れたあとはカートで売り切れと出る", async ({ page, context }) => {
    const { seller, buyer: first } = await freshPair();
    const second = await freshUser("b-buy", { role: "buyer" });
    const id = await seedListing(seller);
    await seedCart(second, id);
    const firstOrder = await seedPendingOrder(first, [id]);

    await loginAs(context, second);
    await page.goto(`/checkout?items=${id}`);
    await fillAndPlace(page);
    await expect(formAlert(page)).toHaveText("この商品は、ほかの方が購入の手続き中です。");
    await expect(page).toHaveURL(/\/checkout\?items=/);
    const [n] = await sql<{ n: number }>(
      `select count(*)::int as n from public.orders where listing_id = ${lit(id)} and status <> 'cancelled'`,
    );
    expect(n.n).toBe(1);

    // 先の人が払うと売り切れ。後の人のカートでは買えない
    await sql(`select public.mark_group_paid(${lit(firstOrder.groupId)}, 'e2e', ${firstOrder.total})`);
    await page.goto("/cart");
    await expect(page.getByText("売り切れました。")).toBeVisible();
    await page.goto(`/checkout?items=${id}`);
    await expect(page).toHaveURL(/\/cart$/);
  });

  test("テスト決済の画面で支払いをやめると、注文は取り消され商品はまた買える", async ({ page, context }) => {
    const { seller, buyer } = await freshPair();
    const id = await seedListing(seller);
    await seedCart(buyer, id);
    await loginAs(context, buyer);
    await page.goto(`/checkout?items=${id}`);
    await fillAndPlace(page);
    await expect(page).toHaveURL(/\/checkout\/mock\?group=/);
    const group = new URL(page.url()).searchParams.get("group")!;
    await page.getByRole("button", { name: "支払いをやめる" }).click();
    await expect(page).toHaveURL(/\/cart$/);
    const [o] = await sql<{ status: string; cancel_reason: string }>(
      `select status, cancel_reason from public.orders where group_id = ${lit(group)}`,
    );
    expect(o).toEqual({ status: "cancelled", cancel_reason: "buyer_cancelled" });
    expect(await listingStatus(id)).toBe("published");
  });

  test("支払いの期限が過ぎた注文は、期限切れの定期処理で取り消され、ほかの人がまた買える", async ({ page, context, request }) => {
    const { seller, buyer } = await freshPair();
    const next = await freshUser("b-buy", { role: "buyer" });
    const id = await seedListing(seller);
    const o = await seedPendingOrder(buyer, [id]);
    await sql(`update public.orders set expires_at = now() - interval '1 minute' where group_id = ${lit(o.groupId)}`);

    // 鍵なしでは動かない
    expect((await request.get("/api/cron/expire-orders")).status()).toBe(401);
    const c = cron("/api/cron/expire-orders");
    expect((await request.get(c.path, { headers: c.headers })).status()).toBe(200);
    const row = await orderRow(o.orderIds[0]);
    expect(row.status).toBe("cancelled");
    expect(row.cancel_reason).toBe("expired");

    // 別の購入者が「今すぐ購入する」から払う画面まで進める
    await loginAs(context, next);
    await page.goto(`/items/${id}`);
    await page.getByRole("button", { name: "💳 今すぐ購入する" }).click();
    await expect(page).toHaveURL(new RegExp(`/checkout\\?items=${id}$`));
    await fillAndPlace(page);
    await expect(page).toHaveURL(/\/checkout\/mock\?group=/);
  });

  test("本人確認が済んでいない購入者は、カートには入れられるが注文は確定できない", async ({ page, context }) => {
    const seller = await freshUser("b-sel", { role: "seller" });
    const buyer = await freshUser("b-buy", { role: "buyer", kyc: "unsubmitted" });
    const id = await seedListing(seller);
    await loginAs(context, buyer);
    await page.goto(`/items/${id}`);
    await expect(page.getByText("購入には本人確認（18歳以上の確認）が必要です。カートには先に入れておけます。")).toBeVisible();
    await expect(page.getByRole("link", { name: "🛡 本人確認をする" })).toBeVisible();
    await expect(page.getByRole("button", { name: "💳 今すぐ購入する" })).toHaveCount(0);
    await page.getByRole("button", { name: "🛍 カートに入れる" }).click();
    await expect(page.getByRole("status").filter({ hasText: "カートに入れました。" })).toBeVisible();

    await page.goto(`/checkout?items=${id}`);
    await expect(page.getByText("購入は、本人確認（18歳以上の確認）が済んだ購入者のアカウントでできます。")).toBeVisible();
    await expect(page.getByRole("button", { name: "注文を確定してお支払いへ" })).toBeDisabled();

    // 注文を作る関数は、利用者からは呼べない（DB の側でも本人確認を見る）
    const db = await userClient(buyer);
    const { error } = await db.rpc("create_checkout", {
      p_buyer: buyer.id,
      p_items: [{ listing_id: id, options: {} }],
      p_method: "mock",
      p_address: ADDRESS,
    });
    expect(error).not.toBeNull();
    await expect(seedPendingOrder(buyer, [id])).rejects.toThrow();
    expect(await listingStatus(id)).toBe("published");
  });
});

test.describe("注文の流れ", () => {
  test("出品者が発送準備→発送を連絡し、購入者が受け取るとレビューを書けて取引完了になる", async ({ page, context }) => {
    const { seller, buyer } = await freshPair();
    const id = await seedListing(seller, { price: 4000 });
    const { orderId } = await seedPaidOrder(buyer, id);
    page.on("dialog", (d) => void d.accept());

    await loginAs(context, seller);
    await page.goto(`/orders/${orderId}`);
    await expect(statusChip(page, "新規注文")).toBeVisible();
    await page.getByRole("button", { name: "発送の準備を始める" }).click();
    await expect(statusChip(page, "発送準備中")).toBeVisible();

    // 配送会社を選ばずに送ると誤り
    await page.getByLabel("追跡番号").fill("E2E-12345");
    await page.getByRole("button", { name: "発送を連絡する" }).click();
    await expect(formAlert(page)).toHaveText("配送会社を選んでください。");
    await page.getByLabel("配送会社").selectOption("yamato");
    await page.getByRole("button", { name: "発送を連絡する" }).click();
    await expect(statusChip(page, "発送済み")).toBeVisible();
    const [shipped] = await sql<{ status: string; tracking_no: string; carrier: string }>(
      `select status, tracking_no, carrier from public.orders where id = ${lit(orderId)}`,
    );
    expect(shipped).toEqual({ status: "shipped", tracking_no: "E2E-12345", carrier: "yamato" });

    await loginAs(context, buyer);
    await page.goto(`/orders/${orderId}`);
    await page.getByRole("button", { name: "受け取りました" }).click();
    await expect(statusChip(page, "取引完了")).toBeVisible();
    const row = await orderRow(orderId);
    expect(row.status).toBe("completed");
    expect(row.auto_completed).toBe(false);
    // 売上が台帳に入る
    const [sale] = await sql<{ amount: number }>(
      `select amount from public.ledger_entries where user_id = ${lit(seller.id)} and order_id = ${lit(orderId)} and kind = 'sale'`,
    );
    expect(sale.amount).toBe(row.seller_net);

    await page.getByRole("radio", { name: "星5つ" }).click();
    await page.getByLabel("感想（任意・500文字まで）").fill("E2E のレビューです。");
    await page.getByRole("button", { name: "レビューを送る" }).click();
    await expect(page.getByRole("heading", { name: "あなたのレビュー" })).toBeVisible();
    const [rv] = await sql<{ rating: number; body: string }>(`select rating, body from public.reviews where order_id = ${lit(orderId)}`);
    expect(rv).toEqual({ rating: 5, body: "E2E のレビューです。" });
  });

  test("発送から自動完了の日数が過ぎた注文は、自動完了の定期処理で取引完了になる", async ({ page, context, request }) => {
    const { seller, buyer } = await freshPair();
    const id = await seedListing(seller);
    const { orderId } = await seedPaidOrder(buyer, id);
    const { autoDays } = await moneySettings();
    await seedShipped(orderId, autoDays + 1);

    expect((await request.get("/api/cron/auto-complete")).status()).toBe(401);
    const c = cron("/api/cron/auto-complete");
    expect((await request.get(c.path, { headers: c.headers })).status()).toBe(200);
    const row = await orderRow(orderId);
    expect(row.status).toBe("completed");
    expect(row.auto_completed).toBe(true);
    const [sale] = await sql<{ n: number }>(
      `select count(*)::int as n from public.ledger_entries where order_id = ${lit(orderId)} and kind = 'sale'`,
    );
    expect(sale.n).toBe(1);

    await loginAs(context, buyer);
    await page.goto(`/orders/${orderId}`);
    await expect(page.getByText("（自動で完了）")).toBeVisible();
  });

  test("出品者が支払い済みの注文を取り消すと、キャンセル・返金済みになり商品は非公開に戻る", async ({ page, context }) => {
    const { seller, buyer } = await freshPair();
    const id = await seedListing(seller);
    const { orderId } = await seedPaidOrder(buyer, id);
    expect(await listingStatus(id)).toBe("sold");
    page.on("dialog", (d) => void d.accept());

    await loginAs(context, seller);
    await page.goto(`/orders/${orderId}`);
    await page.getByRole("button", { name: "この注文を取り消す（在庫切れなど）" }).click();
    // 理由なしでは取り消せない
    await page.getByRole("button", { name: "取り消して返金する" }).click();
    await expect(formAlert(page)).toHaveText("取り消す理由を書いてください。");
    await page.getByLabel("取り消す理由").fill("E2E の在庫切れ");
    await page.getByRole("button", { name: "取り消して返金する" }).click();
    await expect(statusChip(page, "キャンセル")).toBeVisible();

    await expect.poll(async () => (await orderRow(orderId)).refunded_at !== null).toBe(true);
    const row = await orderRow(orderId);
    expect(row.status).toBe("cancelled");
    expect(await listingStatus(id)).toBe("private");

    await loginAs(context, buyer);
    await page.goto(`/orders/${orderId}`);
    await expect(page.getByText(/この注文は取り消されました/)).toBeVisible();
    await expect(page.getByText(/に返金しました。/)).toBeVisible();
  });
});

test.describe("注文の見え方と権限", () => {
  test.use({ consoleAllow: [/status of 404/] });

  test("取引に関係ない人が注文を開くと404で、直に読んでも0件・操作は断られる", async ({ page, context }) => {
    const { seller, buyer } = await freshPair();
    const id = await seedListing(seller);
    const { orderId, groupId } = await seedPaidOrder(buyer, id);
    const stranger = await cast("buyer2");
    await loginAs(context, stranger);
    expect((await page.goto(`/orders/${orderId}`))?.status()).toBe(404);
    expect((await page.goto(`/checkout/mock?group=${groupId}`))?.status()).toBe(404);

    const db = await userClient(stranger);
    const { data } = await db.from("orders").select("id").eq("id", orderId);
    expect(data ?? []).toHaveLength(0);
    const { data: addr } = await db.from("order_addresses").select("order_id").eq("order_id", orderId);
    expect(addr ?? []).toHaveLength(0);
    const { error: e1 } = await db.rpc("complete_order", { p_order: orderId });
    expect(e1).not.toBeNull();

    const other = await userClient(await cast("seller2"));
    const { error: e2 } = await other.rpc("seller_cancel_order", { p_order: orderId, p_reason: "乗っ取り" });
    expect(e2).not.toBeNull();
    expect((await orderRow(orderId)).status).toBe("paid");
  });

  test("支払い待ちの注文は、出品者が開いても404になる", async ({ page, context }) => {
    const { seller, buyer } = await freshPair();
    const id = await seedListing(seller);
    const { orderIds } = await seedPendingOrder(buyer, [id]);
    await loginAs(context, seller);
    expect((await page.goto(`/orders/${orderIds[0]}`))?.status()).toBe(404);
  });

  test("出品者には購入者の名前が伏せ字で、お届け先は取引中だけ見え、完了後は消える", async ({ page, context }) => {
    const nickname = `kb${rand()}`;
    const { seller, buyer } = await freshPair({ buyerNickname: nickname });
    const id = await seedListing(seller);
    const { orderId } = await seedPaidOrder(buyer, id);

    await loginAs(context, seller);
    await page.goto(`/orders/${orderId}`);
    await expect(page.getByText("K***さん").first()).toBeVisible();
    await expect(page.getByText(nickname)).toHaveCount(0);
    await expect(page.getByText(buyer.email)).toHaveCount(0);
    await expect(page.getByText(`〒${ADDRESS.postal}`)).toBeVisible();
    await expect(page.getByText(`${ADDRESS.name} 様`)).toBeVisible();
    await expect(page.getByText("販売手数料")).toBeVisible();
    await expect(page.getByText("売上になる額")).toBeVisible();

    await seedCompleted(orderId);
    await page.reload();
    await expect(page.getByText("取引が終わったため、お届け先は表示されません。")).toBeVisible();
    await expect(page.getByText(`〒${ADDRESS.postal}`)).toHaveCount(0);
    const db = await userClient(seller);
    const { data } = await db.from("order_addresses").select("order_id").eq("order_id", orderId);
    expect(data ?? []).toHaveLength(0);
  });
});
