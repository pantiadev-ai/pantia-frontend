/* /items 商品一覧（見本: items_list.html）。絞り込みはすべて URL（GET）で持つので、共有・戻るがそのまま効く */
import "@/styles/items-list.css";
import "@/components/catalogue/catalogue.css";
import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { getViewer } from "@/lib/auth";
import { favoriteIds, listSellers, searchListings } from "@/lib/catalogue";
import { CATEGORIES } from "@/lib/labels";
import { num } from "@/lib/format";
import ItemCard from "@/components/catalogue/ItemCard";
import ItemsFilterForm from "@/components/catalogue/ItemsFilterForm";
import ItemsGridView from "@/components/catalogue/ItemsGridView";
import Pager from "@/components/catalogue/Pager";
import { ITEMS_PER_PAGE, MAX_PAGE, activeFilterTags, itemsHref, itemsSearch, parseItemsQuery } from "@/components/catalogue/items-query";

export const metadata: Metadata = {
  title: "商品一覧",
  description: "本人確認済みの出品者による商品の一覧。カテゴリ・価格・着用日数・オプションで絞り込めます。",
};

/** 商品の一覧の上に出す、名前の当てはまる出品者の数 */
const SELLER_HITS = 5;

export default async function ItemsPage({ searchParams }: PageProps<"/items">) {
  const state = parseItemsQuery(await searchParams);
  const viewer = await getViewer();
  // 上の検索欄は「商品・出品者を検索」なので、言葉があれば1ページ目に名前の当てはまる出品者も出す
  const [result, sellerHits] = await Promise.all([
    searchListings({
      q: state.q || undefined,
      categories: state.categories,
      priceMin: state.priceMin,
      priceMax: state.priceMax,
      worn: state.worn,
      flags: state.flags,
      sort: state.sort,
      limit: ITEMS_PER_PAGE,
      offset: (state.page - 1) * ITEMS_PER_PAGE,
    }),
    state.q && state.page === 1 ? listSellers({ q: state.q, limit: SELLER_HITS }) : null,
  ]);
  const favs = await favoriteIds(viewer?.id, result.items.map((i) => i.id));
  const totalPages = Math.min(MAX_PAGE, Math.ceil(result.total / ITEMS_PER_PAGE));
  const tags = activeFilterTags(state);
  const catCount = (key: string) => result.facets.categories[key] ?? 0;
  const singleCat = state.categories.length === 1 ? state.categories[0] : null;

  return (
    <div className="pg-items-list">
      <SiteHeader variant="list" active="items" search={{ action: "/items", placeholder: "商品・出品者を検索", defaultValue: state.q }} />

      <div className="breadcrumb">
        <Link href="/">トップ</Link>
        <span className="bc-sep">›</span>
        <span>商品一覧</span>
      </div>

      <main className="page-layout">
        <ItemsFilterForm key={itemsSearch(state)} state={state} optionCounts={result.facets.options}>
          {tags.length > 0 ? (
            <div className="active-filters">
              <span className="af-label">絞り込み中：</span>
              {tags.map((t) => (
                <span className="af-tag" key={t.label}>
                  {t.label}{" "}
                  <Link href={t.href} className="af-remove" aria-label={`${t.label} を外す`}>
                    ✕
                  </Link>
                </span>
              ))}
              <Link href="/items" className="af-clear">
                すべてクリア
              </Link>
            </div>
          ) : null}

          {sellerHits && sellerHits.sellers.length > 0 ? (
            <div className="active-filters" role="group" aria-label="名前が当てはまる女の子">
              <span className="af-label">女の子：</span>
              {sellerHits.sellers.map((s) => (
                <Link key={s.id} href={`/sellers/${s.id}`} className="af-tag">
                  {s.publicName}
                </Link>
              ))}
              {sellerHits.total > sellerHits.sellers.length ? (
                <Link href={`/sellers?q=${encodeURIComponent(state.q)}`} className="af-clear">
                  すべて見る（{num(sellerHits.total)}人）
                </Link>
              ) : null}
            </div>
          ) : null}

          <div className="cat-tabs">
            <Link href={itemsHref(state, { categories: [] })} className={`cat-tab${state.categories.length === 0 ? " active" : ""}`}>
              すべて ({num(catCount("all"))})
            </Link>
            {CATEGORIES.map((c) => (
              <Link key={c.value} href={itemsHref(state, { categories: [c.value] })} className={`cat-tab${singleCat === c.value ? " active" : ""}`}>
                {c.icon} {c.label} ({num(catCount(c.value))})
              </Link>
            ))}
          </div>

          {!result.ok ? (
            <div className="no-result show" role="alert">
              <div className="no-result-icon">⚠️</div>
              <div className="no-result-text">商品を読み込めませんでした</div>
              <div className="no-result-sub">時間をおいて、もう一度開いてください</div>
            </div>
          ) : result.total === 0 ? (
            <div className="no-result show">
              <div className="no-result-icon">🔍</div>
              <div className="no-result-text">検索結果が見つかりませんでした</div>
              <div className="no-result-sub">キーワードや絞り込み条件を変えてみてください</div>
            </div>
          ) : result.items.length === 0 ? (
            <div className="no-result show">
              <div className="no-result-icon">📄</div>
              <div className="no-result-text">このページには商品がありません</div>
              <div className="no-result-sub">
                <Link href={itemsHref(state)}>1ページ目に戻る</Link>
              </div>
            </div>
          ) : (
            <ItemsGridView total={result.total}>
              {result.items.map((item) => (
                <ItemCard key={item.id} item={item} heart={item.sellerId !== viewer?.id} favorited={favs.has(item.id)} loggedIn={!!viewer} />
              ))}
            </ItemsGridView>
          )}

          <Pager page={state.page} totalPages={totalPages} hrefFor={(n) => itemsHref(state, { page: n })} />
        </ItemsFilterForm>
      </main>

      <SiteFooter variant="list" />
    </div>
  );
}
