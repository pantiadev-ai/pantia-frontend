/* /tweets/[id] つぶやき1件とコメント（見本 tweets.html の tweet-card ＋ comments-wrap）。ログインは不要。
   コメントを書けるのは本人確認済みでログイン中の人だけ。それ以外は案内を出す。
   消せるのは自分のコメントと、自分の投稿についたコメント（RLS の post_comments_delete と同じ）。
   確認中（held）のコメントは本人にだけ見える（RLS）ので、本人には「確認中」と出す。 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import "@/styles/tweets.css";
import "@/components/posts/posts.css";
import ReportButton from "@/components/ReportButton";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import Avatar from "@/components/posts/Avatar";
import CommentForm, { DeleteCommentButton } from "@/components/posts/CommentForm";
import PostBody from "@/components/posts/PostBody";
import PostCard from "@/components/posts/PostCard";
import { POST_COLUMNS, enrichPosts } from "@/components/posts/data";
import { getViewer } from "@/lib/auth";
import { displayName, excerpt, maskName, relTime } from "@/lib/format";
import { isUuid } from "@/lib/search";
import { avatarImage } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

const COMMENT_LIMIT = 100;

/** 1件を読む（generateMetadata とページで1回だけ） */
const loadPost = cache(async (id: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("posts").select(POST_COLUMNS).eq("id", id).maybeSingle();
  return data;
});

export async function generateMetadata({ params }: PageProps<"/tweets/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return { title: "つぶやき" };
  const row = await loadPost(id);
  if (!row || row.status !== "visible") return { title: "つぶやき" };
  const supabase = await createClient();
  const { data: author } = await supabase.from("profiles").select("public_name").eq("id", row.author_id).maybeSingle();
  const name = displayName(author?.public_name);
  return {
    title: `${name}のつぶやき「${excerpt(row.body, 30)}」`,
    description: excerpt(row.body, 120),
  };
}

export default async function TweetPage({ params }: PageProps<"/tweets/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const row = await loadPost(id);
  if (!row) notFound();

  const viewer = await getViewer();
  const supabase = await createClient();
  const [[post], comments] = await Promise.all([
    enrichPosts(supabase, [row], viewer?.id ?? null),
    supabase
      .from("post_comments")
      .select("id, post_id, author_id, body, status, created_at")
      .eq("post_id", id)
      .order("created_at", { ascending: false })
      .limit(COMMENT_LIMIT),
  ]);
  if (!post) notFound();
  // 運営が非表示にした投稿は、本人のほかには見せない（RLS でも出ない）
  if (post.status === "hidden" && !post.mine) notFound();

  // コメントは新しい100件を古い順に並べる
  const list = (comments.data ?? []).slice().reverse();
  const authorIds = Array.from(new Set(list.map((c) => c.author_id)));
  const { data: profs } = authorIds.length
    ? await supabase.from("profiles").select("id, public_name, role, avatar_path").in("id", authorIds)
    : { data: [] as { id: string; public_name: string | null; role: string; avatar_path: string | null }[] };
  const profMap = new Map((profs ?? []).map((p) => [p.id, p]));

  const loggedIn = !!viewer;
  const canComment = !!viewer && viewer.kycStatus === "approved" && post.status === "visible";
  const myInitial = viewer ? (Array.from(viewer.nickname.trim())[0] ?? "あ") : "あ";

  return (
    <div className="pg-tweets">
      <SiteHeader variant="tweets" active="tweets" search={{ action: "/tweets", placeholder: "つぶやきを検索" }} />

      <main className="layout pp-detail">
        <div className="feed fade-in">
          <div className="pp-back">
            <Link href="/tweets">← つぶやき一覧へ</Link>
          </div>

          <PostCard post={post} variant="tweets" loggedIn={loggedIn} detail />

          <section className="tweet-card pp-comments" id="comments" aria-label="コメント">
            <div className="pp-comments-title">💬 コメント（{post.commentCount}）</div>
            <div className="comments-wrap show">
              {list.length === 0 && <p className="pp-side-empty">まだコメントはありません。</p>}
              {list.map((c) => {
                const p = profMap.get(c.author_id);
                const isSeller = p?.role === "seller";
                const isAuthor = c.author_id === post.author.id;
                const mine = !!viewer && c.author_id === viewer.id;
                // 購入者の名前は伏せる（K***さん）。アイコンの画像は出品者だけ
                const name = !p ? displayName(null) : isSeller ? displayName(p.public_name) : maskName(p.public_name);
                const canDelete = !!viewer && (mine || post.mine);
                return (
                  <div className={`comment-item${isAuthor ? " pp-by-author" : ""}`} key={c.id}>
                    {isSeller && p ? (
                      <Link href={`/sellers/${p.id}`} aria-label={`${name}のプロフィール`}>
                        <Avatar url={avatarImage(p.avatar_path)} name={name} className="cmt-avatar" />
                      </Link>
                    ) : (
                      <Avatar url={null} name={name} className="cmt-avatar" />
                    )}
                    <div className="cmt-bubble">
                      <div className="cmt-name">
                        {isSeller && p ? <Link href={`/sellers/${p.id}`}>{name}</Link> : name}
                        {mine && <span className="pp-you">（あなた）</span>}
                        {c.status === "held" && <span className="pp-state held">確認中</span>}
                        <time className="pp-cmt-time" dateTime={c.created_at}>
                          {relTime(c.created_at)}
                        </time>
                      </div>
                      <PostBody text={c.body} className="cmt-text" tags={false} />
                      {(canDelete || (loggedIn && !mine && c.status === "visible")) && (
                        <div className="pp-cmt-tools">
                          {canDelete && <DeleteCommentButton commentId={c.id} />}
                          {loggedIn && !mine && c.status === "visible" && (
                            <ReportButton type="comment" targetId={c.id} loggedIn={loggedIn} className="pp-cmt-report" label="通報" />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {(comments.data ?? []).length >= COMMENT_LIMIT && <p className="pp-side-empty">新しい{COMMENT_LIMIT}件を表示しています。</p>}

              {canComment ? (
                <CommentForm postId={post.id} initial={myInitial} />
              ) : (
                <div className="cmt-input-wrap pp-cmt-guide">
                  {post.status !== "visible" ? (
                    <span>公開されるとコメントできるようになります。</span>
                  ) : !viewer ? (
                    <>
                      <span>コメントするにはログインしてください。</span>
                      <Link className="cmt-send" href={`/auth?next=${encodeURIComponent(`/tweets/${post.id}`)}`}>
                        ログイン
                      </Link>
                    </>
                  ) : (
                    <>
                      <span>本人確認（18歳以上の確認）が済むとコメントできます。</span>
                      <Link className="cmt-send" href="/kyc">
                        本人確認へ
                      </Link>
                    </>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      <SiteFooter variant="tweets" />
    </div>
  );
}
