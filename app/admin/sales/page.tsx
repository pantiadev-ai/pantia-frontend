/* 売上・振込管理（見本の panel-sales）。今月の数字・振込申請の処理（振込済み／却下）・台帳の手動の調整。
   口座番号の全桁は、申請中の振込を処理する確認の窓にだけ出す（一覧は下4桁）。 */
import type { Metadata } from "next";
import Link from "next/link";
import ActionButton from "@/components/admin/ActionButton";
import AdminShell from "@/components/admin/AdminShell";
import { payoutBadge } from "@/components/admin/badges";
import { n, obj } from "@/components/admin/json";
import LedgerAdjustForm from "@/components/admin/LedgerAdjustForm";
import { Badge, Card, Empty, Initial, Kpi, Pager, TableTitle, Tabs, hrefOf } from "@/components/admin/parts";
import { nicknamesOf, pageOf, param, pick, rangeOf, requireAdminPage } from "@/lib/admin";
import { dateTimeJst, last4, num, san, yen } from "@/lib/format";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "売上・振込管理" };

const TABS = [
  { key: "requested", label: "申請中" },
  { key: "paid", label: "振込済み" },
  { key: "rejected", label: "差し戻し" },
  { key: "all", label: "すべて" },
] as const;

const ACCOUNT_TYPE: Record<string, string> = { ordinary: "普通", current: "当座" };

export default async function AdminSalesPage({ searchParams }: PageProps<"/admin/sales">) {
  const me = await requireAdminPage();
  const sp = await searchParams;
  const status = pick(param(sp, "status", 10), ["requested", "paid", "rejected", "all"] as const, "requested");
  const page = pageOf(sp);
  const [from, to] = rangeOf(page);

  const service = createServiceClient();
  let query = service
    .from("payouts")
    .select("id, payout_no, user_id, amount, fee, net, bank_name, branch_name, account_type, account_number, account_last4, holder_kana, status, reject_reason, requested_at, decided_at, decided_by", {
      count: "exact",
    });
  if (status !== "all") query = query.eq("status", status);
  query = status === "requested" ? query.order("requested_at", { ascending: true }) : query.order("requested_at", { ascending: false });

  const [dash, settings, payouts] = await Promise.all([
    service.rpc("admin_dashboard", { p_admin: me.id, p_months: 1 }),
    service.from("site_settings").select("fee_rate, payout_fee, min_payout").limit(1).maybeSingle(),
    query.range(from, to),
  ]);
  if (dash.error) console.error("[admin] dashboard", dash.error.message);
  if (settings.error) console.error("[admin] settings", settings.error.message);
  if (payouts.error) console.error("[admin] payouts", payouts.error.message);
  const d = obj(dash.data);
  const rows = payouts.data ?? [];
  const names = await nicknamesOf(service, rows.flatMap((p) => [p.user_id, p.decided_by]));
  const feeRate = settings.data?.fee_rate;

  return (
    <AdminShell active="sales" title="売上・振込管理">
      <div className="kpi-grid">
        <Kpi
          tone="pk"
          label="💰 今月総売上"
          value={yen(n(d.sales_month))}
          sub={
            <>
              手数料収入 <strong style={{ color: "var(--pk4)" }}>{yen(n(d.fee_month))}</strong>
            </>
          }
        />
        <Kpi tone="yellow" label="⏳ 振込申請中" value={yen(n(d.payouts_open_sum))} sub={`${num(n(d.payouts_open_n))}件の申請中`} />
        <Kpi tone="green" label="✅ 今月振込済み" value={yen(n(d.payouts_paid_sum))} sub={`${num(n(d.payouts_paid_n))}件完了`} />
        <Kpi
          tone="blue"
          label="📊 手数料率"
          value={feeRate == null ? "-" : `${Math.round(feeRate * 1000) / 10}%`}
          sub={settings.data ? `振込手数料 ${yen(settings.data.payout_fee)}・最低 ${yen(settings.data.min_payout)}` : "サイト設定で変えられます"}
        />
      </div>

      <div className="table-card">
        <div className="table-toolbar">
          <TableTitle icon="🏦" tone="yellow">
            振込申請一覧
          </TableTitle>
          <div style={{ marginLeft: "auto" }}>
            <Tabs active={status} items={TABS.map((t) => ({ key: t.key, label: t.label, href: hrefOf("/admin/sales", { status: t.key === "requested" ? "" : t.key }) }))} />
          </div>
        </div>
        {status === "requested" && rows.length > 0 && (
          <p className="adm-hint" style={{ margin: "0 16px 12px" }}>
            銀行で振り込んでから「振込済み」を押してください。押すと出品者に通知が届きます。口座の全桁は「振込済み」の確認の窓に出ます。
          </p>
        )}
        {payouts.error ? (
          <Empty>一覧を読めませんでした。時間をおいて読み込み直してください。</Empty>
        ) : rows.length === 0 ? (
          <Empty>{status === "requested" ? "処理を待っている振込申請はありません。" : "該当する振込申請はありません。"}</Empty>
        ) : (
          <div className="adm-scroll">
            <table>
              <thead>
                <tr>
                  <th>申請番号</th>
                  <th>出品者</th>
                  <th>申請額</th>
                  <th>振込額</th>
                  <th>口座</th>
                  <th>申請日</th>
                  <th>ステータス</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const name = names.get(p.user_id) ?? "退会したユーザー";
                  const transfer = [
                    `振込先: ${p.bank_name} ${p.branch_name}`,
                    `口座: ${ACCOUNT_TYPE[p.account_type] ?? p.account_type} ${p.account_number}`,
                    `名義（カナ）: ${p.holder_kana}`,
                    `振込額: ${yen(p.net)}（申請 ${yen(p.amount)} − 振込手数料 ${yen(p.fee)}）`,
                  ].join("\n");
                  return (
                    <tr key={p.id}>
                      <td className="adm-mono">#{p.payout_no}</td>
                      <td>
                        <Initial name={name} />
                        <Link href={`/admin/users/${p.user_id}`} className="td-name adm-link">
                          {name}
                        </Link>
                      </td>
                      <td className="adm-price">{yen(p.amount)}</td>
                      <td>{yen(p.net)}</td>
                      <td className="adm-muted">
                        {p.bank_name} {p.account_last4 ? `****${p.account_last4}` : last4(p.account_number)}
                      </td>
                      <td className="adm-muted">{dateTimeJst(p.requested_at)}</td>
                      <td>
                        <Badge b={payoutBadge(p.status)} />
                        {p.status === "rejected" && p.reject_reason && <div className="adm-hint">{p.reject_reason}</div>}
                        {p.decided_at && (
                          <div className="adm-hint">
                            {dateTimeJst(p.decided_at)}
                            {p.decided_by ? `・${names.get(p.decided_by) ?? "管理者"}` : ""}
                          </div>
                        )}
                      </td>
                      <td>
                        {p.status === "requested" ? (
                          <div className="adm-actions">
                            <ActionButton
                              op="payout.pay"
                              id={p.id}
                              label="振込済み"
                              className="approve"
                              title={`${san(name)}への振込を「振込済み」にしますか？`}
                              body={`${transfer}\n\n銀行で振り込んだ後に押してください。元に戻せません。`}
                              confirmLabel="振込済みにする"
                            />
                            <ActionButton
                              op="payout.reject"
                              id={p.id}
                              label="却下"
                              className="reject"
                              title={`${san(name)}の振込申請を却下しますか？`}
                              body={`申請額 ${yen(p.amount)} を出品者の残高に戻します。理由は本人に届きます。`}
                              reason="required"
                              reasonLabel="却下の理由"
                              confirmLabel="却下する"
                              danger
                            />
                          </div>
                        ) : (
                          <span className="adm-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager base="/admin/sales" q={{ status: status === "requested" ? "" : status }} page={page} total={payouts.count ?? 0} />
      </div>

      <Card icon="✏️" tone="yellow" title="台帳の手動の調整">
        <p className="adm-hint" style={{ marginBottom: 12 }}>
          返金の取りこぼし・二重計上などを直すときに使います。調整はすべて記録に残ります。利用者の詳細ページからも行えます。
        </p>
        <LedgerAdjustForm />
      </Card>
    </AdminShell>
  );
}
