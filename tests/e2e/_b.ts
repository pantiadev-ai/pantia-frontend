/* 担当 B（出品・購入・注文・売上・振込・本人確認・webhook）の下ごしらえ。
   注文は DB の関数（create_checkout・mark_group_paid・finish_order）を sql で呼んで作る。
   確かめたい操作そのもの（ボタン・入力）は、各試験が画面から行う。 */
import { randomBytes } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import sharp from "sharp";
import { freshUser, lit, sql, type Cast } from "./_db";

/** 名前に混ぜる乱数（ほかの人の物と見分ける） */
export const rand = (): string => randomBytes(3).toString("hex");

/** フォームの誤り表示（role=alert）。Next が画面遷移の読み上げに置く、空の role=alert は除く */
export function formAlert(page: Page): Locator {
  return page.getByRole("alert").and(page.locator(".pt-msg"));
}

/** 試験用のお届け先（実在しない番地） */
export const ADDRESS = {
  name: "試験 太郎",
  postal: "150-0001",
  prefecture: "東京都",
  address1: "渋谷区試験町1-2-3",
  address2: "",
  phone: "09012345678",
};

/** 本人確認済みの出品者と購入者を、使い捨てで1組作る */
export async function freshPair(opts: { buyerNickname?: string } = {}): Promise<{ seller: Cast; buyer: Cast }> {
  const [seller, buyer] = await Promise.all([
    freshUser("b-sel", { role: "seller" }),
    freshUser("b-buy", { role: "buyer", nickname: opts.buyerNickname }),
  ]);
  return { seller, buyer };
}

/** 運営の設定のうち、お金の数字（読むだけ。変えない） */
export async function moneySettings(): Promise<{ feeRate: number; minPayout: number; payoutFee: number; autoDays: number }> {
  const [r] = await sql<{ fee_rate: string | number; min_payout: number; payout_fee: number; auto_complete_days: number }>(
    "select fee_rate, min_payout, payout_fee, auto_complete_days from public.site_settings where id",
  );
  return {
    feeRate: Number(r.fee_rate),
    minPayout: Number(r.min_payout),
    payoutFee: Number(r.payout_fee),
    autoDays: Number(r.auto_complete_days),
  };
}

/** 支払い待ちの注文を作る（購入の手続きの DB 関数を直に呼ぶ）。group と注文の id を返す */
export async function seedPendingOrder(
  buyer: Cast,
  listingIds: string[],
): Promise<{ groupId: string; orderIds: string[]; total: number }> {
  const items = JSON.stringify(listingIds.map((id) => ({ listing_id: id, options: {} })));
  const [r] = await sql<{ group_id: string; total: number | string; ids: string }>(`
    with c as (
      select public.create_checkout(${lit(buyer.id)}, ${lit(items)}::jsonb, 'mock', ${lit(JSON.stringify(ADDRESS))}::jsonb) as r
    )
    select r ->> 'group_id' as group_id, (r ->> 'total')::int as total, (r -> 'order_ids')::text as ids from c`);
  return { groupId: r.group_id, orderIds: JSON.parse(r.ids) as string[], total: Number(r.total) };
}

/** 支払い済みの注文を1件作る */
export async function seedPaidOrder(buyer: Cast, listingId: string): Promise<{ orderId: string; groupId: string; total: number }> {
  const p = await seedPendingOrder(buyer, [listingId]);
  const [m] = await sql<{ r: string }>(`select public.mark_group_paid(${lit(p.groupId)}, 'e2e', ${p.total}) as r`);
  if (m.r !== "paid") throw new Error(`支払い済みにできませんでした: ${m.r}`);
  return { orderId: p.orderIds[0], groupId: p.groupId, total: p.total };
}

/** 発送済みにする（daysAgo 日前に発送した形） */
export async function seedShipped(orderId: string, daysAgo = 0): Promise<void> {
  await sql(`
    update public.orders
    set status = 'shipped', shipped_at = now() - make_interval(days => ${Number(daysAgo)}), carrier = 'yamato', tracking_no = 'E2E-0001'
    where id = ${lit(orderId)} and status in ('paid', 'preparing')`);
}

/** 取引完了にする（台帳に売上が入る） */
export async function seedCompleted(orderId: string): Promise<void> {
  await seedShipped(orderId);
  await sql(`select public.finish_order(${lit(orderId)}, false)`);
}

/** 注文の今の状態 */
export async function orderRow(orderId: string): Promise<{
  status: string;
  cancel_reason: string | null;
  needs_refund: boolean;
  refunded_at: string | null;
  auto_completed: boolean;
  subtotal: number;
  fee: number;
  seller_net: number;
  total: number;
}> {
  const [r] = await sql<{
    status: string;
    cancel_reason: string | null;
    needs_refund: boolean;
    refunded_at: string | null;
    auto_completed: boolean;
    subtotal: number;
    fee: number;
    seller_net: number;
    total: number;
  }>(
    `select status, cancel_reason, needs_refund, refunded_at, auto_completed, subtotal, fee, seller_net, total
     from public.orders where id = ${lit(orderId)}`,
  );
  return r;
}

/** 出品の今の状態 */
export async function listingStatus(listingId: string): Promise<string> {
  const [r] = await sql<{ status: string }>(`select status from public.listings where id = ${lit(listingId)}`);
  return r.status;
}

/** 売上の残高を直に足す（振込の試験の下ごしらえ。台帳の「調整」として入れる） */
export async function seedBalance(user: Cast, amount: number): Promise<void> {
  await sql(`
    insert into public.ledger_entries (user_id, kind, amount, note)
    values (${lit(user.id)}, 'adjustment', ${Number(amount)}, 'E2E 下ごしらえ')`);
}

/** 振込先の口座を直に入れる */
export async function seedBank(user: Cast): Promise<void> {
  await sql(`
    insert into public.bank_accounts (user_id, bank_name, branch_name, account_type, account_number, holder_kana)
    values (${lit(user.id)}, 'テスト銀行', '本店', 'ordinary', '1234567', 'テスト ハナコ')
    on conflict (user_id) do nothing`);
}

/** 試験用の小さな画像（PNG） */
export function pngImage(color = "#f9c"): Promise<Buffer> {
  return sharp({ create: { width: 48, height: 48, channels: 3, background: color } })
    .png()
    .toBuffer();
}

/** 印（EXIF の Artist）を埋めた JPEG。位置情報などが消えるかの確かめに使う */
export const EXIF_MARK = "E2E-EXIF-SECRET";
export function jpegWithExif(color = "#9cf"): Promise<Buffer> {
  return sharp({ create: { width: 48, height: 48, channels: 3, background: color } })
    .jpeg()
    .withExif({ IFD0: { Artist: EXIF_MARK, Copyright: EXIF_MARK } })
    .toBuffer();
}
