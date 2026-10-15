/* つぶやきの画面で使う読み込み（サーバーだけ）。どれも利用者の権限（RLS）で読む。
   ブロック・停止・非公開の出し分けは RLS がする。一覧の N+1 を作らないよう、
   投稿者・紐づいた商品・自分のいいねは .in でまとめて読む。 */
import "server-only";
import { displayName } from "@/lib/format";
import { avatarImage, listingImage, postImage } from "@/lib/storage";
import type { createClient } from "@/lib/supabase/server";

export type Supa = Awaited<ReturnType<typeof createClient>>;

/** posts から読む列（全部、anon・authenticated に select の GRANT がある列） */
export const POST_COLUMNS =
  "id, author_id, body, image_paths, listing_id, category, tags, pinned, like_count, comment_count, status, created_at, edited_at" as const;

export type PostRow = {
  id: string;
  author_id: string;
  body: string;
  image_paths: string[];
  listing_id: string | null;
  category: string | null;
  tags: string[];
  pinned: boolean;
  like_count: number;
  comment_count: number;
  status: string;
  created_at: string;
  edited_at: string | null;
};

export type PostAuthor = {
  id: string;
  name: string;
  avatarUrl: string | null;
  age: number | null;
  occupation: string | null;
  verified: boolean;
  lastSeenAt: string | null;
};

export type PostListing = {
  id: string;
  title: string;
  price: number | null;
  imageUrl: string | null;
  status: string;
  sameDay: boolean;
};

export type PostView = {
  id: string;
  body: string;
  images: string[];
  imagePaths: string[];
  listingId: string | null;
  createdAt: string;
  editedAt: string | null;
  pinned: boolean;
  likeCount: number;
  commentCount: number;
  status: "visible" | "held" | "hidden";
  author: PostAuthor;
  listing: PostListing | null;
  liked: boolean;
  mine: boolean;
};

const PROFILE_COLUMNS = "id, public_name, avatar_path, age, occupation, kyc_status, last_seen_at" as const;

function toStatus(s: string): PostView["status"] {
  return s === "held" || s === "hidden" ? s : "visible";
}

function uniq(xs: (string | null)[]): string[] {
  return Array.from(new Set(xs.filter((x): x is string => !!x)));
}

async function readAuthors(supabase: Supa, ids: string[]) {
  if (ids.length === 0) return [];
  const { data } = await supabase.from("profiles").select(PROFILE_COLUMNS).in("id", ids);
  return data ?? [];
}

async function readListings(supabase: Supa, ids: string[]) {
  if (ids.length === 0) return [];
  const { data } = await supabase.from("listings").select("id, title, price, image_paths, status, same_day").in("id", ids);
  return data ?? [];
}

async function readLikes(supabase: Supa, viewerId: string | null, postIds: string[]): Promise<string[]> {
  if (!viewerId || postIds.length === 0) return [];
  const { data } = await supabase.from("post_likes").select("post_id").eq("user_id", viewerId).in("post_id", postIds);
  return (data ?? []).map((l) => l.post_id);
}

/** 投稿の行に、投稿者・紐づいた商品・自分のいいねをまとめて付ける（問い合わせは最大3本を並べて） */
export async function enrichPosts(supabase: Supa, rows: PostRow[], viewerId: string | null): Promise<PostView[]> {
  if (rows.length === 0) return [];
  const authorIds = uniq(rows.map((r) => r.author_id));
  const listingIds = uniq(rows.map((r) => r.listing_id));
  const postIds = rows.map((r) => r.id);

  const [authors, listings, likes] = await Promise.all([
    readAuthors(supabase, authorIds),
    readListings(supabase, listingIds),
    readLikes(supabase, viewerId, postIds),
  ]);

  const authorMap = new Map(authors.map((p) => [p.id, p]));
  const listingMap = new Map(listings.map((l) => [l.id, l]));
  const liked = new Set(likes);

  return rows.map((r) => {
    const a = authorMap.get(r.author_id);
    const l = r.listing_id ? listingMap.get(r.listing_id) : undefined;
    return {
      id: r.id,
      body: r.body,
      images: r.image_paths.map((p) => postImage(p)).filter((u): u is string => !!u),
      imagePaths: r.image_paths,
      listingId: r.listing_id,
      createdAt: r.created_at,
      editedAt: r.edited_at,
      pinned: r.pinned,
      likeCount: r.like_count,
      commentCount: r.comment_count,
      status: toStatus(r.status),
      author: {
        id: r.author_id,
        name: displayName(a?.public_name),
        avatarUrl: avatarImage(a?.avatar_path),
        age: a?.age ?? null,
        occupation: a?.occupation ?? null,
        verified: a?.kyc_status === "approved",
        lastSeenAt: a?.last_seen_at ?? null,
      },
      // 紐づいた商品が見えない（非公開・フォロー限定・削除）ときは出さない
      listing:
        l && (l.status === "published" || l.status === "sold" || r.author_id === viewerId)
          ? {
              id: l.id,
              title: l.title,
              price: l.price,
              imageUrl: listingImage(l.image_paths[0]),
              status: l.status,
              sameDay: l.same_day,
            }
          : null,
      liked: liked.has(r.id),
      mine: viewerId !== null && r.author_id === viewerId,
    };
  });
}

export type TrendTag = { tag: string; n: number };

/** この7日のトレンドのタグ */
export async function loadTrendTags(supabase: Supa, limit = 10): Promise<TrendTag[]> {
  const { data } = await supabase.rpc("trend_tags", { p_days: 7, p_limit: limit });
  return (data ?? []).filter((t) => typeof t.tag === "string" && t.tag !== "");
}

export type RecommendedSeller = {
  id: string;
  name: string;
  avatarUrl: string | null;
  age: number | null;
  occupation: string | null;
  lastSeenAt: string | null;
  rating: number;
  ratingCount: number;
  salesCount: number;
  following: boolean;
};

function asRecord(x: unknown): Record<string, unknown> | null {
  return x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}
const numOr = (x: unknown, d = 0) => (typeof x === "number" && Number.isFinite(x) ? x : d);
const strOrNull = (x: unknown) => (typeof x === "string" ? x : null);

/** おすすめの出品者（今週の販売数・評価の順。ブロックし合った相手は DB が除く）。自分は除き、フォロー中かを付ける */
export async function loadRecommendedSellers(
  supabase: Supa,
  viewerId: string | null,
  limit = 4,
  opts: { excludeFollowing?: boolean } = {},
): Promise<RecommendedSeller[]> {
  const { data } = await supabase.rpc("weekly_ranking", { p_kind: "sellers", p_limit: limit * 3 });
  const list = (Array.isArray(data) ? data : [])
    .map(asRecord)
    .filter((r): r is Record<string, unknown> => !!r && typeof r.id === "string" && r.id !== viewerId)
    .map((r) => ({
      id: r.id as string,
      name: displayName(strOrNull(r.public_name)),
      avatarUrl: avatarImage(strOrNull(r.avatar_path)),
      age: typeof r.age === "number" ? r.age : null,
      occupation: strOrNull(r.occupation),
      lastSeenAt: strOrNull(r.last_seen_at),
      rating: numOr(r.rating),
      ratingCount: numOr(r.rating_count),
      salesCount: numOr(r.sales_count),
      following: false,
    }));
  if (viewerId && list.length) {
    const { data: f } = await supabase
      .from("follows")
      .select("seller_id")
      .eq("follower_id", viewerId)
      .in(
        "seller_id",
        list.map((s) => s.id),
      );
    const set = new Set((f ?? []).map((x) => x.seller_id));
    for (const s of list) s.following = set.has(s.id);
  }
  return (opts.excludeFollowing ? list.filter((s) => !s.following) : list).slice(0, limit);
}

/** n 日前の時刻（ISO）。画面の部品の中で Date を作らないよう、ここで作る */
export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86400 * 1000).toISOString();
}

/** 1ページの件数と、?page= の読み方（1〜50） */
export const PAGE_SIZE = 20;
export function pageOf(raw: unknown): number {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : 1;
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), 50) : 1;
}

/** ?tag= の読み方（DB の tags と同じく、# を外して小文字。空白・記号を含むなら使わない） */
export function tagOf(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.replace(/^[#＃]+/, "").trim().toLowerCase();
  if (!t || Array.from(t).length > 30 || /[\s#＃、。！？!?,.　]/.test(t)) return null;
  return t;
}
