"use client";
/* /items の絞り込み（左の欄）と検索・並べ替え（右の上）。
   普通の GET のフォームなので JavaScript が無くても動く。ある時は送る前に URL を整えてから移る
   （空の欄・既定の値を URL に残さない）。チップとチェックは押したらすぐ送る。 */
import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CATEGORIES, SORTS, WORN_FILTERS } from "@/lib/labels";
import { num } from "@/lib/format";
import { ITEM_FLAGS, PRICE_LIMIT, itemsHref, parseItemsQuery, type ItemsState } from "./items-query";
import AutoSubmitSelect from "./AutoSubmitSelect";

type Props = {
  state: ItemsState;
  /** チェックの横に出す件数（search_listings の facets.options） */
  optionCounts: Record<string, number>;
  /** 右の欄の検索・並べ替えより下（絞り込み中の札・カテゴリのタブ・商品・ページ送り） */
  children: ReactNode;
};

const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" aria-hidden="true">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
);

export default function ItemsFilterForm({ state, optionCounts, children }: Props) {
  const router = useRouter();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw: Record<string, string[]> = {};
    new FormData(e.currentTarget).forEach((v, k) => {
      if (typeof v === "string" && v !== "") (raw[k] ??= []).push(v);
    });
    router.push(itemsHref(parseItemsQuery(raw)));
  }

  const submitNow = (e: { currentTarget: HTMLInputElement }) => e.currentTarget.form?.requestSubmit();

  return (
    <form className="cat-filter-form" action="/items" method="get" role="search" onSubmit={onSubmit}>
      {/* ── 左: 絞り込み ── */}
      <aside className="filter-sidebar fade-in">
        <div className="filter-card">
          <div className="filter-title">
            絞り込み
            <Link href="/items" className="filter-reset">
              リセット
            </Link>
          </div>

          <div className="filter-group">
            <div className="filter-label">カテゴリ</div>
            <div className="filter-chips">
              <Link href={itemsHref(state, { categories: [] })} className={`fchip${state.categories.length === 0 ? " active" : ""}`}>
                すべて
              </Link>
              {CATEGORIES.map((c) => {
                const on = state.categories.includes(c.value);
                return (
                  <label key={c.value} className={`fchip${on ? " active" : ""}`}>
                    <input type="checkbox" name="categories" value={c.value} defaultChecked={on} className="cat-hidden-input" onChange={submitNow} />
                    {c.icon} {c.label}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="filter-group">
            <div className="filter-label">価格帯</div>
            <div className="cat-price-row">
              <input
                type="number"
                name="price_min"
                min={0}
                max={PRICE_LIMIT}
                step={100}
                inputMode="numeric"
                placeholder="下限"
                aria-label="価格の下限（円）"
                defaultValue={state.priceMin ?? ""}
              />
              <span>〜</span>
              <input
                type="number"
                name="price_max"
                min={0}
                max={PRICE_LIMIT}
                step={100}
                inputMode="numeric"
                placeholder="上限"
                aria-label="価格の上限（円）"
                defaultValue={state.priceMax ?? ""}
              />
            </div>
            <button type="submit" className="cat-apply">
              この価格で絞り込む
            </button>
          </div>

          <div className="filter-group">
            <div className="filter-label">着用日数</div>
            <div className="filter-chips">
              {WORN_FILTERS.map((w) => {
                const on = state.worn.includes(w.value);
                return (
                  <label key={w.value} className={`fchip${on ? " active" : ""}`}>
                    <input type="checkbox" name="worn" value={w.value} defaultChecked={on} className="cat-hidden-input" onChange={submitNow} />
                    {w.label}
                  </label>
                );
              })}
            </div>
          </div>

          {(["option", "seller"] as const).map((group) => (
            <div className="filter-group" key={group}>
              <div className="filter-label">{group === "option" ? "オプション" : "出品者"}</div>
              {ITEM_FLAGS.filter((f) => f.group === group).map((f) => {
                const on = state.flags.includes(f.key);
                return (
                  <label key={f.key} className="fcheck-row">
                    <input type="checkbox" name={f.key} value="1" defaultChecked={on} className="cat-hidden-input" onChange={submitNow} />
                    <span className={`fcheck${on ? " checked" : ""}`} aria-hidden="true">
                      ✓
                    </span>
                    <span className="fcheck-label">{f.label}</span>
                    <span className="fcheck-count">{num(optionCounts[f.key] ?? 0)}</span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      </aside>

      {/* ── 右: 検索・並べ替えと結果 ── */}
      <div className="main-content fade-in" style={{ transitionDelay: "0.08s" }}>
        <div className="search-toolbar">
          <div className="search-big">
            <SearchIcon />
            <input
              type="search"
              name="q"
              maxLength={50}
              placeholder="キーワードで検索（例：コットン、1日着用）"
              aria-label="キーワード"
              defaultValue={state.q}
            />
          </div>
          <button type="submit" className="search-btn">
            検索
          </button>
          <div className="sort-wrap">
            <span className="sort-label">並び替え：</span>
            <AutoSubmitSelect name="sort" defaultValue={state.sort} options={SORTS} className="sort-select" ariaLabel="並び替え" />
          </div>
        </div>
        {children}
      </div>
    </form>
  );
}
