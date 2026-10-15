/* /sellers/[id] 出品者のプロフィール（見本: seller_profile.html）。
   出品者・名前あり・本人確認済みの人だけ出す（本人は確認前でも自分のページを見られる）。それ以外は 404。
   タブ（自己紹介・出品中・つぶやき・レビュー）の中身はサーバーで作り、切り替えだけブラウザで行う。 */
import "@/styles/seller-profile.css";
import "@/components/catalogue/catalogue.css";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ReportButton from "@/components/ReportButton";
import { BlockButton, FollowButton, LikeButton } from "@/components/ToggleButtons";
import { getViewer } from "@/lib/auth";
import {
  blockedWith,
  favoriteIds,
  getSellerProfile,
  hasBlocked,
  isFollowing,
  likedPostIds,
  searchListings,
  sellerPosts,
  sellerReviews,
} from "@/lib/catalogue";
import { isUuid } from "@/lib/search";
import { avatarImage, postImage } from "@/lib/storage";
import { BODY_TYPES, SHIP_ESTIMATES, SUPPORTED_OPTIONS, labelOf } from "@/lib/labels";
import { dateJst, displayName, excerpt, isOnline, num, presence, ratingAvg, relTime } from "@/lib/format";
import ItemCard from "@/components/catalogue/ItemCard";
import MessageButton from "@/components/catalogue/MessageButton";
import Pager from "@/components/catalogue/Pager";
import SellerTabs, { type SellerTab } from "@/components/catalogue/SellerTabs";
import { categoryIcon, initialOf, metaLine } from "@/components/catalogue/card-helpers";

const ITEMS_PER_PAGE = 24;
const MAX_ITEM_PAGE = 50;
const POSTS = 20;
const REVIEWS = 20;
const TAB_KEYS = ["intro", "items", "tweets", "reviews"] as const;

/** 対応オプションの札（見本の opt-tag） */
const OPTION_ICONS: Record<string, string> = {
  photo: "📸",
  days: "📅",
  same_day: "⚡",
  anonymous: "📦",
  letter: "💌",
  request: "🎀",
  bundle: "🛍",
};

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** 見せてよい出品者か（本人は確認前でも見られる） */
async function loadVisible(id: string, viewerId: string | undefined) {
  if (!isUuid(id)) return null;
  const seller = await getSellerProfile(id);
  if (!seller || !seller.publicName) return null;
  if (seller.kycStatus !== "approved" && seller.id !== viewerId) return null;
  return seller;
}

export async function generateMetadata({ params }: PageProps<"/sellers/[id]">): Promise<Metadata> {
  const { id } = await params;
  const viewer = await getViewer();
  const seller = await loadVisible(id, viewer?.id);
  if (!seller) return { title: "出品者が見つかりません", robots: { index: false } };
  const name = displayName(seller.publicName);
  return {
    title: `${name}のプロフィール`,
    description: excerpt(seller.bio, 100) || `${name}の出品中の商品・つぶやき・レビュー`,
    robots: seller.kycStatus === "approved" ? undefined : { index: false },
  };
}

function StarRow({ rating }: { rating: number }) {
  return (
    <>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`star ${n <= rating ? "full" : "empty"}`}>
          ★
        </span>
      ))}
    </>
  );
}

export default async function SellerProfilePage({ params, searchParams }: PageProps<"/sellers/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const viewer = await getViewer();
  const seller = await loadVisible(id, viewer?.id);
  if (!seller) notFound();

  const own = viewer?.id === seller.id;
  const tabRaw = first(sp.tab);
  const tab = (TAB_KEYS as readonly string[]).includes(tabRaw) ? tabRaw : "intro";
  const pageNum = Number.parseInt(first(sp.page), 10);
  const page = tab === "items" && Number.isFinite(pageNum) && pageNum >= 1 ? Math.min(pageNum, MAX_ITEM_PAGE) : 1;

  // どちらかがブロックしていれば、出品とつぶやきは出さない（DB の RLS でも隠れる）
  const blocked = own ? false : await blockedWith(viewer?.id, seller.id);
  const [following, iBlocked, reviews, items, posts] = await Promise.all([
    own ? Promise.resolve(false) : isFollowing(viewer?.id, seller.id),
    own ? Promise.resolve(false) : hasBlocked(viewer?.id, seller.id),
    sellerReviews(seller.id, REVIEWS),
    blocked
      ? Promise.resolve(null)
      : searchListings({ seller: seller.id, sort: "new", limit: ITEMS_PER_PAGE, offset: (page - 1) * ITEMS_PER_PAGE }),
    blocked ? Promise.resolve({ total: 0, posts: [] }) : sellerPosts(seller.id, POSTS),
  ]);
  const [favs, liked] = await Promise.all([
    own ? Promise.resolve(new Set<string>()) : favoriteIds(viewer?.id, items?.items.map((i) => i.id) ?? []),
    likedPostIds(viewer?.id, posts.posts.map((p) => p.id)),
  ]);

  const name = displayName(seller.publicName);
  const avatar = avatarImage(seller.avatarPath);
  const cover = avatarImage(seller.coverPath);
  const online = isOnline(seller.lastSeenAt);
  const meta = metaLine(seller.occupation, seller.age, " ");
  const avg = ratingAvg(seller.ratingSum, seller.ratingCount);
  const avgStars = seller.ratingCount ? Math.round(seller.ratingSum / seller.ratingCount) : 0;
  const reviewTotal = reviews.total;
  // 出品者どうしの会話は DB が断るので、購入者とログインしていない人だけに出す
  const showMessage = !own && !blocked && (!viewer || viewer.role === "buyer");
  const itemPages = items ? Math.min(MAX_ITEM_PAGE, Math.ceil(items.total / ITEMS_PER_PAGE)) : 0;
  const blockedNotice = (
    <div className="cat-empty cat-blocked">
      <div className="cat-empty-icon">🚫</div>
      {iBlocked ? "このユーザーをブロックしているため、表示できません" : "このユーザーの出品とつぶやきは表示できません"}
    </div>
  );

  const tabs: SellerTab[] = [
    {
      key: "intro",
      label: "自己紹介",
      content: (
        <div className="intro-card">
          <div className="sec-label">
            <span className="icon-pill">👋</span> 自己紹介
          </div>
          <div className="intro-text">{seller.bio || "まだ自己紹介はありません。"}</div>
          <div className="cat-mt20">
            <div className="sec-label">
              <span className="icon-pill">✅</span> 対応オプション
            </div>
            {seller.supportedOptions.length ? (
              <div className="intro-options">
                {seller.supportedOptions.map((o) => (
                  <div className="opt-tag" key={o}>
                    {OPTION_ICONS[o] ?? "✔"} {labelOf(SUPPORTED_OPTIONS, o) || o}
                  </div>
                ))}
              </div>
            ) : (
              <div className="cat-note">登録されていません</div>
            )}
          </div>
          {seller.ngNote ? (
            <div className="cat-mt20">
              <div className="sec-label">
                <span className="icon-pill">❌</span> NG
              </div>
              <div className="intro-options">
                <div className="opt-tag cat-ng-tag">{seller.ngNote}</div>
              </div>
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "items",
      label: `出品中 (${num(items?.total ?? 0)})`,
      content: blocked ? (
        blockedNotice
      ) : !items?.ok ? (
        <div className="cat-empty" role="alert">
          <div className="cat-empty-icon">⚠️</div>
          出品を読み込めませんでした
        </div>
      ) : items.items.length === 0 ? (
        <div className="cat-empty">
          <div className="cat-empty-icon">🛍</div>
          {items.total > 0 ? "このページには商品がありません" : "公開中の商品はありません"}
        </div>
      ) : (
        <>
          <div className="items-grid">
            {items.items.map((item) => (
              <ItemCard key={item.id} item={item} heart={!own} favorited={favs.has(item.id)} loggedIn={!!viewer} showSeller={false} />
            ))}
          </div>
          <Pager page={page} totalPages={itemPages} hrefFor={(n) => `/sellers/${seller.id}?tab=items${n > 1 ? `&page=${n}` : ""}`} />
        </>
      ),
    },
    {
      key: "tweets",
      label: `つぶやき (${num(posts.total)})`,
      content: blocked ? (
        blockedNotice
      ) : posts.posts.length === 0 ? (
        <div className="cat-empty">
          <div className="cat-empty-icon">💭</div>
          まだつぶやきはありません
        </div>
      ) : (
        <div className="tweet-list">
          {posts.posts.map((p) => {
            const imgs = p.imagePaths.map((x) => postImage(x)).filter((u): u is string => !!u);
            return (
              <div className="tweet-item" key={p.id}>
                <div className="tweet-item-header">
                  <div className="tweet-item-name">
                    {name} {meta ? <span className="cat-tweet-meta">{meta}</span> : null}
                  </div>
                  <Link href={`/tweets/${p.id}`} className="tweet-item-time">
                    {relTime(p.createdAt)}
                  </Link>
                </div>
                <div className="tweet-item-body">
                  {p.pinned ? <span className="cat-pin">📌 固定</span> : null}
                  {p.body}
                </div>
                {imgs.length ? (
                  <div className="cat-tweet-imgs">
                    {imgs.map((src) => (
                      <img key={src} src={src} alt="" loading="lazy" />
                    ))}
                  </div>
                ) : null}
                <div className="tweet-item-footer">
                  <LikeButton
                    id={p.id}
                    initial={liked.has(p.id)}
                    count={p.likeCount}
                    loggedIn={!!viewer}
                    className="ti-action"
                    labels={["♡ {n}", "♥ {n}"]}
                    ariaLabel="いいね"
                  />
                  <Link href={`/tweets/${p.id}`} className="ti-action" aria-label={`コメント ${p.commentCount}件`}>
                    💬 {num(p.commentCount)}
                  </Link>
                </div>
              </div>
            );
          })}
          {posts.total > posts.posts.length ? <div className="cat-note">新しい{POSTS}件を表示しています</div> : null}
        </div>
      ),
    },
    {
      key: "reviews",
      label: `レビュー (${num(reviewTotal)})`,
      content:
        reviews.reviews.length === 0 ? (
          <div className="cat-empty">
            <div className="cat-empty-icon">⭐</div>
            {reviews.ok ? "まだレビューはありません" : "レビューを読み込めませんでした"}
          </div>
        ) : (
          <>
            <div className="review-list">
              {reviews.reviews.map((r) => (
                <div className="review-item" key={r.id}>
                  <div className="review-header">
                    <div className="reviewer">
                      <div className="reviewer-icon">{initialOf(r.buyerName)}</div>
                      <div>
                        <div className="reviewer-name">{r.buyerName}</div>
                        <div className="reviewer-date">{dateJst(r.createdAt)}</div>
                      </div>
                    </div>
                    <div className="review-stars" aria-label={`星${r.rating}`}>
                      <StarRow rating={r.rating} />
                    </div>
                  </div>
                  <div className="review-body">{r.body || "（本文なし）"}</div>
                  {r.title ? (
                    <div className="review-item-name">
                      {categoryIcon(r.category)} {r.title}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            {reviewTotal > reviews.reviews.length ? <div className="cat-note">新しい{REVIEWS}件を表示しています</div> : null}
          </>
        ),
    },
  ];

  return (
    <div className="pg-seller-profile">
      <SiteHeader variant="seller" active="sellers" search={{ action: "/items", placeholder: "商品・出品者を検索" }} />

      <div className="breadcrumb">
        <Link href="/">トップ</Link>
        <span className="bc-sep">›</span>
        <Link href="/sellers">女の子一覧</Link>
        <span className="bc-sep">›</span>
        <span>{name}</span>
      </div>

      <div className="profile-cover fade-in">
        <div className="cover-img">{cover ? <img src={cover} alt="" className="cat-cover-img" /> : "🌸 💕 ✨ 🎀 💗"}</div>
      </div>

      <main className="profile-main fade-in">
        <aside className="sidebar">
          <div className="profile-card">
            <div className="avatar-wrap">
              <div className="profile-avatar">{avatar ? <img src={avatar} alt="" /> : initialOf(seller.publicName)}</div>
              {online ? <div className="online-badge" title="オンライン" /> : null}
            </div>
            <h1 className="profile-name">{name}</h1>
            {seller.kycStatus !== "approved" ? <div className="profile-handle">本人確認が済むまで、このページはあなたにだけ見えています</div> : null}
            <div className="profile-tags">
              {online ? <span className="ptag online">🟢 オンライン</span> : <span className="ptag">{presence(seller.lastSeenAt)}</span>}
              {seller.age ? <span className="ptag age">{seller.age}歳</span> : null}
              {seller.occupation ? <span className="ptag job">{seller.occupation}</span> : null}
              {seller.supportedOptions.includes("same_day") ? <span className="ptag">即日発送</span> : null}
              {seller.supportedOptions.includes("photo") ? <span className="ptag">写真付き</span> : null}
            </div>

            {own ? (
              <>
                <Link href="/mypage/profile" className="btn-follow">
                  ✏️ プロフィールを編集する
                </Link>
                <Link href="/mypage" className="btn-message">
                  マイページへ
                </Link>
              </>
            ) : (
              <>
                <FollowButton
                  id={seller.id}
                  initial={following}
                  loggedIn={!!viewer}
                  className="btn-follow"
                  activeClassName="following"
                  labels={["♡ フォローする", "♥ フォロー中"]}
                  ariaLabel={`${name}をフォロー`}
                />
                {showMessage ? (
                  seller.acceptMessages ? (
                    <MessageButton sellerId={seller.id} loggedIn={!!viewer} className="btn-message" />
                  ) : (
                    <button type="button" className="btn-message" disabled>
                      ✉ メッセージは受け付けていません
                    </button>
                  )
                ) : null}
              </>
            )}

            <div className="profile-stats">
              <div className="pstat">
                <div className="pstat-num">{num(seller.followerCount)}</div>
                <div className="pstat-label">フォロワー</div>
              </div>
              <div className="pstat">
                <div className="pstat-num">{num(seller.salesCount)}</div>
                <div className="pstat-label">販売数</div>
              </div>
              <div className="pstat">
                <div className="pstat-num">{avg}</div>
                <div className="pstat-label">評価</div>
              </div>
            </div>
          </div>

          <div className="info-card">
            <div className="info-title">📋 基本情報</div>
            <div className="info-row">
              <span className="info-label">年齢</span>
              <span className="info-val">{seller.age ? `${seller.age}歳` : "—"}</span>
            </div>
            <div className="info-row">
              <span className="info-label">職業</span>
              <span className="info-val">{seller.occupation || "—"}</span>
            </div>
            <div className="info-row">
              <span className="info-label">身長</span>
              <span className="info-val">{seller.heightCm ? `${seller.heightCm}cm` : "—"}</span>
            </div>
            <div className="info-row">
              <span className="info-label">体型</span>
              <span className="info-val">{labelOf(BODY_TYPES, seller.bodyType) || "—"}</span>
            </div>
            <div className="info-row">
              <span className="info-label">登録日</span>
              <span className="info-val">{dateJst(seller.createdAt)}</span>
            </div>
            <div className="info-row">
              <span className="info-label">最終ログイン</span>
              <span className={`info-val${online ? " green" : ""}`}>{online ? "🟢 オンライン" : presence(seller.lastSeenAt)}</span>
            </div>
            <div className="info-row">
              <span className="info-label">発送目安</span>
              <span className="info-val pk">{labelOf(SHIP_ESTIMATES, seller.shipEstimate) || "—"}</span>
            </div>
            <div className="info-row">
              <span className="info-label">配送方法</span>
              <span className="info-val">{seller.supportedOptions.includes("anonymous") ? "匿名配送対応" : "通常配送"}</span>
            </div>
          </div>

          <div className="info-card">
            <div className="info-title">⭐ 評価・レビュー</div>
            <div className="review-score-row">
              <div className="big-score">{avg}</div>
              <div>
                <div className="stars" aria-hidden="true">
                  <StarRow rating={avgStars} />
                </div>
                <div className="review-count">{num(reviewTotal)}件のレビュー</div>
              </div>
            </div>
            <div className="review-bars">
              {reviews.counts.map((c, i) => (
                <div className="rbar-row" key={5 - i}>
                  <span className="rbar-label">{5 - i}</span>
                  <div className="rbar-track">
                    {c > 0 ? <div className={`rbar-fill r${5 - i}`} style={{ width: `${Math.max(3, Math.round((c / reviewTotal) * 100))}%` }} /> : null}
                  </div>
                  <span className="rbar-count">{num(c)}</span>
                </div>
              ))}
            </div>
          </div>

          {!own ? (
            <div className="report-link">
              <ReportButton type="user" targetId={seller.id} className="cat-linkbtn" label="🚩 このユーザーを通報する" loggedIn={!!viewer} />
              {viewer ? (
                <BlockButton
                  id={seller.id}
                  initial={iBlocked}
                  loggedIn
                  className="cat-linkbtn"
                  labels={["🚫 ブロックする", "🚫 ブロックを解除する"]}
                  confirmOn={`${name}をブロックしますか？ブロックすると、お互いの出品・つぶやき・メッセージが見えなくなります。`}
                />
              ) : null}
            </div>
          ) : null}
        </aside>

        <div className="main-content">
          <SellerTabs key={tab} tabs={tabs} initial={tab} />
        </div>
      </main>

      <SiteFooter variant="seller" />
    </div>
  );
}
