/* つぶやき1件（見本 tweets.html の tweet-card / timeline.html の tweet-card）。
   見本でクラス名が少し違う（tweet-header と tw-header など）ので variant で切り替える。
   ここはサーバーの部品。いいね・通報・シェアのボタンだけが client。 */
import Link from "next/link";
import ReportButton from "@/components/ReportButton";
import { LikeButton } from "@/components/ToggleButtons";
import { relTime, yen } from "@/lib/format";
import Avatar from "./Avatar";
import type { PostView } from "./data";
import PostBody from "./PostBody";
import ShareButton from "./ShareButton";

const CLS = {
  tweets: {
    header: "tweet-header",
    body: "tweet-body",
    imgs: "tweet-imgs",
    img: "tweet-img",
    actions: "tweet-actions",
    thumb: "item-link-thumb",
    info: "item-link-info",
    name: "item-link-name",
    price: "item-link-price",
    badge: "item-link-badge",
  },
  timeline: {
    header: "tw-header",
    body: "tw-body",
    imgs: "tw-imgs",
    img: "tw-img",
    actions: "tw-actions",
    thumb: "il-thumb",
    info: "il-info",
    name: "il-name",
    price: "il-price",
    badge: "il-badge",
  },
} as const;

export type PostCardProps = {
  post: PostView;
  variant: "tweets" | "timeline";
  loggedIn: boolean;
  /** 1件の画面では本文の時刻をリンクにしない */
  detail?: boolean;
  /** 新着（timeline の new-post） */
  isNew?: boolean;
};

export default function PostCard({ post, variant, loggedIn, detail = false, isNew = false }: PostCardProps) {
  const c = CLS[variant];
  const a = post.author;
  const href = `/tweets/${post.id}`;
  const imgCount = post.images.length;
  const imgsClass = imgCount === 3 ? " three" : imgCount >= 2 ? " two" : " one";
  const sub = [a.occupation, a.age ? `${a.age}歳` : null].filter((x): x is string => !!x);

  return (
    <article className={`tweet-card${post.pinned ? " pinned" : ""}${isNew ? " new-post" : ""}`}>
      {post.pinned && <div className="pin-badge">📌 ピン留め</div>}
      {isNew && !post.pinned && <div className="new-badge">🆕 新着</div>}
      {post.status !== "visible" && (
        <div className={`pp-state ${post.status}`}>
          {post.status === "held" ? "確認中（運営の確認のあと公開されます）" : "非表示（運営により非表示になっています）"}
        </div>
      )}

      <div className={c.header}>
        <Link href={`/sellers/${a.id}`} className="pp-author-link" aria-label={`${a.name}のプロフィール`}>
          <Avatar url={a.avatarUrl} name={a.name} className="tw-avatar" />
        </Link>
        <div className="tw-meta">
          <Link href={`/sellers/${a.id}`} className="tw-name">
            {a.name} {a.verified && <span className="tw-verified" title="本人確認済み">✅</span>}
          </Link>
          {sub.length > 0 && (
            <div className="tw-sub">
              {sub.map((s) => (
                <span key={s}>{s}</span>
              ))}
            </div>
          )}
        </div>
        {detail ? (
          <time className="tw-time" dateTime={post.createdAt}>
            {relTime(post.createdAt)}
            {post.editedAt && "（編集済み）"}
          </time>
        ) : (
          <Link href={href} className="tw-time">
            <time dateTime={post.createdAt}>{relTime(post.createdAt)}</time>
            {post.editedAt && "（編集済み）"}
          </Link>
        )}
        {post.mine ? (
          <Link href="/mypage/tweets" className="tw-menu" title="自分のつぶやきの管理（固定・編集・削除）" aria-label="自分のつぶやきの管理">
            ···
          </Link>
        ) : (
          post.status === "visible" && <ReportButton type="post" targetId={post.id} loggedIn={loggedIn} className="tw-menu pp-report" label="通報" />
        )}
      </div>

      <PostBody text={post.body} className={c.body} />

      {imgCount > 0 && (
        <div className={`${c.imgs}${imgsClass}`}>
          {post.images.map((url, i) => (
            <a key={url} className={c.img} href={url} target="_blank" rel="noopener noreferrer" aria-label={`写真${i + 1}を大きく見る`}>
              <img src={url} alt={`写真${i + 1}`} className="tw-photo-img" loading="lazy" />
            </a>
          ))}
        </div>
      )}

      {post.listing && (
        <Link href={`/items/${post.listing.id}`} className="item-link">
          <div className={c.thumb}>{post.listing.imageUrl ? <img src={post.listing.imageUrl} alt="" className="il-img" /> : "🛍"}</div>
          <div className={c.info}>
            <div className={c.name}>{post.listing.title}</div>
            <div className={c.price}>{post.listing.price !== null ? yen(post.listing.price) : "価格未定"}</div>
          </div>
          {post.listing.status === "sold" ? (
            <div className={`${c.badge} pp-sold`}>SOLD</div>
          ) : (
            post.listing.sameDay && <div className={c.badge}>即日</div>
          )}
        </Link>
      )}

      <div className={c.actions}>
        {post.status === "visible" ? (
          <LikeButton
            id={post.id}
            initial={post.liked}
            count={post.likeCount}
            loggedIn={loggedIn}
            className="tw-action"
            activeClassName="liked"
            labels={["♡ {n}", "♥ {n}"]}
            ariaLabel="いいね"
          />
        ) : (
          <span className="tw-action pp-static">♡ {post.likeCount}</span>
        )}
        {detail ? (
          <span className="tw-action pp-static">💬 {post.commentCount}</span>
        ) : (
          <Link href={`${href}#comments`} className="tw-action">
            💬 {post.commentCount}
          </Link>
        )}
        {post.status === "visible" && <ShareButton postId={post.id} className="tw-action" />}
      </div>
    </article>
  );
}
