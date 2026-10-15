/* /items/[id] 商品ページ（見本: item_detail.html）。
   出品は利用者の権限（RLS）で読む。読めない（非公開・ブロック・フォロワー限定など）なら 404。
   値段は DB（quote_listing）の答えだけを出す。買う・カートに入れるは PurchasePanel から server action で。 */
import "@/styles/item-detail.css";
import "@/components/catalogue/catalogue.css";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ReportButton from "@/components/ReportButton";
import { FollowButton } from "@/components/ToggleButtons";
import { getViewer } from "@/lib/auth";
import {
  bumpListingView,
  favoriteIds,
  getListingDetail,
  getSellerProfile,
  initialQuote,
  isFollowing,
  searchListings,
  sellerReviews,
  type ListingDetail,
} from "@/lib/catalogue";
import { getSettings } from "@/lib/settings";
import { isUuid } from "@/lib/search";
import { avatarImage, listingImage } from "@/lib/storage";
import { COLORS, MATERIALS, SHIP_ESTIMATES, SIZES, categoryLabel, labelOf } from "@/lib/labels";
import { dateJst, displayName, excerpt, isOnline, num, presence, ratingAvg, yen } from "@/lib/format";
import Gallery from "@/components/catalogue/Gallery";
import MessageButton from "@/components/catalogue/MessageButton";
import PurchasePanel, { type PurchaseMode } from "@/components/catalogue/PurchasePanel";
import { categoryIcon, initialOf } from "@/components/catalogue/card-helpers";
import { itemsHref, parseItemsQuery } from "@/components/catalogue/items-query";

/** 同じ出品者の他の商品の数 */
const RELATED = 8;
/** 延長できる日数の上限（DB の worn_days の上限と同じ） */
const MAX_DAYS = 30;

export async function generateMetadata({ params }: PageProps<"/items/[id]">): Promise<Metadata> {
  const { id } = await params;
  const item = isUuid(id) ? await getListingDetail(id) : null;
  if (!item) return { title: "商品が見つかりません", robots: { index: false } };
  return {
    title: item.title || "商品",
    description: excerpt(item.description, 100) || undefined,
    // 公開中で誰でも見られる物だけ検索に載せる
    robots: item.status === "published" && !item.followersOnly ? undefined : { index: false },
  };
}

/** 商品情報の「オプション」の行 */
function optionText(l: ListingDetail): string {
  const list = [
    l.optPhoto && "着用写真",
    l.optLetter && "手紙同封",
    l.optVideo && "着用動画",
    l.optExtend && "着用日数の延長",
    l.optZiplock && "ジップロック",
    l.optCard && "メッセージカード",
  ].filter(Boolean);
  return list.length ? list.join("・") : "なし";
}

function unavailableText(status: string): string {
  if (status === "sold") return "この商品は売り切れました。";
  return "この商品は今は公開されていないため、購入できません。";
}

function Stars({ rating }: { rating: number }) {
  return (
    <>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= rating ? "star-full" : "star-off"}>
          ★
        </span>
      ))}
    </>
  );
}

export default async function ItemDetailPage({ params }: PageProps<"/items/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const item = await getListingDetail(id);
  if (!item) notFound();

  const viewer = await getViewer();
  const own = viewer?.id === item.sellerId;
  const [seller, quote, settings, favs, following, reviews, related] = await Promise.all([
    getSellerProfile(item.sellerId),
    item.status === "published" ? initialQuote(item.id) : Promise.resolve(null),
    getSettings(),
    own ? Promise.resolve(new Set<string>()) : favoriteIds(viewer?.id, [item.id]),
    own ? Promise.resolve(false) : isFollowing(viewer?.id, item.sellerId),
    sellerReviews(item.sellerId, 5),
    searchListings({ seller: item.sellerId, limit: RELATED + 1, sort: "new" }),
    // 見られた数（自分の出品・非公開は DB 側で数えない）。失敗しても表示は続ける
    own ? Promise.resolve() : bumpListingView(item.id, viewer?.id ?? null),
  ]);

  // 誰が見ているかで、購入欄の出し方を決める
  let mode: PurchaseMode;
  let blockedText: string | undefined;
  if (own) mode = "own";
  else if (item.status !== "published") {
    mode = "unavailable";
    blockedText = unavailableText(item.status);
  } else if (!viewer) mode = "login";
  else if (viewer.status !== "active") {
    mode = "unavailable";
    blockedText = "アカウントが利用できない状態のため、購入できません。";
  } else if (viewer.role === "seller") mode = "seller";
  else mode = "buy";

  const worn = item.wornDays;
  const maxDays = worn === null ? 0 : item.optExtend ? Math.min(MAX_DAYS, Math.max(item.maxWornDays ?? worn, worn)) : worn;
  // 出品者どうしの会話は DB が断るので、購入者とログインしていない人だけに出す（受け付けていない人には出さない）
  const canMessage = !own && (!viewer || viewer.role === "buyer") && !!seller?.acceptMessages;

  const images = item.imagePaths.map((p) => listingImage(p)).filter((u): u is string => !!u);
  const catText = categoryLabel(item.category);
  const catIcon = categoryIcon(item.category);
  const shipText = labelOf(SHIP_ESTIMATES, item.shipEstimate || seller?.shipEstimate) || "—";
  const sellerName = displayName(seller?.publicName);
  const relatedItems = related.items.filter((r) => r.id !== item.id).slice(0, RELATED);
  const sellerAvatar = avatarImage(seller?.avatarPath);
  const online = isOnline(seller?.lastSeenAt);

  const badges = [
    item.sameDay && <span key="sd" className="badge badge-green">⚡ 即日発送</span>,
    item.optPhoto && <span key="ph" className="badge badge-pk">📸 写真付き</span>,
    item.anonymousOk && <span key="an" className="badge badge-lilac">📦 匿名配送可</span>,
    item.optLetter && <span key="lt" className="badge badge-yellow">💌 手紙同封</span>,
    item.optVideo && <span key="vd" className="badge badge-pk">🎬 動画対応</span>,
    item.preMessageOk && <span key="pm" className="badge badge-lilac">💬 事前相談OK</span>,
    item.coolShipping && <span key="cs" className="badge badge-green">❄️ 冷凍便</span>,
    item.followersOnly && <span key="fo" className="badge badge-yellow">🔒 フォロワー限定</span>,
  ].filter(Boolean);

  return (
    <div className="pg-item-detail">
      <SiteHeader variant="detail" active="items" search={{ action: "/items", placeholder: "商品・出品者を検索" }} />

      <div className="breadcrumb">
        <Link href="/">トップ</Link>
        <span className="bc-sep">›</span>
        <Link href="/items">商品一覧</Link>
        {catText && item.category ? (
          <>
            <span className="bc-sep">›</span>
            <Link href={itemsHref(parseItemsQuery({}), { categories: [item.category] })}>{catText}</Link>
          </>
        ) : null}
        <span className="bc-sep">›</span>
        <span>{item.title}</span>
      </div>

      <main className="main fade-in">
        {/* 左: 画像・出品者・商品情報 */}
        <div className="cat-detail-left">
          <Gallery
            images={images}
            title={item.title}
            categoryText={catText}
            categoryIcon={catIcon}
            favorite={own ? null : { listingId: item.id, initial: favs.has(item.id), loggedIn: !!viewer }}
          />

          {seller ? (
            <>
              <Link href={`/sellers/${seller.id}`} className="seller-mini">
                <div className="sm-avatar">
                  {sellerAvatar ? <img src={sellerAvatar} alt="" /> : initialOf(seller.publicName)}
                  {online ? <div className="sm-online" /> : null}
                </div>
                <div className="sm-info">
                  <div className="sm-name">{sellerName}</div>
                  <div className="sm-meta">
                    <span className="sm-stat">⭐ {ratingAvg(seller.ratingSum, seller.ratingCount)}</span>
                    <span className="sm-stat">📦 {num(seller.salesCount)}件販売</span>
                    <span className="sm-stat">{online ? "🟢 オンライン" : presence(seller.lastSeenAt)}</span>
                  </div>
                </div>
                <div className="sm-arrow">›</div>
              </Link>
              {!own ? (
                <div className="cat-seller-actions">
                  <FollowButton
                    id={seller.id}
                    initial={following}
                    loggedIn={!!viewer}
                    className="cat-btn"
                    labels={["♡ フォローする", "♥ フォロー中"]}
                    ariaLabel={`${sellerName}をフォロー`}
                  />
                  {canMessage ? <MessageButton sellerId={seller.id} loggedIn={!!viewer} className="cat-btn" /> : null}
                </div>
              ) : null}
            </>
          ) : null}

          <div className="detail-card">
            <div className="detail-card-title">
              <span className="icon-pill">📋</span> 商品情報
            </div>
            <div className="detail-row">
              <span className="dl">カテゴリ</span>
              <span className="dv">{catText || "—"}</span>
            </div>
            <div className="detail-row">
              <span className="dl">着用日数</span>
              <span className="dv pk">{worn === null ? "—" : item.optExtend && maxDays > worn ? `${worn}日（${maxDays}日まで延長可）` : `${worn}日`}</span>
            </div>
            <div className="detail-row">
              <span className="dl">素材</span>
              <span className="dv">{labelOf(MATERIALS, item.material) || "—"}</span>
            </div>
            <div className="detail-row">
              <span className="dl">色</span>
              <span className="dv">{labelOf(COLORS, item.color) || "—"}</span>
            </div>
            <div className="detail-row">
              <span className="dl">サイズ</span>
              <span className="dv">{labelOf(SIZES, item.size) || "—"}</span>
            </div>
            <div className="detail-row">
              <span className="dl">オプション</span>
              <span className="dv">{optionText(item)}</span>
            </div>
            <div className="detail-row">
              <span className="dl">発送方法</span>
              <span className="dv">{[item.anonymousOk ? "匿名配送可" : "通常配送", item.coolShipping ? "冷凍便" : ""].filter(Boolean).join(" / ")}</span>
            </div>
            <div className="detail-row">
              <span className="dl">発送目安</span>
              <span className="dv green">{shipText}</span>
            </div>
            <div className="detail-row">
              <span className="dl">在庫</span>
              <span className="dv">{item.stockMode === "multiple" ? "複数あり" : "1点のみ"}</span>
            </div>
            <div className="detail-row">
              <span className="dl">出品日</span>
              <span className="dv">{dateJst(item.publishedAt ?? item.createdAt)}</span>
            </div>
          </div>

          <div className="detail-card">
            <div className="detail-card-title">
              <span className="icon-pill">📝</span> 商品説明
            </div>
            <div className="desc-text">{item.description || "説明はまだありません。"}</div>
            {item.ngNote ? <div className="cat-ng">NG: {item.ngNote}</div> : null}
          </div>
        </div>

        {/* 右: 値段・オプション・購入 */}
        <div className="detail">
          <div>
            <div className="item-category">{categoryLabel(item.category, true) || "✨ その他"}</div>
          </div>
          <div>
            <h1 className="item-title">{item.title}</h1>
          </div>

          <PurchasePanel
            listingId={item.id}
            sellerId={item.sellerId}
            mode={mode}
            unavailableText={blockedText}
            wornDays={worn}
            extendable={item.optExtend}
            maxDays={maxDays}
            extendFee={settings.extendFeePerDay}
            videoFee={settings.videoFee}
            anonymousFee={settings.anonymousFee}
            supports={{ photo: item.optPhoto, letter: item.optLetter, anonymous: item.anonymousOk, video: item.optVideo }}
            initialQuote={quote}
            fallbackPrice={item.price}
            kycApproved={viewer?.kycStatus === "approved"}
            requestOnly={item.requestOnly}
            canMessage={canMessage}
            loggedIn={!!viewer}
            badges={badges.length ? <div className="badges-row">{badges}</div> : null}
          />

          {!own ? (
            <div className="cat-row-links">
              <ReportButton type="listing" targetId={item.id} className="cat-linkbtn" label="🚩 この商品を通報する" loggedIn={!!viewer} />
            </div>
          ) : null}
        </div>
      </main>

      {/* 出品者のレビュー */}
      <div className="cat-section fade-in">
        <hr className="divider" />
        <div className="section-title-row">
          <h2 className="section-title">
            <span className="icon-pill">⭐</span> 出品者のレビュー ({num(reviews.total)}件)
          </h2>
          {reviews.total > reviews.reviews.length ? (
            <Link href={`/sellers/${item.sellerId}?tab=reviews`} className="section-link">
              全て見る →
            </Link>
          ) : null}
        </div>
        {reviews.total > 0 ? (
          <>
            <div className="rating-overview">
              <div className="cat-ro-center">
                <div className="rating-score">{ratingAvg(seller?.ratingSum, seller?.ratingCount)}</div>
                <div className="cat-ro-stars" aria-hidden="true">
                  <Stars rating={seller && seller.ratingCount ? Math.round(seller.ratingSum / seller.ratingCount) : 0} />
                </div>
                <div className="cat-ro-count">{num(reviews.total)}件</div>
              </div>
              <div className="cat-rbars">
                {reviews.counts.map((c, i) => (
                  <div className="cat-rbar" key={5 - i}>
                    <span className="cat-rbar-label">{5 - i}</span>
                    <div className="cat-rbar-track">
                      <div className="cat-rbar-fill" style={{ width: `${Math.round((c / reviews.total) * 100)}%` }} />
                    </div>
                    <span className="cat-rbar-count">{num(c)}</span>
                  </div>
                ))}
              </div>
            </div>
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
                      <Stars rating={r.rating} />
                    </div>
                  </div>
                  <div className="review-body">{r.body || "（本文なし）"}</div>
                  {r.title ? (
                    <div className="cat-review-item">
                      {categoryIcon(r.category)} {r.title}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="cat-empty">
            <div className="cat-empty-icon">⭐</div>
            {reviews.ok ? "まだレビューはありません" : "レビューを読み込めませんでした"}
          </div>
        )}
      </div>

      {/* 同じ出品者の他の商品 */}
      <div className="cat-section cat-last fade-in">
        <hr className="divider" />
        <div className="section-title-row">
          <h2 className="section-title">
            <span className="icon-pill">🛍</span> {sellerName}の他の商品
          </h2>
          {relatedItems.length > 0 ? (
            <Link href={`/sellers/${item.sellerId}?tab=items`} className="section-link">
              全て見る →
            </Link>
          ) : null}
        </div>
        {relatedItems.length > 0 ? (
          <div className="related-grid">
            {relatedItems.map((r) => {
              const img = listingImage(r.imagePath);
              return (
                <Link href={`/items/${r.id}`} className="rel-card" key={r.id}>
                  <div className="rel-thumb">
                    {img ? <img src={img} alt="" className="rel-img" loading="lazy" /> : <div className="cat-noimg">{categoryIcon(r.category)}</div>}
                    <div className="rel-tag">{categoryLabel(r.category) || "その他"}</div>
                  </div>
                  <div className="rel-info">
                    <div className="rel-name">{r.title}</div>
                    <div className="rel-seller">{displayName(r.sellerName)}</div>
                    <div className="rel-price">{yen(r.price)}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="cat-empty">
            <div className="cat-empty-icon">🛍</div>
            他に公開中の商品はありません
          </div>
        )}
      </div>

      <SiteFooter variant="detail" />
    </div>
  );
}
