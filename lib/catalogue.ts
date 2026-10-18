/* 入口・商品・出品者の画面で使う読み込み（サーバー専用）。
   すべて利用者の権限（RLS）で読む。読めない物は「無い」として扱う（画面は notFound か空の表示）。
   DB の関数が返す jsonb は形を確かめてから使う（知らない形は捨てる）。 */
import "server-only";
import { after } from "next/server";
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import type { Database, Json } from "@/lib/database.types";
import { publicEnv } from "@/lib/env";
import { requestIp, RULES, takeRateLimit } from "@/lib/rate-limit";
import { escapeLike, isUuid } from "@/lib/search";
import { maskName } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { ListingCard, Quote } from "@/components/catalogue/types";

/* ───────── jsonb を読む小さな道具 ───────── */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
/** 数（小数もそのまま）。数でなければ 0 */
const int = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const bool = (v: unknown): boolean => v === true;

function toCard(v: unknown): ListingCard | null {
  const o = obj(v);
  const id = o.id;
  const sellerId = o.seller_id;
  if (!isUuid(id) || !isUuid(sellerId)) return null;
  return {
    id,
    title: str(o.title),
    category: str(o.category),
    price: int(o.price),
    wornDays: int(o.worn_days),
    imagePath: strOrNull(o.image_path),
    sameDay: bool(o.same_day),
    optPhoto: bool(o.opt_photo),
    optLetter: bool(o.opt_letter),
    anonymousOk: bool(o.anonymous_ok),
    preMessageOk: bool(o.pre_message_ok),
    coolShipping: bool(o.cool_shipping),
    followersOnly: bool(o.followers_only),
    likeCount: int(o.like_count),
    publishedAt: strOrNull(o.published_at),
    sellerId,
    sellerName: strOrNull(o.seller_name),
    sellerAvatar: strOrNull(o.seller_avatar),
    sellerOnline: bool(o.seller_online),
    soldOut: str(o.status) === "sold",
  };
}

const cards = (v: unknown): ListingCard[] => arr(v).map(toCard).filter((c): c is ListingCard => c !== null);

/* ───────── 商品の検索（search_listings） ───────── */

export type SearchInput = {
  q?: string;
  categories?: string[];
  priceMin?: number | null;
  priceMax?: number | null;
  worn?: string[];
  flags?: string[];
  sort?: string;
  seller?: string;
  limit?: number;
  offset?: number;
};

export type SearchResult = {
  /** false = DB から読めなかった（画面は「読み込めませんでした」を出す） */
  ok: boolean;
  total: number;
  items: ListingCard[];
  facets: { categories: Record<string, number>; options: Record<string, number> };
};

const FLAG_KEYS = ["same_day", "photo", "anonymous", "letter", "negotiable", "online", "rating4", "sales10"] as const;

function numMap(v: unknown): Record<string, number> {
  const o = obj(v);
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(o)) out[k] = int(n);
  return out;
}

/** 公開中の商品を探す。渡す key は1つずつ選ぶ（受け取った物をそのまま DB に渡さない） */
export async function searchListings(input: SearchInput): Promise<SearchResult> {
  const p: Record<string, Json> = {};
  if (input.q) p.q = input.q.slice(0, 50);
  if (input.categories?.length) p.categories = input.categories.slice(0, 6);
  if (input.priceMin != null) p.price_min = Math.max(0, Math.floor(input.priceMin));
  if (input.priceMax != null) p.price_max = Math.max(0, Math.floor(input.priceMax));
  if (input.worn?.length) p.worn = input.worn.slice(0, 5);
  for (const f of FLAG_KEYS) if (input.flags?.includes(f)) p[f] = true;
  if (input.sort) p.sort = input.sort;
  if (input.seller && isUuid(input.seller)) p.seller = input.seller;
  p.limit = Math.min(Math.max(input.limit ?? 24, 1), 60);
  p.offset = Math.min(Math.max(input.offset ?? 0, 0), 10000);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_listings", { p });
  if (error) {
    console.error("[catalogue] search_listings", error.message);
    return { ok: false, total: 0, items: [], facets: { categories: {}, options: {} } };
  }
  const o = obj(data);
  const facets = obj(o.facets);
  return {
    ok: true,
    total: int(o.total),
    items: cards(o.items),
    facets: { categories: numMap(facets.categories), options: numMap(facets.options) },
  };
}

/* ───────── ログイン中の人の印（お気に入り・いいね・フォロー・ブロック） ───────── */

/** 渡した商品のうち、自分がお気に入りにしている物（1回の in で読む） */
export async function favoriteIds(viewerId: string | null | undefined, listingIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(listingIds.filter(isUuid))];
  if (!viewerId || ids.length === 0) return new Set();
  const supabase = await createClient();
  const { data, error } = await supabase.from("favorites").select("listing_id").eq("user_id", viewerId).in("listing_id", ids);
  if (error) console.error("[catalogue] favorites", error.message);
  return new Set((data ?? []).map((r) => r.listing_id));
}

/** 渡したつぶやきのうち、自分がいいねした物 */
export async function likedPostIds(viewerId: string | null | undefined, postIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(postIds.filter(isUuid))];
  if (!viewerId || ids.length === 0) return new Set();
  const supabase = await createClient();
  const { data, error } = await supabase.from("post_likes").select("post_id").eq("user_id", viewerId).in("post_id", ids);
  if (error) console.error("[catalogue] post_likes", error.message);
  return new Set((data ?? []).map((r) => r.post_id));
}

export async function isFollowing(viewerId: string | null | undefined, sellerId: string): Promise<boolean> {
  if (!viewerId || !isUuid(sellerId)) return false;
  const supabase = await createClient();
  const { data } = await supabase.from("follows").select("seller_id").eq("follower_id", viewerId).eq("seller_id", sellerId).maybeSingle();
  return !!data;
}

/** 自分がブロックしているか（ブロックのボタンの初期値） */
export async function hasBlocked(viewerId: string | null | undefined, otherId: string): Promise<boolean> {
  if (!viewerId || !isUuid(otherId)) return false;
  const supabase = await createClient();
  const { data } = await supabase.from("blocks").select("blocked_id").eq("blocker_id", viewerId).eq("blocked_id", otherId).maybeSingle();
  return !!data;
}

/** どちらかがブロックしているか（相手からのブロックも含む） */
export async function blockedWith(viewerId: string | null | undefined, otherId: string): Promise<boolean> {
  if (!viewerId || !isUuid(otherId) || viewerId === otherId) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_blocked_with", { p_other: otherId });
  if (error) console.error("[catalogue] is_blocked_with", error.message);
  return data === true;
}

/** 自分がブロックした人（一覧から外すため） */
export async function myBlockedIds(viewerId: string | null | undefined): Promise<Set<string>> {
  if (!viewerId) return new Set();
  const supabase = await createClient();
  const { data, error } = await supabase.from("blocks").select("blocked_id").eq("blocker_id", viewerId).limit(1000);
  if (error) console.error("[catalogue] blocks", error.message);
  return new Set((data ?? []).map((r) => r.blocked_id));
}

/* ───────── 出品者 ───────── */

/** 一覧・カードに出す出品者の列（GRANT のある列だけ） */
const SELLER_COLS =
  "id, public_name, avatar_path, age, occupation, bio, last_seen_at, follower_count, sales_count, rating_sum, rating_count, supported_options, ship_estimate, created_at";

export type SellerCard = {
  id: string;
  publicName: string | null;
  avatarPath: string | null;
  age: number | null;
  occupation: string | null;
  bio: string;
  lastSeenAt: string | null;
  followerCount: number;
  salesCount: number;
  ratingSum: number;
  ratingCount: number;
  supportedOptions: string[];
  shipEstimate: string | null;
  createdAt: string;
};

type SellerRow = {
  id: string;
  public_name: string | null;
  avatar_path: string | null;
  age: number | null;
  occupation: string | null;
  bio: string;
  last_seen_at: string | null;
  follower_count: number;
  sales_count: number;
  rating_sum: number;
  rating_count: number;
  supported_options: string[];
  ship_estimate: string | null;
  created_at: string;
};

const toSeller = (r: SellerRow): SellerCard => ({
  id: r.id,
  publicName: r.public_name,
  avatarPath: r.avatar_path,
  age: r.age,
  occupation: r.occupation,
  bio: r.bio ?? "",
  lastSeenAt: r.last_seen_at,
  followerCount: r.follower_count ?? 0,
  salesCount: r.sales_count ?? 0,
  ratingSum: r.rating_sum ?? 0,
  ratingCount: r.rating_count ?? 0,
  supportedOptions: r.supported_options ?? [],
  shipEstimate: r.ship_estimate,
  createdAt: r.created_at,
});

export type SellerSort = "followers" | "new" | "rating";

/** 公開の出品者（出品者・本人確認済み・名前あり。停止中は RLS で見えない） */
export async function listSellers(opts: {
  q?: string;
  sort?: SellerSort;
  limit: number;
  offset?: number;
  /** 最後にログインした順（入口の「アクティブな出品者」） */
  byActivity?: boolean;
}): Promise<{ ok: boolean; total: number; sellers: SellerCard[] }> {
  const supabase = await createClient();
  let query = supabase
    .from("profiles")
    .select(SELLER_COLS, { count: "exact" })
    .eq("role", "seller")
    .eq("kyc_status", "approved")
    .eq("status", "active")
    .not("public_name", "is", null);
  if (opts.q) query = query.ilike("public_name", `%${escapeLike(opts.q)}%`);
  if (opts.byActivity) query = query.order("last_seen_at", { ascending: false, nullsFirst: false });
  else if (opts.sort === "new") query = query.order("created_at", { ascending: false });
  else if (opts.sort === "rating")
    // 平均で並べる列が無いので、件数→合計の順（仮）
    query = query.order("rating_count", { ascending: false }).order("rating_sum", { ascending: false });
  else query = query.order("follower_count", { ascending: false });
  query = query.order("id");
  const from = Math.max(opts.offset ?? 0, 0);
  const { data, error, count } = await query.range(from, from + opts.limit - 1);
  if (error) {
    console.error("[catalogue] sellers", error.message);
    return { ok: false, total: 0, sellers: [] };
  }
  return { ok: true, total: count ?? 0, sellers: (data as SellerRow[]).map(toSeller) };
}

/** 登録している出品者の数（入口の数字の帯） */
export async function countPublicSellers(): Promise<number | null> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "seller")
    .eq("kyc_status", "approved")
    .eq("status", "active");
  if (error) {
    console.error("[catalogue] count sellers", error.message);
    return null;
  }
  return count ?? 0;
}

/** 出品者ページの1人分。出品者でない・名前が無い人は null（画面は notFound） */
export type SellerProfile = SellerCard & {
  role: string;
  coverPath: string | null;
  heightCm: number | null;
  bodyType: string | null;
  ngNote: string;
  acceptMessages: boolean;
  kycStatus: string;
};

export const getSellerProfile = cache(async (id: string): Promise<SellerProfile | null> => {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, public_name, avatar_path, age, occupation, bio, last_seen_at, follower_count, sales_count, rating_sum, rating_count, supported_options, ship_estimate, created_at, role, cover_path, height_cm, body_type, ng_note, accept_messages, kyc_status, status",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("[catalogue] profile", error.message);
  if (!data || data.role !== "seller" || data.status !== "active") return null;
  return {
    ...toSeller(data as SellerRow),
    role: data.role,
    coverPath: data.cover_path,
    heightCm: data.height_cm,
    bodyType: data.body_type,
    ngNote: data.ng_note ?? "",
    acceptMessages: data.accept_messages,
    kycStatus: data.kyc_status,
  };
});

/* ───────── 商品ページ ───────── */

export type ListingDetail = {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  category: string | null;
  wornDays: number | null;
  material: string | null;
  color: string | null;
  size: string | null;
  price: number | null;
  stockMode: string;
  optPhoto: boolean;
  optLetter: boolean;
  optZiplock: boolean;
  optCard: boolean;
  optVideo: boolean;
  optExtend: boolean;
  maxWornDays: number | null;
  requestOnly: boolean;
  sameDay: boolean;
  anonymousOk: boolean;
  preMessageOk: boolean;
  followersOnly: boolean;
  coolShipping: boolean;
  shipEstimate: string;
  ngNote: string;
  imagePaths: string[];
  status: string;
  likeCount: number;
  salesCount: number;
  publishedAt: string | null;
  createdAt: string;
};

/** 1件の出品。読めない（非公開・他人の下書き・ブロック・フォロワー限定）なら null */
export const getListingDetail = cache(async (id: string): Promise<ListingDetail | null> => {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .select(
      "id, seller_id, title, description, category, worn_days, material, color, size, price, stock_mode, opt_photo, opt_letter, opt_ziplock, opt_card, opt_video, opt_extend, max_worn_days, request_only, same_day, anonymous_ok, pre_message_ok, followers_only, cool_shipping, ship_estimate, ng_note, image_paths, status, like_count, sales_count, published_at, created_at",
    )
    .eq("id", id)
    .neq("status", "deleted")
    .maybeSingle();
  if (error) console.error("[catalogue] listing", error.message);
  if (!data) return null;
  return {
    id: data.id,
    sellerId: data.seller_id,
    title: data.title,
    description: data.description ?? "",
    category: data.category,
    wornDays: data.worn_days,
    material: data.material,
    color: data.color,
    size: data.size,
    price: data.price,
    stockMode: data.stock_mode,
    optPhoto: data.opt_photo,
    optLetter: data.opt_letter,
    optZiplock: data.opt_ziplock,
    optCard: data.opt_card,
    optVideo: data.opt_video,
    optExtend: data.opt_extend,
    maxWornDays: data.max_worn_days,
    requestOnly: data.request_only,
    sameDay: data.same_day,
    anonymousOk: data.anonymous_ok,
    preMessageOk: data.pre_message_ok,
    followersOnly: data.followers_only,
    coolShipping: data.cool_shipping,
    shipEstimate: data.ship_estimate ?? "",
    ngNote: data.ng_note ?? "",
    imagePaths: (data.image_paths ?? []).filter((p) => typeof p === "string" && p !== ""),
    status: data.status,
    likeCount: data.like_count ?? 0,
    salesCount: data.sales_count ?? 0,
    publishedAt: data.published_at,
    createdAt: data.created_at,
  };
});

/** 見積もり（quote_listing の答え）を読みやすい形にする。形が違えば null */
export function toQuote(v: unknown): Quote | null {
  const o = obj(v);
  if (typeof o.total !== "number" && typeof o.total !== "string") return null;
  return {
    wornDays: int(o.worn_days),
    basePrice: int(o.base_price),
    wornSurcharge: int(o.worn_surcharge),
    videoFee: int(o.video_fee),
    anonymousFee: int(o.anonymous_fee),
    subtotal: int(o.subtotal),
    total: int(o.total),
  };
}

/** 最初の値段（オプションなし）。公開中でなければ null */
export async function initialQuote(listingId: string): Promise<Quote | null> {
  if (!isUuid(listingId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("quote_listing", { p_listing: listingId, p_opts: {} });
  if (error) return null;
  return toQuote(data);
}

/** 見られた数を1つ足す（公開中・他人の出品だけ DB 側で数える）。同じ回線・同じ商品は6時間に1回だけ。
    応答を返したあとに数えるので画面は待たない。失敗しても画面は止めない */
export async function bumpListingView(listingId: string, viewerId: string | null): Promise<void> {
  if (!isUuid(listingId)) return;
  // 見出しはリクエストの中で読む（after の中では読めない）
  const ip = await requestIp();
  if (!ip) return;
  after(async () => {
    try {
      const limit = await takeRateLimit([{ rule: RULES.viewIpListing, kind: "ip", id: `${ip}|${listingId}` }], { failClosed: true });
      if (!limit.ok) return;
      const { error } = await createServiceClient().rpc("bump_listing_view", { p_listing: listingId, p_viewer: viewerId });
      if (error) console.error("[catalogue] bump_listing_view", error.message);
    } catch (e) {
      console.error("[catalogue] bump_listing_view", e instanceof Error ? e.message : e);
    }
  });
}

/* ───────── レビュー ───────── */

export type ReviewView = {
  id: string;
  rating: number;
  body: string;
  title: string;
  category: string;
  createdAt: string;
  /** 伏せた購入者の名前（K***さん） */
  buyerName: string;
  listingId: string | null;
};

export type ReviewSummary = {
  ok: boolean;
  total: number;
  /** [5の数, 4の数, 3の数, 2の数, 1の数] */
  counts: [number, number, number, number, number];
  reviews: ReviewView[];
};

/** 出品者のレビュー（表示中の物だけ）。星ごとの数は head の count を5本で読む */
export async function sellerReviews(sellerId: string, limit: number): Promise<ReviewSummary> {
  const empty: ReviewSummary = { ok: false, total: 0, counts: [0, 0, 0, 0, 0], reviews: [] };
  if (!isUuid(sellerId)) return empty;
  const supabase = await createClient();
  const [list, ...countRes] = await Promise.all([
    supabase
      .from("reviews")
      .select("id, rating, body, title, category, created_at, buyer_id, listing_id")
      .eq("seller_id", sellerId)
      .eq("status", "visible")
      .order("created_at", { ascending: false })
      .limit(limit),
    ...[5, 4, 3, 2, 1].map((star) =>
      supabase.from("reviews").select("id", { count: "exact", head: true }).eq("seller_id", sellerId).eq("status", "visible").eq("rating", star),
    ),
  ]);
  if (list.error) {
    console.error("[catalogue] reviews", list.error.message);
    return empty;
  }
  const counts = countRes.map((r) => r.count ?? 0) as [number, number, number, number, number];
  const rows = list.data ?? [];
  // 購入者の名前は profiles の public_name（購入者は DB 側で「K***さん」の形）。in で1回だけ読む
  const buyerIds = [...new Set(rows.map((r) => r.buyer_id).filter(isUuid))];
  const names = new Map<string, string | null>();
  if (buyerIds.length) {
    const { data: buyers } = await supabase.from("profiles").select("id, public_name").in("id", buyerIds);
    for (const b of buyers ?? []) names.set(b.id, b.public_name);
  }
  return {
    ok: true,
    total: counts.reduce((a, b) => a + b, 0),
    counts,
    reviews: rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      body: r.body ?? "",
      title: r.title ?? "",
      category: r.category ?? "",
      createdAt: r.created_at,
      buyerName: maskName(names.get(r.buyer_id)),
      listingId: r.listing_id,
    })),
  };
}

/* ───────── つぶやき ───────── */

export type PostView = {
  id: string;
  authorId: string;
  body: string;
  imagePaths: string[];
  pinned: boolean;
  likeCount: number;
  commentCount: number;
  createdAt: string;
  editedAt: string | null;
};

const POST_COLS = "id, author_id, body, image_paths, pinned, like_count, comment_count, created_at, edited_at";

type PostRow = {
  id: string;
  author_id: string;
  body: string;
  image_paths: string[] | null;
  pinned: boolean;
  like_count: number;
  comment_count: number;
  created_at: string;
  edited_at: string | null;
};

const toPost = (r: PostRow): PostView => ({
  id: r.id,
  authorId: r.author_id,
  body: r.body ?? "",
  imagePaths: r.image_paths ?? [],
  pinned: r.pinned,
  likeCount: r.like_count ?? 0,
  commentCount: r.comment_count ?? 0,
  createdAt: r.created_at,
  editedAt: r.edited_at,
});

/** 新しいつぶやき（入口）。RLS で、公開の出品者・表示中・ブロックなしの物だけ返る */
export async function latestPosts(limit: number): Promise<PostView[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .select(POST_COLS)
    .eq("status", "visible")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) console.error("[catalogue] posts", error.message);
  return ((data ?? []) as PostRow[]).map(toPost);
}

/** 1人の出品者のつぶやき（ピン留めを先に、新しい順） */
export async function sellerPosts(sellerId: string, limit: number): Promise<{ total: number; posts: PostView[] }> {
  if (!isUuid(sellerId)) return { total: 0, posts: [] };
  const supabase = await createClient();
  const { data, error, count } = await supabase
    .from("posts")
    .select(POST_COLS, { count: "exact" })
    .eq("author_id", sellerId)
    .eq("status", "visible")
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) console.error("[catalogue] seller posts", error.message);
  return { total: count ?? 0, posts: ((data ?? []) as PostRow[]).map(toPost) };
}

/** つぶやきの書き手の名前など（in で1回だけ読む） */
export async function authorsOf(ids: string[]): Promise<Map<string, { publicName: string | null; avatarPath: string | null; age: number | null; occupation: string | null }>> {
  const uniq = [...new Set(ids.filter(isUuid))];
  const out = new Map<string, { publicName: string | null; avatarPath: string | null; age: number | null; occupation: string | null }>();
  if (uniq.length === 0) return out;
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("id, public_name, avatar_path, age, occupation").in("id", uniq);
  if (error) console.error("[catalogue] authors", error.message);
  for (const p of data ?? []) out.set(p.id, { publicName: p.public_name, avatarPath: p.avatar_path, age: p.age, occupation: p.occupation });
  return out;
}

/* ───────── 週間ランキング（weekly_ranking） ───────── */

export type RankedSeller = {
  id: string;
  publicName: string | null;
  avatarPath: string | null;
  age: number | null;
  occupation: string | null;
  salesCount: number;
  followerCount: number;
  lastSeenAt: string | null;
  rating: number;
  ratingCount: number;
  /** この1週間の注文数 */
  weekOrders: number;
};

export type RankedListing = {
  id: string;
  title: string;
  price: number;
  category: string;
  imagePath: string | null;
  likeCount: number;
  sellerId: string;
  sellerName: string | null;
  soldOut: boolean;
  score: number;
};

export async function rankingSellers(limit: number): Promise<{ ok: boolean; rows: RankedSeller[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("weekly_ranking", { p_kind: "sellers", p_limit: limit });
  if (error) {
    console.error("[catalogue] ranking sellers", error.message);
    return { ok: false, rows: [] };
  }
  const rows: RankedSeller[] = [];
  for (const v of arr(data)) {
    const o = obj(v);
    if (!isUuid(o.id)) continue;
    rows.push({
      id: o.id,
      publicName: strOrNull(o.public_name),
      avatarPath: strOrNull(o.avatar_path),
      age: o.age == null ? null : int(o.age),
      occupation: strOrNull(o.occupation),
      salesCount: int(o.sales_count),
      followerCount: int(o.follower_count),
      lastSeenAt: strOrNull(o.last_seen_at),
      rating: int(o.rating),
      ratingCount: int(o.rating_count),
      weekOrders: int(o.n),
    });
  }
  return { ok: true, rows };
}

export async function rankingListings(limit: number): Promise<{ ok: boolean; rows: RankedListing[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("weekly_ranking", { p_kind: "listings", p_limit: limit });
  if (error) {
    console.error("[catalogue] ranking listings", error.message);
    return { ok: false, rows: [] };
  }
  const rows: RankedListing[] = [];
  for (const v of arr(data)) {
    const o = obj(v);
    if (!isUuid(o.id) || !isUuid(o.seller_id)) continue;
    rows.push({
      id: o.id,
      title: str(o.title),
      price: int(o.price),
      category: str(o.category),
      imagePath: strOrNull(o.image_path),
      likeCount: int(o.like_count),
      sellerId: o.seller_id,
      sellerName: strOrNull(o.seller_name),
      soldOut: str(o.status) === "sold",
      score: int(o.score),
    });
  }
  return { ok: true, rows };
}

/* ───────── サイトマップ用（クッキーを使わない、ログインなしの読み込み） ───────── */

/** ログインしていない人と同じ権限の client。サイトマップのように「誰にでも見える物」だけを読むときに使う */
export function anonClient() {
  return createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
