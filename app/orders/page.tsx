/* /orders 注文の一覧（見本なし。pg-app の型）。購入者は買った注文、出品者は売れた注文（売上の管理は /mypage/sales）。
   ?group=<id> は決済の画面から戻ってきたとき。購入者本人なら決済会社に聞き直して結果を出す。 */
import type { Metadata } from "next";
import Link from "next/link";
import "@/styles/app.css";
import PendingGroupActions from "@/components/commerce/PendingGroupActions";
import { publicNames } from "@/components/mypage/data";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { requireViewer } from "@/lib/auth";
import { dateTimeJst, displayName, maskName, orderNo, yen } from "@/lib/format";
import { ORDER_STATUS } from "@/lib/labels";
import { refreshGroupForBuyer, resumeUrlForBuyer, type GroupState } from "@/lib/order-view";
import { isUuid } from "@/lib/search";
import { listingImage } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "注文", robots: { index: false } };

const PAGE = 20;
const FILTERS = [
  { value: "all", label: "すべて" },
  { value: "pending", label: "支払い待ち" },
  { value: "active", label: "取引中" },
  { value: "completed", label: "取引完了" },
  { value: "cancelled", label: "キャンセル" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const sp = await searchParams;
  const filter: Filter = FILTERS.some((f) => f.value === one(sp.status)) ? (one(sp.status) as Filter) : "all";
  const page = Math.min(Math.max(Number.parseInt(one(sp.page) ?? "1", 10) || 1, 1), 500);
  const groupParam = one(sp.group);
  const group = groupParam && isUuid(groupParam) ? groupParam : null;
  const back = one(sp.back) === "1";

  const qs = new URLSearchParams();
  if (filter !== "all") qs.set("status", filter);
  if (page > 1) qs.set("page", String(page));
  if (group) qs.set("group", group);
  const viewer = await requireViewer(`/orders${qs.size ? `?${qs}` : ""}`);
  const asSeller = viewer.role === "seller";

  // 決済から戻ってきた group（購入者本人の物だけ。他人の id なら何も出さない）
  let groupState: GroupState | null = null;
  let resume: string | null = null;
  if (group && !asSeller) {
    groupState = await refreshGroupForBuyer(group, viewer.id);
    if (groupState?.pending) resume = await resumeUrlForBuyer(group, viewer.id);
  }

  const supabase = await createClient();
  let q = supabase
    .from("orders")
    .select("id, order_no, group_id, title, image_path, total, status, buyer_id, seller_id, payment_method, expires_at, needs_refund, refunded_at, created_at", {
      count: "exact",
    })
    .eq(asSeller ? "seller_id" : "buyer_id", viewer.id);
  // 出品者には支払い待ち（まだ売れていない）を出さない
  if (asSeller) q = q.neq("status", "pending");
  if (filter === "pending") q = q.eq("status", "pending");
  else if (filter === "active") q = q.in("status", ["paid", "preparing", "shipped"]);
  else if (filter !== "all") q = q.eq("status", filter);
  const { data: rows, count, error } = await q.order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (error) throw new Error(error.message);
  const orders = rows ?? [];
  const names = await publicNames(orders.map((o) => (asSeller ? o.buyer_id : o.seller_id)).filter((v): v is string => !!v));
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const href = (p: number, f: Filter = filter) => {
    const u = new URLSearchParams();
    if (f !== "all") u.set("status", f);
    if (p > 1) u.set("page", String(p));
    return `/orders${u.size ? `?${u}` : ""}`;
  };

  return (
    <div className="pg-app">
      <SiteHeader variant="app" />
      <main className="app-main">
        <nav className="breadcrumb" aria-label="パンくず">
          <Link href="/">ホーム</Link>›<Link href="/mypage">マイページ</Link>›<span>注文</span>
        </nav>
        <h1 className="page-title">{asSeller ? "売れた注文" : "購入した注文"}</h1>
        <p className="page-sub">
          {asSeller ? (
            <>
              発送の手続きは、注文を開いて行います。売上と振込は<Link href="/mypage/sales">売上の管理</Link>で確かめられます。
            </>
          ) : (
            "注文を開くと、発送の状況や受け取りの手続きができます。"
          )}
        </p>

        {groupState && <GroupBanner state={groupState} back={back} groupId={group!} resume={resume} />}

        <div className="tabs" role="tablist">
          {FILTERS.filter((f) => !(asSeller && f.value === "pending")).map((f) => (
            <Link key={f.value} href={href(1, f.value)} role="tab" aria-selected={f.value === filter} className={f.value === filter ? "active" : undefined}>
              {f.label}
            </Link>
          ))}
        </div>

        {orders.length === 0 ? (
          <div className="card empty">
            <p>注文はまだありません。</p>
            {!asSeller && (
              <Link className="btn primary" href="/items">
                商品を探す
              </Link>
            )}
          </div>
        ) : (
          <div className="card">
            {orders.map((o) => {
              const st = ORDER_STATUS[o.status];
              const img = listingImage(o.image_path);
              const other = asSeller ? maskName(names.get(o.buyer_id ?? "")) : displayName(names.get(o.seller_id ?? ""));
              return (
                <Link className="list-row" href={`/orders/${o.id}`} key={o.id}>
                  {img ? (
                    <img className="thumb" src={img} alt="" loading="lazy" />
                  ) : (
                    <span className="thumb" aria-hidden="true" />
                  )}
                  <div className="grow">
                    <div className="strong ellipsis">{o.title}</div>
                    <div className="muted">
                      {orderNo(o.order_no)}・{other}・{dateTimeJst(o.created_at)}
                    </div>
                    {o.status === "pending" && o.expires_at && <div className="sub">お支払いの期限: {dateTimeJst(o.expires_at)}</div>}
                    {o.status === "cancelled" && (o.needs_refund || o.refunded_at) && (
                      <div className="sub">{o.refunded_at ? "返金済み" : "返金の手続き中"}</div>
                    )}
                  </div>
                  <div className="stack" style={{ alignItems: "flex-end" }}>
                    <span className={`chip ${st?.tone ?? "gray"}`}>{st?.label ?? o.status}</span>
                    <span className="price">{yen(o.total)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {pages > 1 && (
          <nav className="pager" aria-label="ページ">
            {page > 1 ? <Link href={href(page - 1)}>前へ</Link> : <span />}
            <span>
              {page} / {pages}
            </span>
            {page < pages ? <Link href={href(page + 1)}>次へ</Link> : <span />}
          </nav>
        )}
      </main>
      <SiteFooter variant="app" />
    </div>
  );
}

function GroupBanner({ state, back, groupId, resume }: { state: GroupState; back: boolean; groupId: string; resume: string | null }) {
  if (state.paid) {
    return <p className="notice ok">お支払いを確認しました。出品者が発送の準備をします。発送されたらお知らせします。</p>;
  }
  if (state.cancelled) {
    return <p className="notice">この注文は取り消されています。もう一度買うときは、商品のページからカートに入れてください。</p>;
  }
  if (!state.pending) return null;
  const text = back
    ? "お支払いが済んでいません。お支払いを続けるか、注文を取り消してください。"
    : state.method === "bank"
      ? "お振り込みをお待ちしています。入金を確かめると、自動で注文が進みます（確かめるまで少し時間がかかることがあります）。"
      : "お支払いの確認を待っています。少しおいて、画面を読み込み直してください。";
  return (
    <div className="notice warn">
      <p>{text}</p>
      {state.expiresAt && <p className="sub">お支払いの期限: {dateTimeJst(state.expiresAt)}（過ぎると自動で取り消されます）</p>}
      <PendingGroupActions groupId={groupId} resumeUrl={resume} />
    </div>
  );
}
