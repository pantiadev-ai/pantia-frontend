/* 売上（見本 panel-sales）。数字・振込できる残高・受けた注文・取引と振込の履歴。出品者だけ */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { dateJst, maskName, num, yen } from "@/lib/format";
import { LEDGER_KINDS } from "@/lib/labels";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import MypageShell from "@/components/mypage/MypageShell";
import OrderRow from "@/components/mypage/OrderRow";
import { getMyBalance, getSellerStats, publicNames } from "@/components/mypage/data";

export const metadata: Metadata = { title: "売上", robots: { index: false, follow: false } };

const TABS = [
  { value: "all", label: "すべて" },
  { value: "open", label: "対応が必要" },
  { value: "shipped", label: "発送済み" },
  { value: "completed", label: "取引完了" },
  { value: "cancelled", label: "キャンセル" },
] as const;
type Tab = (typeof TABS)[number]["value"];

const ORDER_LIMIT = 50;
const LEDGER_LIMIT = 50;

export default async function SalesPage({ searchParams }: PageProps<"/mypage/sales">) {
  const viewer = await requireViewer("/mypage/sales");
  if (viewer.role !== "seller") redirect("/mypage");

  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.value === sp.status) ? (sp.status as Tab) : "all";

  const supabase = await createClient();
  // 支払い待ち（pending）は、まだ注文として確定していないので出さない
  let ordersQuery = supabase
    .from("orders")
    .select("id, title, image_path, subtotal, status, created_at, buyer_id")
    .eq("seller_id", viewer.id);
  if (tab === "open") ordersQuery = ordersQuery.in("status", ["paid", "preparing"]);
  else if (tab === "all") ordersQuery = ordersQuery.neq("status", "pending");
  else ordersQuery = ordersQuery.eq("status", tab);

  const [stats, balance, settings, ordersRes, ledgerRes] = await Promise.all([
    getSellerStats("month"),
    getMyBalance(),
    getSettings(),
    ordersQuery.order("created_at", { ascending: false }).limit(ORDER_LIMIT),
    supabase.rpc("my_ledger", { p_limit: LEDGER_LIMIT }),
  ]);
  if (ordersRes.error) console.error("[mypage] sales orders", ordersRes.error.message);
  if (ledgerRes.error) console.error("[mypage] ledger", ledgerRes.error.message);
  const orders = ordersRes.data ?? [];
  const ledger = ledgerRes.data ?? [];
  const buyers = await publicNames(orders.map((o) => o.buyer_id));

  return (
    <MypageShell active="sales">
      <div className="sales-summary">
        <div className="ss-card">
          <div className="ss-label">今月の売上</div>
          <div className="ss-num">{yen(stats.salesMonth)}</div>
          <div className="ss-sub">手数料後 {yen(stats.netMonth)}</div>
        </div>
        <div className="ss-card">
          <div className="ss-label">累計売上</div>
          <div className="ss-num">{yen(stats.salesTotal)}</div>
          <div className="ss-sub">{num(stats.countTotal)}件の取引</div>
        </div>
        <div className="ss-card">
          <div className="ss-label">振込申請可能額</div>
          <div className="ss-num">{yen(balance)}</div>
          <div className="ss-sub">{yen(settings.minPayout)}から申請可</div>
        </div>
      </div>

      {/* 振込申請へ */}
      <div className="payout-card">
        <div className="payout-header">
          <div className="payout-title">
            <span className="icon-pill">🏦</span> 振込申請
          </div>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>現在の振込可能残高</div>
        <div className="balance-big">{yen(balance)}</div>
        <Link href="/payout" className="btn-payout">
          🏦 振込申請へ
        </Link>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8, fontWeight: 500 }}>
          ※ 口座の登録・申請・履歴は振込のページで行えます
        </div>
      </div>

      {/* 受けた注文 */}
      <div>
        <div className="mp-section-head">
          <h2 className="mp-section-title">
            <span className="icon-pill">🛍</span> 受けた注文
          </h2>
        </div>
        <nav className="mp-tabs" aria-label="注文の状態" style={{ marginBottom: 12 }}>
          {TABS.map((t) => (
            <Link
              key={t.value}
              href={t.value === "all" ? "/mypage/sales" : `/mypage/sales?status=${t.value}`}
              className={`mp-tab${tab === t.value ? " active" : ""}`}
              aria-current={tab === t.value ? "page" : undefined}
              scroll={false}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        {orders.length === 0 ? (
          <div className="mp-empty">{tab === "all" ? "まだ注文はありません。" : "この状態の注文はありません。"}</div>
        ) : (
          <div className="orders-list">
            {orders.map((o) => (
              <OrderRow
                key={o.id}
                id={o.id}
                title={o.title}
                imagePath={o.image_path}
                price={o.subtotal}
                status={o.status}
                createdAt={o.created_at}
                who={maskName(buyers.get(o.buyer_id))}
              />
            ))}
          </div>
        )}
        {orders.length >= ORDER_LIMIT && <p className="mp-hint">新しい順に {ORDER_LIMIT} 件まで出しています。</p>}
      </div>

      {/* 取引・振込の履歴 */}
      <div className="payout-card">
        <div className="payout-header">
          <div className="payout-title">
            <span className="icon-pill">📋</span> 取引・振込履歴
          </div>
        </div>
        {ledger.length === 0 ? (
          <div className="mp-empty">取引が完了すると、ここに売上が記録されます。</div>
        ) : (
          <div className="mp-table-wrap">
            <table className="payout-table">
              <thead>
                <tr>
                  <th>日付</th>
                  <th>内容</th>
                  <th>金額</th>
                  <th>残高</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((e) => (
                  <tr key={e.id}>
                    <td className="mp-muted">{dateJst(e.created_at)}</td>
                    <td>
                      {e.order_id ? (
                        <Link href={`/orders/${e.order_id}`}>{e.note || LEDGER_KINDS[e.kind] || e.kind}</Link>
                      ) : (
                        e.note || LEDGER_KINDS[e.kind] || e.kind
                      )}
                    </td>
                    <td className={e.amount >= 0 ? "tx-plus" : "tx-minus"}>
                      {e.amount >= 0 ? "+ " : "- "}
                      {yen(Math.abs(e.amount))}
                    </td>
                    <td>{yen(Number(e.balance))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </MypageShell>
  );
}
