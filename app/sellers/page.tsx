/* /sellers 女の子一覧（見本なし。items_list.html の部品で作る）。
   出すのは出品者・本人確認済み・名前ありの人だけ（lib/catalogue.ts の listSellers）。検索と並べ替えは URL（GET）で持つ */
import "@/styles/items-list.css";
import "@/components/catalogue/catalogue.css";
import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { getViewer } from "@/lib/auth";
import { listSellers, myBlockedIds, type SellerSort } from "@/lib/catalogue";
import { avatarImage } from "@/lib/storage";
import { SUPPORTED_OPTIONS, labelOf } from "@/lib/labels";
import { displayName, excerpt, isOnline, num, ratingAvg } from "@/lib/format";
import AutoSubmitSelect from "@/components/catalogue/AutoSubmitSelect";
import Pager from "@/components/catalogue/Pager";
import { initialOf, isRecent, metaLine } from "@/components/catalogue/card-helpers";

export const metadata: Metadata = {
  title: "女の子一覧",
  description: "本人確認済みの出品者の一覧。フォロワー数・新着・評価の順に並べ替えられます。",
};

const PER_PAGE = 24;
const MAX_PAGE = 100;

const SELLER_SORTS: { value: SellerSort; label: string }[] = [
  { value: "followers", label: "フォロワーが多い順" },
  { value: "new", label: "新着順" },
  { value: "rating", label: "評価が多い順" },
];

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function sellersHref(q: string, sort: SellerSort, page: number): string {
  const sp = new URLSearchParams();
  if (q) sp.set("q", q);
  if (sort !== "followers") sp.set("sort", sort);
  if (page > 1) sp.set("page", String(page));
  const s = sp.toString();
  return s ? `/sellers?${s}` : "/sellers";
}

export default async function SellersPage({ searchParams }: PageProps<"/sellers">) {
  const sp = await searchParams;
  const q = first(sp.q).trim().slice(0, 50);
  const sortRaw = first(sp.sort);
  const sort: SellerSort = SELLER_SORTS.some((s) => s.value === sortRaw) ? (sortRaw as SellerSort) : "followers";
  const pageNum = Number.parseInt(first(sp.page), 10);
  const page = Number.isFinite(pageNum) && pageNum >= 1 ? Math.min(pageNum, MAX_PAGE) : 1;

  const viewer = await getViewer();
  const [result, blocked] = await Promise.all([
    listSellers({ q: q || undefined, sort, limit: PER_PAGE, offset: (page - 1) * PER_PAGE }),
    myBlockedIds(viewer?.id),
  ]);
  // 自分がブロックした人は出さない（件数は DB の数のまま。仮）
  const sellers = result.sellers.filter((s) => !blocked.has(s.id));
  const totalPages = Math.min(MAX_PAGE, Math.ceil(result.total / PER_PAGE));

  return (
    <div className="pg-items-list">
      <SiteHeader variant="list" active="sellers" search={{ action: "/sellers", placeholder: "女の子の名前で検索", defaultValue: q }} />

      <div className="breadcrumb">
        <Link href="/">トップ</Link>
        <span className="bc-sep">›</span>
        <span>女の子一覧</span>
      </div>

      <main className="cat-wide fade-in">
        <form className="search-toolbar" action="/sellers" method="get" role="search">
          <div className="search-big">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input type="search" name="q" maxLength={50} placeholder="名前で検索" aria-label="名前" defaultValue={q} />
          </div>
          <button type="submit" className="search-btn">
            検索
          </button>
          <div className="sort-wrap">
            <span className="sort-label">並び替え：</span>
            <AutoSubmitSelect name="sort" defaultValue={sort} options={SELLER_SORTS} className="sort-select" ariaLabel="並び替え" />
          </div>
        </form>

        <div className="result-header">
          <div className="result-count">
            <strong>{num(result.total)}</strong> 人の女の子
            {q ? `（「${q}」で検索）` : ""}
          </div>
          {q ? (
            <Link href={sellersHref("", sort, 1)} className="cat-linkbtn">
              ✕ 検索をやめる
            </Link>
          ) : null}
        </div>

        {!result.ok ? (
          <div className="cat-empty" role="alert">
            <div className="cat-empty-icon">⚠️</div>
            読み込めませんでした。時間をおいて、もう一度開いてください
          </div>
        ) : sellers.length === 0 ? (
          <div className="cat-empty">
            <div className="cat-empty-icon">🔍</div>
            {q ? "その名前の女の子は見つかりませんでした" : result.total > 0 ? "このページには表示できる人がいません" : "まだ登録している女の子はいません"}
          </div>
        ) : (
          <div className="cat-seller-grid">
            {sellers.map((s) => {
              const avatar = avatarImage(s.avatarPath);
              const name = displayName(s.publicName);
              const meta = metaLine(s.occupation, s.age);
              const tags = s.supportedOptions.filter((o) => o !== "same_day").slice(0, 3);
              return (
                <div className="cat-seller-card" key={s.id}>
                  <div className="cat-avatar">
                    {avatar ? <img src={avatar} alt="" loading="lazy" /> : initialOf(s.publicName)}
                    {isOnline(s.lastSeenAt) ? <span className="cat-online-dot" title="オンライン" /> : null}
                  </div>
                  <Link href={`/sellers/${s.id}`} className="cat-seller-name cat-stretch">
                    {name}
                  </Link>
                  {meta ? <div className="cat-seller-meta">{meta}</div> : null}
                  <div className="cat-seller-bio">{excerpt(s.bio, 40)}</div>
                  <div className="cat-seller-stats">
                    <span>♥ {num(s.followerCount)}</span>
                    <span>📦 {num(s.salesCount)}</span>
                    <span>⭐ {ratingAvg(s.ratingSum, s.ratingCount)}</span>
                  </div>
                  <div className="cat-seller-tags">
                    {isRecent(s.createdAt, 14) ? <span className="cat-pill lilac">NEW</span> : null}
                    {s.supportedOptions.includes("same_day") ? <span className="cat-pill green">即日発送</span> : null}
                    {tags.map((t) => (
                      <span className="cat-pill" key={t}>
                        {labelOf(SUPPORTED_OPTIONS, t) || t}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Pager page={page} totalPages={totalPages} hrefFor={(n) => sellersHref(q, sort, n)} />
      </main>

      <SiteFooter variant="list" />
    </div>
  );
}
