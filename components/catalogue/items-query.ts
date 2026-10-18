/* /items の絞り込みと URL の行き来。サーバー（ページ）とブラウザ（絞り込みの欄）の両方から使う。
   URL の形: ?q=&categories=panty&categories=bra&price_min=&price_max=&worn=1&worn=4-5&same_day=1…&sort=&page=
   CONVENTIONS の ?category=（1つ）も受け付ける。 */
import { CATEGORIES, SORTS, WORN_FILTERS } from "@/lib/labels";
import { safeSearch } from "@/lib/search";

/** チェックの絞り込み。key は search_listings の key と同じ */
export const ITEM_FLAGS = [
  { key: "same_day", label: "即日発送のみ", short: "即日発送", group: "option" },
  { key: "photo", label: "着用写真付き", short: "写真付き", group: "option" },
  { key: "anonymous", label: "匿名配送対応", short: "匿名配送", group: "option" },
  { key: "letter", label: "手紙同封あり", short: "手紙同封", group: "option" },
  { key: "negotiable", label: "オプション相談可", short: "相談可", group: "option" },
  { key: "online", label: "🟢 オンライン中", short: "オンライン中", group: "seller" },
  { key: "rating4", label: "⭐ 評価4以上", short: "評価4以上", group: "seller" },
  { key: "sales10", label: "📦 10件以上販売", short: "10件以上販売", group: "seller" },
] as const;

export type ItemFlag = (typeof ITEM_FLAGS)[number]["key"];
export type SortValue = (typeof SORTS)[number]["value"];

export type ItemsState = {
  q: string;
  categories: string[];
  priceMin: number | null;
  priceMax: number | null;
  worn: string[];
  flags: ItemFlag[];
  sort: SortValue;
  page: number;
};

/** 1ページの件数（search_listings の上限は60） */
export const ITEMS_PER_PAGE = 24;
/** 価格の上限（search_listings と同じ） */
export const PRICE_LIMIT = 100000;
/** ページの上限（search_listings の offset は10000まで） */
export const MAX_PAGE = Math.floor(10000 / ITEMS_PER_PAGE) + 1;

type RawParams = Record<string, string | string[] | undefined>;

const list = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v : typeof v === "string" ? [v] : []);
const first = (v: string | string[] | undefined): string => list(v)[0] ?? "";
const isOn = (v: string | string[] | undefined) => ["1", "true", "on"].includes(first(v));

function price(v: string | string[] | undefined): number | null {
  const s = first(v).trim();
  if (!/^\d{1,6}$/.test(s)) return null;
  const n = Number(s);
  return n >= 0 && n <= PRICE_LIMIT ? n : null;
}

const CATEGORY_VALUES: readonly string[] = CATEGORIES.map((c) => c.value);
const WORN_VALUES: readonly string[] = WORN_FILTERS.map((w) => w.value);
const SORT_VALUES: readonly string[] = SORTS.map((s) => s.value);

/** URL の searchParams を、使える値だけに絞って読む（知らない値は捨てる） */
export function parseItemsQuery(sp: RawParams): ItemsState {
  const cats = [...list(sp.categories), ...list(sp.category)].filter((c) => CATEGORY_VALUES.includes(c));
  const worn = list(sp.worn).filter((w) => WORN_VALUES.includes(w));
  const sort = first(sp.sort);
  const page = Number(first(sp.page));
  let priceMin = price(sp.price_min);
  let priceMax = price(sp.price_max);
  if (priceMin !== null && priceMax !== null && priceMin > priceMax) [priceMin, priceMax] = [priceMax, priceMin];
  return {
    q: safeSearch(first(sp.q), 50) ?? "",
    categories: [...new Set(cats)],
    priceMin,
    priceMax,
    worn: [...new Set(worn)],
    flags: ITEM_FLAGS.filter((f) => isOn(sp[f.key])).map((f) => f.key),
    sort: (SORT_VALUES.includes(sort) ? sort : "new") as SortValue,
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
  };
}

/** 状態から URL の ? 以降を作る（既定の値は書かない） */
export function itemsSearch(s: ItemsState): string {
  const p = new URLSearchParams();
  if (s.q) p.set("q", s.q);
  s.categories.forEach((c) => p.append("categories", c));
  if (s.priceMin !== null) p.set("price_min", String(s.priceMin));
  if (s.priceMax !== null) p.set("price_max", String(s.priceMax));
  s.worn.forEach((w) => p.append("worn", w));
  s.flags.forEach((f) => p.set(f, "1"));
  if (s.sort !== "new") p.set("sort", s.sort);
  if (s.page > 1) p.set("page", String(s.page));
  return p.toString();
}

/** 一部を替えた URL。ページ以外を替えたら1ページ目に戻す */
export function itemsHref(s: ItemsState, patch: Partial<ItemsState> = {}): string {
  const next: ItemsState = { ...s, page: 1, ...patch };
  const q = itemsSearch(next);
  return q ? `/items?${q}` : "/items";
}

/** 絞り込み中の札（「✕」で1つずつ外す） */
export function activeFilterTags(s: ItemsState): { label: string; href: string }[] {
  const tags: { label: string; href: string }[] = [];
  if (s.q) tags.push({ label: `「${s.q}」`, href: itemsHref(s, { q: "" }) });
  for (const c of s.categories) {
    const cat = CATEGORIES.find((x) => x.value === c);
    tags.push({ label: cat ? cat.label : c, href: itemsHref(s, { categories: s.categories.filter((x) => x !== c) }) });
  }
  if (s.priceMin !== null || s.priceMax !== null) {
    const lo = s.priceMin !== null ? `¥${s.priceMin.toLocaleString("ja-JP")}` : "";
    const hi = s.priceMax !== null ? `¥${s.priceMax.toLocaleString("ja-JP")}` : "";
    tags.push({ label: `${lo}〜${hi}`, href: itemsHref(s, { priceMin: null, priceMax: null }) });
  }
  for (const w of s.worn) {
    const label = WORN_FILTERS.find((x) => x.value === w)?.label ?? w;
    tags.push({ label: `着用${label}`, href: itemsHref(s, { worn: s.worn.filter((x) => x !== w) }) });
  }
  for (const f of s.flags) {
    const label = ITEM_FLAGS.find((x) => x.key === f)?.short ?? f;
    tags.push({ label, href: itemsHref(s, { flags: s.flags.filter((x) => x !== f) }) });
  }
  return tags;
}
