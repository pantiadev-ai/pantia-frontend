/* カート・購入・注文の画面で使う読み込みと表示の手伝い（サーバーだけ）。
   読みは利用者の権限（RLS）。注文は payment_ref・refund_ref が読めない（列の権限）ので、列を必ず並べて読む（* は使わない）。 */
import "server-only";
import type { Quote } from "@/components/catalogue/types";
import { authorsOf, toQuote } from "@/lib/catalogue";
import { dbMessage } from "@/lib/db-errors";
import { displayName } from "@/lib/format";
import { listingImage } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

/** 1回の購入でまとめられる数（create_checkout と同じ） */
export const MAX_PER_CHECKOUT = 10;

export type ItemOptions = { worn_days?: number; photo?: boolean; letter?: boolean; anonymous?: boolean; video?: boolean };

export type CartLine = {
  listingId: string;
  title: string;
  imageUrl: string | null;
  sellerId: string | null;
  sellerName: string;
  options: ItemOptions;
  quote: Quote | null;
  /** 買えない理由（売り切れ・公開終了・オプションが使えなくなった等）。買えるなら null */
  problem: string | null;
};

function toOptions(v: unknown): ItemOptions {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const o = v as Record<string, unknown>;
  const out: ItemOptions = {};
  if (typeof o.worn_days === "number" && Number.isInteger(o.worn_days)) out.worn_days = o.worn_days;
  for (const k of ["photo", "letter", "anonymous", "video"] as const) if (o[k] === true) out[k] = true;
  return out;
}

/** 本人のカート。値段は今の値段で DB に見積もらせる（画面では足し算しない） */
export async function loadCart(userId: string): Promise<CartLine[]> {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("cart_items")
    .select("listing_id, options, added_at")
    .eq("user_id", userId)
    .order("added_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return [];

  const ids = rows.map((r) => r.listing_id);
  const { data: listings, error: lErr } = await supabase
    .from("listings")
    .select("id, title, image_paths, seller_id, status")
    .in("id", ids);
  if (lErr) throw new Error(lErr.message);
  const byId = new Map((listings ?? []).map((l) => [l.id, l]));
  const authors = await authorsOf((listings ?? []).map((l) => l.seller_id));

  return Promise.all(
    rows.map(async (r): Promise<CartLine> => {
      const l = byId.get(r.listing_id);
      const options = toOptions(r.options);
      const base: CartLine = {
        listingId: r.listing_id,
        title: l?.title ?? "見られなくなった商品",
        imageUrl: l ? listingImage(l.image_paths[0]) : null,
        sellerId: l?.seller_id ?? null,
        sellerName: l ? displayName(authors.get(l.seller_id)?.publicName) : "",
        options,
        quote: null,
        problem: null,
      };
      if (!l) return { ...base, problem: "この商品は今は見られません。" };
      if (l.status !== "published") return { ...base, problem: l.status === "sold" ? "売り切れました。" : "公開が終わりました。" };
      const { data, error: qErr } = await supabase.rpc("quote_listing", { p_listing: l.id, p_opts: options });
      if (qErr) return { ...base, problem: dbMessage(qErr) };
      return { ...base, quote: toQuote(data) };
    }),
  );
}

/** 本人が保存したお届け先（無ければ null） */
export async function savedAddress(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("saved_addresses")
    .select("name, postal, prefecture, address1, address2, phone")
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}

/** 注文の列（payment_ref・refund_ref は利用者から読めないので入れない） */
export const ORDER_COLUMNS =
  "id, order_no, group_id, buyer_id, seller_id, listing_id, title, category, image_path, base_price, worn_days, worn_surcharge, options, video_fee, anonymous_fee, subtotal, total, fee, seller_net, anonymous, payment_method, status, needs_refund, refunded_at, cancel_reason, cancelled_at, paid_at, preparing_at, shipped_at, completed_at, auto_completed, carrier, tracking_no, expires_at, created_at";

/** 選んだオプションの短い言い方 */
export function optionLabels(v: unknown): string[] {
  const o = toOptions(v);
  const out: string[] = [];
  if (o.worn_days) out.push(`着用${o.worn_days}日`);
  if (o.photo) out.push("写真付き");
  if (o.letter) out.push("手紙付き");
  if (o.video) out.push("動画付き");
  if (o.anonymous) out.push("匿名配送");
  return out;
}

/** 取り消しの理由の言い方（期限切れ・購入者の取り消しは決まった値。ほかは出品者・運営が書いた文） */
export function cancelReasonLabel(reason: string | null): string {
  if (!reason) return "";
  if (reason === "expired") return "お支払いの期限が過ぎたため";
  if (reason === "buyer_cancelled") return "購入者が取り消したため";
  return reason;
}
