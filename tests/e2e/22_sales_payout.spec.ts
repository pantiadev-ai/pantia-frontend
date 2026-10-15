/* 売上・振込（担当 B）。売上の数字は注文の DB と照らし、振込は口座・金額の誤り・二重の申請を確かめる。
   サイトの設定（手数料率・最低振込額など）は読むだけで変えない。 */
import type { Page } from "@playwright/test";
import { cast, freshUser, lit, loginAs, seedListing, sql, userClient, type Cast } from "./_db";
import { formAlert, freshPair, moneySettings, rand, seedBalance, seedBank, seedCompleted, seedPaidOrder, seedPendingOrder } from "./_b";
import { expect, test } from "./_fixtures";

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

/** 売上のカード（ラベルで探す） */
const card = (page: Page, label: string) => page.locator(".ss-card", { has: page.locator(".ss-label", { hasText: label }) });

async function balanceOf(user: Cast): Promise<number> {
  const [r] = await sql<{ n: number }>(`select coalesce(sum(amount), 0)::int as n from public.ledger_entries where user_id = ${lit(user.id)}`);
  return r.n;
}

async function payoutsOf(user: Cast): Promise<{ amount: number; status: string }[]> {
  return sql<{ amount: number; status: string }>(`select amount, status from public.payouts where user_id = ${lit(user.id)}`);
}

/** 本人確認済み・口座あり・残高ありの出品者 */
async function readySeller(balance: number): Promise<Cast> {
  const seller = await freshUser("b-sel", { role: "seller" });
  await seedBank(seller);
  await seedBalance(seller, balance);
  return seller;
}

test.describe("売上の画面", () => {
  test("売上の画面の今月・累計・件数・残高が、注文と台帳の数字と合う", async ({ page, context }) => {
    const { seller, buyer } = await freshPair();
    const r = rand();
    const done = `E2E売上完了 ${r}`;
    const paid = `E2E売上支払済 ${r}`;
    const pend = `E2E売上支払待 ${r}`;
    const a = await seedListing(seller, { title: done, price: 3000 });
    const b = await seedListing(seller, { title: paid, price: 5000 });
    const c = await seedListing(seller, { title: pend, price: 7000 });
    const o1 = await seedPaidOrder(buyer, a);
    await seedCompleted(o1.orderId);
    await seedPaidOrder(buyer, b);
    await seedPendingOrder(buyer, [c]);

    // 注文の DB から期待の数を出す（支払い前・取り消しは数えない）
    const rows = await sql<{ subtotal: number; fee: number; seller_net: number; fee_rate: string | number; status: string }>(
      `select subtotal, fee, seller_net, fee_rate, status from public.orders
       where seller_id = ${lit(seller.id)} and paid_at is not null and status <> 'cancelled'`,
    );
    expect(rows).toHaveLength(2);
    for (const o of rows) {
      expect(o.fee).toBe(Math.round(o.subtotal * Number(o.fee_rate)));
      expect(o.seller_net).toBe(o.subtotal - o.fee);
    }
    const sales = rows.reduce((s, o) => s + o.subtotal, 0);
    const net = rows.reduce((s, o) => s + o.seller_net, 0);
    expect(sales).toBe(8000);
    const completedNet = rows.find((o) => o.status === "completed")!.seller_net;
    expect(await balanceOf(seller)).toBe(completedNet);

    await loginAs(context, seller);
    await page.goto("/mypage/sales");
    await expect(card(page, "今月の売上").locator(".ss-num")).toHaveText(yen(sales));
    await expect(card(page, "今月の売上").locator(".ss-sub")).toHaveText(`手数料後 ${yen(net)}`);
    await expect(card(page, "累計売上").locator(".ss-num")).toHaveText(yen(sales));
    await expect(card(page, "累計売上").locator(".ss-sub")).toHaveText("2件の取引");
    await expect(card(page, "振込申請可能額").locator(".ss-num")).toHaveText(yen(completedNet));
    await expect(page.locator(".balance-big")).toHaveText(yen(completedNet));

    // 受けた注文: 支払い待ちは出ない
    await expect(page.locator(".order-item", { hasText: done })).toBeVisible();
    await expect(page.locator(".order-item", { hasText: paid })).toBeVisible();
    await expect(page.locator(".order-item", { hasText: pend })).toHaveCount(0);
    // 台帳: 売上の行が「+」で出る
    await expect(page.getByRole("cell", { name: `+ ${yen(completedNet)}` }).first()).toBeVisible();

    // タブで絞り込める
    const tabs = page.getByRole("navigation", { name: "注文の状態" });
    await tabs.getByRole("link", { name: "取引完了" }).click();
    await expect(page).toHaveURL(/status=completed/);
    await expect(page.locator(".order-item")).toHaveCount(1);
    await expect(page.locator(".order-item", { hasText: done })).toBeVisible();
    await tabs.getByRole("link", { name: "対応が必要" }).click();
    await expect(page).toHaveURL(/status=open/);
    await expect(page.locator(".order-item")).toHaveCount(1);
    await expect(page.locator(".order-item", { hasText: paid })).toBeVisible();
  });

  test("購入者が売上・振込の画面を開くと、マイページに回される", async ({ page, context }) => {
    await loginAs(context, await cast("buyer"));
    await page.goto("/mypage/sales");
    await expect(page).toHaveURL(/\/mypage$/);
    await page.goto("/payout");
    await expect(page).toHaveURL(/\/mypage$/);
  });
});

test.describe("振込口座", () => {
  test("口座の入力が違うと誤りが出て、正しく入れると下4桁だけが見える", async ({ page, context }) => {
    const seller = await freshUser("b-sel", { role: "seller" });
    await loginAs(context, seller);
    await page.goto("/payout");
    const save = page.getByRole("button", { name: "口座を保存する" });
    await save.click();
    await expect(formAlert(page)).toHaveText("銀行名と支店名を入れてください。");

    await page.getByLabel("銀行名").fill("テスト銀行");
    await page.getByLabel("支店名").fill("本店");
    await page.getByLabel("口座番号（7桁）").fill("12345");
    await save.click();
    await expect(formAlert(page)).toHaveText("口座番号は7桁の数字で入れてください。");

    await page.getByLabel("口座番号（7桁）").fill("7654321");
    await page.getByLabel("口座名義（カタカナ）").fill("Test Hanako");
    await save.click();
    await expect(formAlert(page)).toHaveText("口座名義はカタカナで入れてください（30字まで）。");

    // ひらがなはカタカナに直して保存される
    await page.getByLabel("口座名義（カタカナ）").fill("てすと はなこ");
    await save.click();
    await expect(page.getByText("テスト銀行 本店 普通 ****4321")).toBeVisible();
    await expect(page.getByText("名義：テスト ハナコ")).toBeVisible();
    const [row] = await sql<{ account_number: string; holder_kana: string }>(
      `select account_number, holder_kana from public.bank_accounts where user_id = ${lit(seller.id)}`,
    );
    expect(row).toEqual({ account_number: "7654321", holder_kana: "テスト ハナコ" });

    // 口座番号の全部は、画面にも埋め込みのデータにも出ない
    await page.reload();
    await expect(page.getByText("テスト銀行 本店 普通 ****4321")).toBeVisible();
    expect(await page.content()).not.toContain("7654321");
  });
});

test.describe("振込の申請", () => {
  test("残高が最低振込額に届かないと申請のボタンが押せず、直に申請しても断られる", async ({ page, context }) => {
    const { minPayout } = await moneySettings();
    const seller = await readySeller(Math.max(1, minPayout - 100));
    await loginAs(context, seller);
    await page.goto("/payout");
    await expect(page.getByText(`残高が最低振込額（${yen(minPayout)}）に届いていません。`)).toBeVisible();
    await expect(page.getByRole("button", { name: "🏦 振込申請する" })).toBeDisabled();

    const db = await userClient(seller);
    const { error } = await db.rpc("request_payout", { p_amount: Math.max(1, minPayout - 100) });
    expect(error?.message).toContain("below_min");
    expect(await payoutsOf(seller)).toHaveLength(0);
  });

  test("申請する金額が数字でない・最低額より少ない・残高より多いと、誤りが出て申請されない", async ({ page, context }) => {
    const { minPayout } = await moneySettings();
    const balance = minPayout + 5000;
    const seller = await readySeller(balance);
    await loginAs(context, seller);
    await page.goto("/payout");
    const amount = page.getByLabel("申請する金額（円）");
    const go = page.getByRole("button", { name: "🏦 振込申請する" });

    await amount.fill("たくさん");
    await go.click();
    await expect(formAlert(page)).toHaveText("申請する金額を数字で入れてください。");
    await amount.fill(String(minPayout - 1));
    await go.click();
    await expect(formAlert(page)).toHaveText(`${yen(minPayout)}から申請できます。`);
    await amount.fill(String(balance + 100));
    await go.click();
    await expect(formAlert(page)).toHaveText("残高より多い金額は申請できません。");

    // 直に残高より多く申請しても断られる
    const db = await userClient(seller);
    const { error } = await db.rpc("request_payout", { p_amount: balance + 100 });
    expect(error?.message).toContain("over_balance");
    expect(await payoutsOf(seller)).toHaveLength(0);
    expect(await balanceOf(seller)).toBe(balance);
  });

  test("正しい金額で申請すると申請中になり、残高が減り、次の申請は止まる", async ({ page, context }) => {
    const { minPayout, payoutFee } = await moneySettings();
    const balance = minPayout + 5000;
    const ask = minPayout + 1000;
    const seller = await readySeller(balance);
    await loginAs(context, seller);
    await page.goto("/payout");
    await page.getByLabel("申請する金額（円）").fill(String(ask));
    await page.getByRole("button", { name: "🏦 振込申請する" }).click();
    await expect(page.getByText("****4567（テスト ハナコ）")).toBeVisible();
    await page.getByRole("button", { name: "🏦 この内容で申請する" }).click();
    await expect(page.getByRole("status").filter({ hasText: "振込を申請しました。" })).toContainText(yen(ask - payoutFee));

    expect(await payoutsOf(seller)).toEqual([{ amount: ask, status: "requested" }]);
    expect(await balanceOf(seller)).toBe(balance - ask);

    await page.reload();
    await expect(card(page, "振込申請可能額").locator(".ss-num")).toHaveText(yen(balance - ask));
    await expect(page.getByText("申請中の振込があります。振込が終わってから、次の申請ができます。")).toBeVisible();
    await expect(page.getByRole("button", { name: "🏦 振込申請する" })).toBeDisabled();
    await expect(page.getByRole("row", { name: /申請中/ })).toContainText("****4567");
  });

  test("申請のボタンを素早く2回押しても、振込の申請は1件だけになる", async ({ page, context }) => {
    const { minPayout } = await moneySettings();
    const seller = await readySeller(minPayout + 5000);
    await loginAs(context, seller);
    await page.goto("/payout");
    await page.getByLabel("申請する金額（円）").fill(String(minPayout));
    await page.getByRole("button", { name: "🏦 振込申請する" }).click();
    await page.getByRole("button", { name: "🏦 この内容で申請する" }).dblclick();
    await expect(page.getByRole("status").filter({ hasText: "振込を申請しました。" })).toBeVisible();
    expect(await payoutsOf(seller)).toHaveLength(1);
  });

  test("同時に2回、直に申請しても、通るのは1件だけで残高は1回分しか減らない", async () => {
    const { minPayout } = await moneySettings();
    const balance = minPayout * 3;
    const seller = await readySeller(balance);
    const db = await userClient(seller);
    const results = await Promise.all([
      db.rpc("request_payout", { p_amount: minPayout }),
      db.rpc("request_payout", { p_amount: minPayout }),
    ]);
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expect(await payoutsOf(seller)).toHaveLength(1);
    expect(await balanceOf(seller)).toBe(balance - minPayout);
  });

  test("本人確認が済んでいない出品者は、振込を申請できない", async ({ page, context }) => {
    const { minPayout } = await moneySettings();
    const seller = await freshUser("b-sel", { role: "seller", kyc: "unsubmitted" });
    await seedBank(seller);
    await seedBalance(seller, minPayout + 1000);
    await loginAs(context, seller);
    await page.goto("/payout");
    await expect(page.getByText("振込の申請には本人確認が必要です。")).toBeVisible();
    await expect(page.getByRole("button", { name: "🏦 振込申請する" })).toBeDisabled();

    const db = await userClient(seller);
    const { error } = await db.rpc("request_payout", { p_amount: minPayout });
    expect(error).not.toBeNull();
    expect(await payoutsOf(seller)).toHaveLength(0);
  });
});
