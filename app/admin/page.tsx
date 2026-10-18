/* 管理画面のダッシュボード（見本 admin.html の panel-dashboard）。
   数字は DB の admin_dashboard（管理者かを DB でも確かめる）から1回で読む。グラフは CSS と SVG だけ。 */
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import AdminShell from "@/components/admin/AdminShell";
import { describeAudit } from "@/components/admin/audit";
import { list, n, nOrNull, obj, s } from "@/components/admin/json";
import { BarChart, Card, Diff, Empty, hrefOf, Kpi, Tabs, Donut, type Bar, type Slice } from "@/components/admin/parts";
import { mailMockInProduction, nicknamesOf, param, pick, requireAdminPage } from "@/lib/admin";
import { yen, num, relTime } from "@/lib/format";
import { categoryLabel } from "@/lib/labels";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "ダッシュボード" };

const PERIODS = [
  { key: "3", label: "3ヶ月" },
  { key: "6", label: "6ヶ月" },
  { key: "12", label: "1年" },
] as const;

const COLORS = ["#C455E8", "#2ECC71", "#F39C12", "#3498DB", "#E74C3C", "#7A5A8A"];

export default async function AdminDashboardPage({ searchParams }: PageProps<"/admin">) {
  const me = await requireAdminPage();
  const sp = await searchParams;
  const months = pick(param(sp, "months", 2), ["3", "6", "12"] as const, "6");

  const service = createServiceClient();
  const [dash, logs] = await Promise.all([
    service.rpc("admin_dashboard", { p_admin: me.id, p_months: Number(months) }),
    service
      .from("audit_logs")
      .select("id, action, actor_id, target_type, target_id, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);
  if (dash.error) console.error("[admin] dashboard", dash.error.message);
  if (logs.error) console.error("[admin] audit_logs", logs.error.message);

  const d = obj(dash.data);
  const actors = await nicknamesOf(service, (logs.data ?? []).map((l) => l.actor_id));

  const monthly: Bar[] = list(d.monthly).map((m) => {
    const ym = s(m.month);
    return { label: `${Number(ym.slice(5, 7)) || ""}月`, value: n(m.sales), tip: yen(n(m.sales)) };
  });
  const cats = list(d.categories).sort((a, b) => n(b.amount) - n(a.amount));
  const slices: Slice[] = cats.map((c, i) => ({
    label: categoryLabel(s(c.category)) || s(c.category) || "その他",
    value: n(c.amount),
    color: COLORS[i % COLORS.length]!,
  }));
  const catCount = cats.reduce((sum, c) => sum + n(c.n), 0);
  const week: Bar[] = list(d.new_users_week).map((w) => {
    const day = s(w.day);
    return { label: `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`, value: n(w.n), tip: `${num(n(w.n))}人` };
  });
  const rating = nOrNull(d.rating_avg);

  const alerts: { tone: "warn" | "danger"; text: ReactNode; href: string }[] = [];
  if (mailMockInProduction()) {
    alerts.push({
      tone: "danger",
      text: (
        <>
          ⚠️ <strong>本番なのにメールが mock</strong>（送らずに控えだけ）になっています。環境変数 MAIL_MODE を live にしてください。
        </>
      ),
      href: "/admin/settings",
    });
  }
  if (n(d.refunds_open) > 0) {
    alerts.push({ tone: "danger", text: <>💸 <strong>返金待ちが{num(n(d.refunds_open))}件</strong>あります。返金をやり直してください。</>, href: "/admin/orders" });
  }
  if (n(d.kyc_open) > 0) {
    alerts.push({ tone: "warn", text: <>⚠️ <strong>KYC未審査が{num(n(d.kyc_open))}件</strong>あります。早めにご確認ください。</>, href: "/admin/kyc" });
  }
  if (n(d.reports_open) > 0) {
    alerts.push({ tone: "warn", text: <>🚩 <strong>未対応の通報が{num(n(d.reports_open))}件</strong>あります。</>, href: "/admin/reports" });
  }
  if (n(d.held_open) > 0) {
    alerts.push({ tone: "warn", text: <>🛡 <strong>保留中の投稿が{num(n(d.held_open))}件</strong>あります。</>, href: "/admin/moderation" });
  }
  if (n(d.payouts_open_n) > 0) {
    alerts.push({
      tone: "warn",
      text: (
        <>
          💰 <strong>振込申請が{num(n(d.payouts_open_n))}件</strong>（合計 {yen(n(d.payouts_open_sum))}）あります。
        </>
      ),
      href: "/admin/sales",
    });
  }
  if (n(d.role_requests_open) > 0) {
    alerts.push({ tone: "warn", text: <>🔄 <strong>ロールの変更申請が{num(n(d.role_requests_open))}件</strong>あります。</>, href: "/admin/users" });
  }

  return (
    <AdminShell active="dashboard" title="ダッシュボード">
      {dash.error && <div className="alert-banner danger">⚠️ 集計を読めませんでした。時間をおいて読み込み直してください。</div>}
      {alerts.map((a, i) => (
        <div key={i} className={`alert-banner ${a.tone}`}>
          <span>{a.text}</span>
          <Link href={a.href} className="adm-link" style={{ marginLeft: "auto", color: a.tone === "danger" ? "var(--red2)" : "var(--yellow2)", whiteSpace: "nowrap" }}>
            確認する →
          </Link>
        </div>
      ))}

      <div className="kpi-grid">
        <Kpi tone="pk" label="💰 今月の総売上" value={yen(n(d.sales_month))} sub={<><Diff now={n(d.sales_month)} prev={n(d.sales_prev)} unit="%" /> 先月比</>} />
        <Kpi
          tone="green"
          label="👥 総ユーザー数"
          value={num(n(d.users_total))}
          sub={
            <>
              <span className="kpi-up">↑ {num(n(d.users_month))}人</span> 今月
            </>
          }
        />
        <Kpi tone="yellow" label="📦 今月の取引数" value={`${num(n(d.trades_month))}件`} sub={<><Diff now={n(d.trades_month)} prev={n(d.trades_prev)} unit="件" /> 先月比</>} />
        <Kpi
          tone="blue"
          label="⭐ 平均評価"
          value={rating == null ? "-" : rating.toFixed(2)}
          sub={
            <>
              レビュー <strong style={{ color: "var(--text)" }}>{num(n(d.reviews_total))}件</strong>・全取引 {num(n(d.trades_total))}件
            </>
          }
        />
      </div>

      <div className="dual-grid">
        <Card
          icon="📈"
          title="月別売上"
          right={<Tabs active={months} items={PERIODS.map((p) => ({ key: p.key, label: p.label, href: hrefOf("/admin", { months: p.key === "6" ? "" : p.key }) }))} />}
        >
          {monthly.length > 0 ? <BarChart data={monthly} label="月別売上" /> : <Empty>まだ売上がありません。</Empty>}
        </Card>
        <Card icon="🥧" tone="green" title="カテゴリ別売上（今月）">
          {slices.length > 0 ? <Donut slices={slices} center={num(catCount)} /> : <Empty>今月の取引はまだありません。</Empty>}
        </Card>
      </div>

      <div className="dual-grid">
        <Card icon="⚡" title="最近のアクティビティ" right={<Link href="/admin/logs" className="adm-link">すべて見る →</Link>}>
          {(logs.data ?? []).length === 0 ? (
            <Empty>まだ記録がありません。</Empty>
          ) : (
            <div className="activity-list">
              {(logs.data ?? []).map((l) => {
                const view = describeAudit(l, l.actor_id ? (actors.get(l.actor_id) ?? null) : null);
                return (
                  <div className="activity-item" key={l.id}>
                    <div className={`act-icon ${view.tone}`} aria-hidden="true">
                      {view.icon}
                    </div>
                    <div className="act-text">
                      <strong>[{view.tag}]</strong>{" "}
                      {view.href ? (
                        <Link href={view.href} className="adm-link" style={{ fontWeight: 400 }}>
                          {view.text}
                        </Link>
                      ) : (
                        view.text
                      )}
                    </div>
                    <div className="act-time">{relTime(l.created_at)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        <Card icon="👥" tone="green" title="新規ユーザー（この7日）">
          {week.length > 0 ? <BarChart data={week} height={110} tone="green" label="新規ユーザー" /> : <Empty>まだ登録がありません。</Empty>}
          <div className="adm-stat-grid" style={{ marginTop: 14 }}>
            <div className="adm-stat">
              <b style={{ color: "var(--green2)" }}>{num(n(d.sellers_month))}</b>
              <span>出品者（今月）</span>
            </div>
            <div className="adm-stat">
              <b style={{ color: "var(--blue2)" }}>{num(n(d.buyers_month))}</b>
              <span>購入者（今月）</span>
            </div>
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}
