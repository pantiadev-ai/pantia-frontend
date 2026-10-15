/* /ranking 週間ランキング（見本なし。items_list.html の部品で作る）。
   集計は DB の weekly_ranking（'sellers' と 'listings'）。タブは URL の ?tab= で切り替える */
import "@/styles/items-list.css";
import "@/components/catalogue/catalogue.css";
import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { getViewer } from "@/lib/auth";
import { myBlockedIds, rankingListings, rankingSellers } from "@/lib/catalogue";
import { avatarImage, listingImage } from "@/lib/storage";
import { categoryLabel } from "@/lib/labels";
import { displayName, isOnline, num, yen } from "@/lib/format";
import { categoryIcon, initialOf, metaLine } from "@/components/catalogue/card-helpers";

export const metadata: Metadata = {
  title: "週間ランキング",
  description: "この1週間で人気の女の子と商品のランキング。",
};

const LIMIT = 50;

function rankClass(i: number): string {
  return `cat-rank-num${i === 0 ? " gold" : i === 1 ? " silver" : i === 2 ? " bronze" : ""}`;
}

export default async function RankingPage({ searchParams }: PageProps<"/ranking">) {
  const sp = await searchParams;
  const tabRaw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: "sellers" | "listings" = tabRaw === "listings" ? "listings" : "sellers";

  const viewer = await getViewer();
  const [sellers, listings, blocked] = await Promise.all([
    tab === "sellers" ? rankingSellers(LIMIT) : Promise.resolve(null),
    tab === "listings" ? rankingListings(LIMIT) : Promise.resolve(null),
    myBlockedIds(viewer?.id),
  ]);
  const ok = (sellers ?? listings)?.ok ?? false;
  // 自分がブロックした人と、その人の商品は出さない（順位は詰める。仮）
  const sellerRows = (sellers?.rows ?? []).filter((r) => !blocked.has(r.id));
  const listingRows = (listings?.rows ?? []).filter((r) => !blocked.has(r.sellerId));
  const empty = tab === "sellers" ? sellerRows.length === 0 : listingRows.length === 0;

  return (
    <div className="pg-items-list">
      <SiteHeader variant="list" active="ranking" search={{ action: "/items", placeholder: "商品・出品者を検索" }} />

      <div className="breadcrumb">
        <Link href="/">トップ</Link>
        <span className="bc-sep">›</span>
        <span>週間ランキング</span>
      </div>

      <main className="cat-wide fade-in">
        <div className="result-header">
          <h1 className="cat-page-title">👑 週間ランキング</h1>
          <span className="cat-note">この1週間の注文・お気に入りから集計しています</span>
        </div>

        <div className="cat-tabs">
          <Link href="/ranking" className={`cat-tab${tab === "sellers" ? " active" : ""}`} aria-current={tab === "sellers" ? "page" : undefined}>
            💗 女の子
          </Link>
          <Link href="/ranking?tab=listings" className={`cat-tab${tab === "listings" ? " active" : ""}`} aria-current={tab === "listings" ? "page" : undefined}>
            🛍 商品
          </Link>
        </div>

        {!ok ? (
          <div className="cat-empty" role="alert">
            <div className="cat-empty-icon">⚠️</div>
            ランキングを読み込めませんでした。時間をおいて、もう一度開いてください
          </div>
        ) : empty ? (
          <div className="cat-empty">
            <div className="cat-empty-icon">👑</div>
            今週のランキングはまだありません
          </div>
        ) : tab === "sellers" ? (
          <div className="cat-rank-list">
            {sellerRows.map((r, i) => {
              const avatar = avatarImage(r.avatarPath);
              const meta = metaLine(r.occupation, r.age);
              return (
                <div className="cat-rank-row" key={r.id}>
                  <span className={rankClass(i)}>{i + 1}</span>
                  <div className="cat-avatar sm">
                    {avatar ? <img src={avatar} alt="" loading="lazy" /> : initialOf(r.publicName)}
                    {isOnline(r.lastSeenAt) ? <span className="cat-online-dot" title="オンライン" /> : null}
                  </div>
                  <div className="cat-rank-info">
                    <Link href={`/sellers/${r.id}`} className="cat-rank-title cat-stretch">
                      {displayName(r.publicName)}
                    </Link>
                    <div className="cat-rank-sub">
                      {[meta, `⭐ ${r.ratingCount ? r.rating.toFixed(1) : "-"}`, `📦 ${num(r.salesCount)}件`, `♥ ${num(r.followerCount)}`].filter(Boolean).join(" ・ ")}
                    </div>
                  </div>
                  <div className="cat-rank-val">今週 {num(r.weekOrders)}件</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="cat-rank-list">
            {listingRows.map((r, i) => {
              const img = listingImage(r.imagePath);
              return (
                <div className={`cat-rank-row${r.soldOut ? " cat-soldout" : ""}`} key={r.id}>
                  <span className={rankClass(i)}>{i + 1}</span>
                  <div className="cat-rank-thumb">{img ? <img src={img} alt="" loading="lazy" /> : categoryIcon(r.category)}</div>
                  <div className="cat-rank-info">
                    <Link href={`/items/${r.id}`} className="cat-rank-title cat-stretch">
                      {r.title}
                    </Link>
                    <div className="cat-rank-sub">
                      {[displayName(r.sellerName), categoryLabel(r.category), `♥ ${num(r.likeCount)}`].filter(Boolean).join(" ・ ")}
                    </div>
                  </div>
                  <div className={`cat-rank-val${r.soldOut ? " sold" : ""}`}>{r.soldOut ? "SOLD" : yen(r.price)}</div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <SiteFooter variant="list" />
    </div>
  );
}
