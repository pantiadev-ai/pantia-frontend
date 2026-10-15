/* マイページで何度も使う読み込み。1回の表示の中では1回だけ問い合わせる（cache）。
   どれも利用者の権限（RLS）で読む。 */
import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** 本人のプロフィール（nickname・通知の設定など本人だけの列を含む。my_profile() で読む） */
export const getMyProfile = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_profile");
  if (error) {
    console.error("[mypage] my_profile", error.message);
    return null;
  }
  return (Array.isArray(data) ? data[0] : data) ?? null;
});

export type MyProfile = NonNullable<Awaited<ReturnType<typeof getMyProfile>>>;

/** 出品者が対応する注文（新規注文・発送準備中）の件数 */
export const getOpenOrderCount = cache(async (sellerId: string): Promise<number> => {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", sellerId)
    .in("status", ["paid", "preparing"]);
  if (error) {
    console.error("[mypage] open orders", error.message);
    return 0;
  }
  return count ?? 0;
});

/** 売上の残高（振込申請できる額） */
export const getMyBalance = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_balance");
  if (error) {
    console.error("[mypage] my_balance", error.message);
    return 0;
  }
  return Number(data) || 0;
});

export type SellerStats = {
  salesMonth: number;
  netMonth: number;
  salesPrev: number;
  countMonth: number;
  countPrev: number;
  salesTotal: number;
  countTotal: number;
  published: number;
  publishedSameDay: number;
  listingsTotal: number;
  openOrders: number;
  series: { label: string; sales: number }[];
};

const EMPTY_STATS: SellerStats = {
  salesMonth: 0,
  netMonth: 0,
  salesPrev: 0,
  countMonth: 0,
  countPrev: 0,
  salesTotal: 0,
  countTotal: 0,
  published: 0,
  publishedSameDay: 0,
  listingsTotal: 0,
  openOrders: 0,
  series: [],
};

/** 出品者の数字（seller_stats）。p_period は week・month・year */
export const getSellerStats = cache(async (period: "week" | "month" | "year"): Promise<SellerStats> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("seller_stats", { p_period: period });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    if (error) console.error("[mypage] seller_stats", error.message);
    return EMPTY_STATS;
  }
  const o = data as Record<string, unknown>;
  const n = (k: string) => Number(o[k]) || 0;
  const series = Array.isArray(o.series)
    ? o.series.flatMap((x) => {
        if (!x || typeof x !== "object" || Array.isArray(x)) return [];
        const r = x as Record<string, unknown>;
        return [{ label: String(r.label ?? ""), sales: Number(r.sales) || 0 }];
      })
    : [];
  return {
    salesMonth: n("sales_month"),
    netMonth: n("net_month"),
    salesPrev: n("sales_prev"),
    countMonth: n("count_month"),
    countPrev: n("count_prev"),
    salesTotal: n("sales_total"),
    countTotal: n("count_total"),
    published: n("published"),
    publishedSameDay: n("published_same_day"),
    listingsTotal: n("listings_total"),
    openOrders: n("open_orders"),
    series,
  };
});

/** id の一覧から公開名を引く（購入者の公開名は DB の側で「K***さん」になっている） */
export async function publicNames(ids: string[]): Promise<Map<string, string | null>> {
  const uniq = Array.from(new Set(ids));
  const map = new Map<string, string | null>();
  if (uniq.length === 0) return map;
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("id, public_name").in("id", uniq);
  if (error) console.error("[mypage] public names", error.message);
  for (const p of data ?? []) map.set(p.id, p.public_name);
  return map;
}

export type FavoriteCard = {
  id: string;
  title: string;
  price: number | null;
  imagePath: string | null;
  status: string;
  category: string | null;
  wornDays: number | null;
  sellerId: string;
  sellerName: string | null;
};

/** お気に入りの商品（新しく入れた順）。見られなくなった出品（削除・停止など）は RLS で落ちる */
export async function getFavoriteListings(userId: string, limit: number): Promise<FavoriteCard[]> {
  const supabase = await createClient();
  const { data: favs, error } = await supabase
    .from("favorites")
    .select("listing_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) console.error("[mypage] favorites", error.message);
  const ids = (favs ?? []).map((f) => f.listing_id);
  if (ids.length === 0) return [];
  const { data: rows, error: lErr } = await supabase
    .from("listings")
    .select("id, title, price, image_paths, status, category, worn_days, seller_id")
    .in("id", ids);
  if (lErr) console.error("[mypage] favorite listings", lErr.message);
  const byId = new Map((rows ?? []).map((r) => [r.id, r]));
  const names = await publicNames((rows ?? []).map((r) => r.seller_id));
  return ids.flatMap((id) => {
    const r = byId.get(id);
    if (!r) return [];
    return [
      {
        id: r.id,
        title: r.title,
        price: r.price,
        imagePath: r.image_paths?.[0] ?? null,
        status: r.status,
        category: r.category,
        wornDays: r.worn_days,
        sellerId: r.seller_id,
        sellerName: names.get(r.seller_id) ?? null,
      },
    ];
  });
}

export type FollowingRow = {
  id: string;
  name: string | null;
  avatarPath: string | null;
  bio: string;
  followerCount: number;
  salesCount: number;
  ratingSum: number;
  ratingCount: number;
  lastSeenAt: string | null;
};

/** フォロー中の出品者（新しくフォローした順）。停止・退会した人は RLS で落ちる */
export async function getFollowingSellers(userId: string, limit: number): Promise<FollowingRow[]> {
  const supabase = await createClient();
  const { data: fols, error } = await supabase
    .from("follows")
    .select("seller_id, created_at")
    .eq("follower_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) console.error("[mypage] follows", error.message);
  const ids = (fols ?? []).map((f) => f.seller_id);
  if (ids.length === 0) return [];
  const { data: rows, error: pErr } = await supabase
    .from("profiles")
    .select("id, public_name, avatar_path, bio, follower_count, sales_count, rating_sum, rating_count, last_seen_at")
    .in("id", ids);
  if (pErr) console.error("[mypage] following profiles", pErr.message);
  const byId = new Map((rows ?? []).map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const r = byId.get(id);
    if (!r) return [];
    return [
      {
        id: r.id,
        name: r.public_name,
        avatarPath: r.avatar_path,
        bio: r.bio ?? "",
        followerCount: r.follower_count ?? 0,
        salesCount: r.sales_count ?? 0,
        ratingSum: r.rating_sum ?? 0,
        ratingCount: r.rating_count ?? 0,
        lastSeenAt: r.last_seen_at,
      },
    ];
  });
}
