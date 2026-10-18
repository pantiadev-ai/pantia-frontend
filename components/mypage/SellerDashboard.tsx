/* 出品者のダッシュボード（見本 panel-dashboard）。数字は seller_stats、残高は my_balance。
   対応が要る注文（新規注文・発送準備中）と、最近の出品を並べる。 */
import Link from "next/link";
import type { Viewer } from "@/lib/auth";
import { maskName, num, ratingAvg, yen } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getMyBalance, getMyProfile, getSellerStats, publicNames } from "./data";
import MyItemRow, { MY_LISTING_COLUMNS, type MyListing } from "./MyItemRow";
import OrderRow from "./OrderRow";
import { changeRate, chartLabel } from "./ui";

type Period = "week" | "month" | "year";

const PERIODS: { value: Period; label: string }[] = [
  { value: "week", label: "週" },
  { value: "month", label: "月" },
  { value: "year", label: "年" },
];

export default async function SellerDashboard({ viewer, period }: { viewer: Viewer; period: Period }) {
  const supabase = await createClient();
  const [stats, balance, me, ordersRes, listingsRes] = await Promise.all([
    getSellerStats(period),
    getMyBalance(),
    getMyProfile(),
    supabase
      .from("orders")
      .select("id, title, image_path, subtotal, status, created_at, buyer_id")
      .eq("seller_id", viewer.id)
      .in("status", ["paid", "preparing"])
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("listings")
      .select(MY_LISTING_COLUMNS)
      .eq("seller_id", viewer.id)
      .neq("status", "deleted")
      .order("updated_at", { ascending: false })
      .limit(4),
  ]);
  if (ordersRes.error) console.error("[mypage] dashboard orders", ordersRes.error.message);
  if (listingsRes.error) console.error("[mypage] dashboard listings", listingsRes.error.message);
  const orders = ordersRes.data ?? [];
  const listings = (listingsRes.data ?? []) as MyListing[];
  const buyers = await publicNames(orders.map((o) => o.buyer_id));

  const salesRate = changeRate(stats.salesMonth, stats.salesPrev);
  const countDiff = stats.countMonth - stats.countPrev;
  const max = Math.max(1, ...stats.series.map((s) => s.sales));
  const kycOk = viewer.kycStatus === "approved";

  return (
    <>
      {/* 数字のカード */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-label">💰 今月の売上</div>
          <div className="stat-card-num pk">{yen(stats.salesMonth)}</div>
          <div className="stat-card-sub">
            {salesRate ? (
              <>
                <span className={salesRate.up ? "stat-up" : "mp-stat-down"}>{salesRate.text}</span> 先月比
              </>
            ) : (
              `受け取り見込み ${yen(stats.netMonth)}`
            )}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">📦 今月の販売数</div>
          <div className="stat-card-num">{num(stats.countMonth)}件</div>
          <div className="stat-card-sub">
            {stats.countPrev > 0 || stats.countMonth > 0 ? (
              <>
                <span className={countDiff >= 0 ? "stat-up" : "mp-stat-down"}>
                  {countDiff >= 0 ? "↑" : "↓"} {num(Math.abs(countDiff))}件
                </span>{" "}
                先月比
              </>
            ) : (
              "まだ販売はありません"
            )}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">👁 出品中の商品</div>
          <div className="stat-card-num">{num(stats.published)}件</div>
          <div className="stat-card-sub">
            うち即日対応 <strong style={{ color: "var(--primary)" }}>{num(stats.publishedSameDay)}件</strong>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">⭐ 平均評価</div>
          <div className="stat-card-num pk">{ratingAvg(me?.rating_sum, me?.rating_count)}</div>
          <div className="stat-card-sub">{num(me?.rating_count)}件のレビュー</div>
        </div>
      </div>

      {/* 売上の推移 */}
      <div className="chart-card">
        <div className="chart-header">
          <div className="chart-title">
            <span className="icon-pill">📈</span> 売上推移
          </div>
          <div className="chart-period">
            {PERIODS.map((p) => (
              <Link
                key={p.value}
                href={p.value === "month" ? "/mypage" : `/mypage?period=${p.value}`}
                className={`cp-btn${period === p.value ? " active" : ""}`}
                aria-current={period === p.value ? "true" : undefined}
                scroll={false}
              >
                {p.label}
              </Link>
            ))}
          </div>
        </div>
        {stats.series.length === 0 ? (
          <div className="mp-empty">売上が出ると、ここに推移が出ます。</div>
        ) : (
          <div className="chart-area">
            {stats.series.map((s, i) => (
              <div className="chart-bar-wrap" key={`${s.label}-${i}`}>
                <div
                  className={`chart-bar${i === stats.series.length - 1 ? " active" : ""}`}
                  style={{ height: `${Math.max(2, Math.round((s.sales / max) * 120))}px` }}
                >
                  <div className="chart-bar-tip">{yen(s.sales)}</div>
                </div>
                <div className="chart-label">{chartLabel(s.label, period)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 残高 */}
      <div className="payout-card">
        <div className="payout-header">
          <div className="payout-title">
            <span className="icon-pill">🏦</span> 振込申請できる残高
          </div>
          <Link href="/mypage/sales" className="mp-more">
            売上を見る →
          </Link>
        </div>
        <div className="balance-big">{yen(balance)}</div>
        <Link href="/payout" className="btn-payout">
          🏦 振込へ
        </Link>
      </div>

      {/* 対応が要る注文 */}
      <div>
        <div className="mp-section-head">
          <h2 className="mp-section-title">
            <span className="icon-pill">🛍</span> 対応が必要な注文
            {stats.openOrders > 0 && <span className="side-nav-badge">{num(stats.openOrders)}</span>}
          </h2>
          <Link href="/mypage/sales" className="mp-more">
            全て見る →
          </Link>
        </div>
        {orders.length === 0 ? (
          <div className="mp-empty">今は対応が必要な注文はありません。</div>
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
      </div>

      {/* 最近の出品 */}
      <div>
        <div className="mp-section-head">
          <h2 className="mp-section-title">
            <span className="icon-pill">📦</span> 最近の出品
          </h2>
          <div className="mp-actions">
            <Link href="/listings/new" className="mp-more">
              ＋ 新規出品
            </Link>
            <Link href="/mypage/items" className="mp-more">
              全て見る →
            </Link>
          </div>
        </div>
        {listings.length === 0 ? (
          <div className="mp-empty">
            まだ出品がありません。
            <br />
            <Link href="/listings/new">最初の商品を出品する →</Link>
          </div>
        ) : (
          <div className="my-items-list">
            {listings.map((l) => (
              <MyItemRow key={l.id} item={l} kycOk={kycOk} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
