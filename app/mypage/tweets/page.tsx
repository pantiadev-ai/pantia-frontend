/* /mypage/tweets 自分のつぶやきの管理（見本 mypage.html の panel-tweet）。出品者だけ。
   上に投稿欄（本人確認済みのとき）、下に自分の投稿の一覧（固定・編集・削除）。
   自分の投稿は状態（確認中・非表示）に関係なく RLS で読める。閲覧数は作らない（CONVENTIONS §5）。 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import "@/components/posts/posts.css";
import MypageShell from "@/components/mypage/MypageShell";
import MyPostItem, { type MyPost } from "@/components/posts/MyPostItem";
import PostComposer from "@/components/posts/PostComposer";
import { PAGE_SIZE, pageOf } from "@/components/posts/data";
import { requireViewer } from "@/lib/auth";
import { dateTimeJst } from "@/lib/format";
import { postImage } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "つぶやきの管理" };

const CARD_STYLE = {
  background: "var(--glass-bg)",
  backdropFilter: "blur(20px)",
  border: "1px solid var(--glass-border)",
  borderRadius: "var(--r)",
  padding: 20,
  boxShadow: "var(--glass-shadow)",
} as const;

const TITLE_STYLE = {
  fontSize: 14,
  fontWeight: 800,
  color: "var(--text-main)",
  marginBottom: 12,
  display: "flex",
  alignItems: "center",
  gap: 8,
} as const;

type Sp = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const pageHref = (n: number) => (n > 1 ? `/mypage/tweets?page=${n}` : "/mypage/tweets");

function toStatus(s: string): MyPost["status"] {
  return s === "held" || s === "hidden" ? s : "visible";
}

export default async function MypageTweetsPage({ searchParams }: PageProps<"/mypage/tweets">) {
  const viewer = await requireViewer("/mypage/tweets");
  if (viewer.role !== "seller") redirect("/mypage");
  const sp = (await searchParams) as Sp;
  const page = pageOf(one(sp.page));
  const canPost = viewer.kycStatus === "approved";
  const supabase = await createClient();

  const from = (page - 1) * PAGE_SIZE;
  const [{ data: rows, count, error }, { data: published }] = await Promise.all([
    supabase
      .from("posts")
      .select("id, body, image_paths, listing_id, pinned, like_count, comment_count, status, created_at, edited_at", { count: "exact" })
      .eq("author_id", viewer.id)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1),
    supabase
      .from("listings")
      .select("id, title")
      .eq("seller_id", viewer.id)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  const list = rows ?? [];
  const total = count ?? list.length;
  const hasNext = from + list.length < total;

  // 紐づいた商品の題名はまとめて読む（売り切れ・非公開の自分の出品も読める）
  const linkedIds = Array.from(new Set(list.map((r) => r.listing_id).filter((x): x is string => !!x)));
  const { data: linked } = linkedIds.length
    ? await supabase.from("listings").select("id, title").in("id", linkedIds)
    : { data: [] as { id: string; title: string }[] };
  const titleOf = new Map((linked ?? []).map((l) => [l.id, l.title]));

  const posts: MyPost[] = list.map((r) => ({
    id: r.id,
    body: r.body,
    images: r.image_paths.flatMap((path) => {
      const url = postImage(path);
      return url ? [{ path, url }] : [];
    }),
    listingId: r.listing_id,
    listingTitle: r.listing_id ? (titleOf.get(r.listing_id) ?? null) : null,
    pinned: r.pinned,
    status: toStatus(r.status),
    likeCount: r.like_count,
    commentCount: r.comment_count,
    when: dateTimeJst(r.created_at),
    edited: !!r.edited_at,
  }));
  const listings = published ?? [];

  return (
    <MypageShell active="tweets">
      {/* 投稿フォーム */}
      <div style={CARD_STYLE}>
        <div style={{ ...TITLE_STYLE, marginBottom: 14 }}>
          <span className="icon-pill">✏️</span> 新しいつぶやき
        </div>
        {canPost ? (
          <PostComposer listings={listings} className="pp-in-card" />
        ) : (
          <div className="pp-kyc-guide">
            <p>つぶやきの投稿には、本人確認（18歳以上の確認）が必要です。</p>
            <Link href="/kyc" className="tweet-act-btn">
              本人確認へ →
            </Link>
          </div>
        )}
      </div>

      {/* 過去のつぶやき一覧 */}
      <div>
        <div style={TITLE_STYLE}>
          <span className="icon-pill">📋</span> 過去のつぶやき
          {total > 0 && <span className="pp-total">{total}件</span>}
        </div>
        {error ? (
          <div className="pp-empty">つぶやきを読み込めませんでした。時間をおいて、もう一度お試しください。</div>
        ) : posts.length === 0 ? (
          <div className="pp-empty">{page > 1 ? "このページにつぶやきはありません。" : "まだつぶやきはありません。最初のひとことを投稿してみましょう。"}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {posts.map((p) => (
              <MyPostItem key={p.id} post={p} listings={listings} canEdit={canPost} />
            ))}
          </div>
        )}
        {(page > 1 || hasNext) && (
          <div className="load-more pp-pager">
            {page > 1 && (
              <Link className="btn-load" href={pageHref(page - 1)}>
                ← 前のページ
              </Link>
            )}
            {hasNext && (
              <Link className="btn-load" href={pageHref(page + 1)}>
                もっと見る
              </Link>
            )}
          </div>
        )}
      </div>
    </MypageShell>
  );
}
