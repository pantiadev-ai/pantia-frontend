/* 自分の出品の一覧（見本 panel-items）。状態のタブ・検索・並び順。出品者だけ */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { num } from "@/lib/format";
import { escapeLike } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";
import MypageShell from "@/components/mypage/MypageShell";
import ItemsToolbar from "@/components/mypage/ItemsToolbar";
import MyItemRow, { MY_LISTING_COLUMNS, type MyListing } from "@/components/mypage/MyItemRow";

export const metadata: Metadata = { title: "出品管理", robots: { index: false, follow: false } };

const TABS = [
  { value: "all", label: "すべて" },
  { value: "draft", label: "下書き" },
  { value: "published", label: "公開中" },
  { value: "private", label: "非公開" },
  { value: "sold", label: "売り切れ" },
  { value: "hidden", label: "停止" },
] as const;
type Tab = (typeof TABS)[number]["value"];

const LIMIT = 100;

export default async function MyItemsPage({ searchParams }: PageProps<"/mypage/items">) {
  const viewer = await requireViewer("/mypage/items");
  if (viewer.role !== "seller") redirect("/mypage");

  const sp = await searchParams;
  const status: Tab = TABS.some((t) => t.value === sp.status) ? (sp.status as Tab) : "all";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 50) : "";
  const sort = sp.sort === "sales" || sp.sort === "views" ? sp.sort : "new";

  const supabase = await createClient();

  // タブの数（状態ごとに件数だけ数える。行を読んで数えると PostgREST の行数の上限（1000）で欠ける）
  const states = TABS.map((t) => t.value).filter((v): v is Exclude<Tab, "all"> => v !== "all");
  const countRes = await Promise.all(
    states.map((s) => supabase.from("listings").select("id", { count: "exact", head: true }).eq("seller_id", viewer.id).eq("status", s)),
  );
  const counts = new Map<string, number>();
  countRes.forEach((r, i) => {
    if (r.error) console.error("[mypage] item counts", r.error.message);
    counts.set(states[i], r.count ?? 0);
  });
  const total = [...counts.values()].reduce((a, b) => a + b, 0);

  let query = supabase.from("listings").select(MY_LISTING_COLUMNS).eq("seller_id", viewer.id).neq("status", "deleted");
  if (status !== "all") query = query.eq("status", status);
  if (q) query = query.ilike("title", `%${escapeLike(q)}%`);
  query =
    sort === "sales"
      ? query.order("sales_count", { ascending: false }).order("created_at", { ascending: false })
      : sort === "views"
        ? query.order("view_count", { ascending: false }).order("created_at", { ascending: false })
        : query.order("created_at", { ascending: false });
  const { data, error } = await query.limit(LIMIT);
  if (error) console.error("[mypage] items", error.message);
  const items = (data ?? []) as MyListing[];
  const kycOk = viewer.kycStatus === "approved";

  const tabHref = (t: Tab) => {
    const p = new URLSearchParams();
    if (t !== "all") p.set("status", t);
    if (q) p.set("q", q);
    if (sort !== "new") p.set("sort", sort);
    const s = p.toString();
    return s ? `/mypage/items?${s}` : "/mypage/items";
  };

  return (
    <MypageShell active="items">
      <ItemsToolbar q={q} status={status} sort={sort} />

      <nav className="mp-tabs" aria-label="出品の状態">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={tabHref(t.value)}
            className={`mp-tab${status === t.value ? " active" : ""}`}
            aria-current={status === t.value ? "page" : undefined}
          >
            {t.label}
            <small>{num(t.value === "all" ? total : (counts.get(t.value) ?? 0))}</small>
          </Link>
        ))}
      </nav>

      {!kycOk && (
        <p className="mp-hint">
          本人確認が済むまでは、下書きの保存だけができます。公開するには<Link href="/kyc">本人確認</Link>を済ませてください。
        </p>
      )}
      {status === "hidden" && items.length > 0 && (
        <p className="mp-hint">停止中の出品は、運営が公開を止めた物です。内容の変更はできません。お問い合わせから運営に連絡してください。</p>
      )}

      {items.length === 0 ? (
        <div className="mp-empty">
          {q || status !== "all" ? (
            "条件に合う出品はありません。"
          ) : (
            <>
              まだ出品がありません。
              <br />
              <Link href="/listings/new">最初の商品を出品する →</Link>
            </>
          )}
        </div>
      ) : (
        <div className="my-items-list">
          {items.map((it) => (
            <MyItemRow key={it.id} item={it} kycOk={kycOk} />
          ))}
        </div>
      )}
      {items.length >= LIMIT && <p className="mp-hint">{LIMIT} 件まで出しています。検索やタブで絞り込んでください。</p>}
    </MypageShell>
  );
}
