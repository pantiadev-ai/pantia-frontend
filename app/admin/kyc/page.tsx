/* KYC審査の一覧（見本の panel-kyc）。最初は「未審査・審査中」だけを古い順に出す。
   書類の画像は一覧では読まない（詳細ページで「書類を見る」を押したときだけ、期限つき URL を作る）。 */
import type { Metadata } from "next";
import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";
import { kycAppBadge, roleBadge } from "@/components/admin/badges";
import { Badge, Empty, FilterBar, Initial, Pager, TableTitle } from "@/components/admin/parts";
import { pageOf, param, pick, rangeOf, requireAdminPage } from "@/lib/admin";
import { dateTimeJst, num } from "@/lib/format";
import { KYC_DOC_TYPES, labelOf } from "@/lib/labels";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "KYC審査" };

const STATUSES = ["open", "pending", "reviewing", "approved", "rejected", "all"] as const;

export default async function AdminKycPage({ searchParams }: PageProps<"/admin/kyc">) {
  await requireAdminPage();
  const sp = await searchParams;
  const status = pick(param(sp, "status", 10), STATUSES, "open");
  const page = pageOf(sp);
  const [from, to] = rangeOf(page);

  const service = createServiceClient();
  let query = service
    .from("kyc_applications")
    .select("id, app_no, user_id, provider, doc_type, status, resubmit_allowed, created_at, decided_at", { count: "exact" });
  if (status === "open") query = query.in("status", ["pending", "reviewing"]);
  else if (status !== "all") query = query.eq("status", status);
  query = status === "open" || status === "pending" || status === "reviewing" ? query.order("created_at", { ascending: true }) : query.order("created_at", { ascending: false });

  const [apps, open] = await Promise.all([
    query.range(from, to),
    service.from("kyc_applications").select("id", { count: "exact", head: true }).in("status", ["pending", "reviewing"]),
  ]);
  if (apps.error) console.error("[admin] kyc", apps.error.message);
  const rows = apps.data ?? [];
  const ids = [...new Set(rows.map((r) => r.user_id))];
  const { data: people } = ids.length > 0 ? await service.from("profiles").select("id, nickname, role").in("id", ids) : { data: [] };
  const byId = new Map((people ?? []).map((p) => [p.id, p]));
  const openCount = open.count ?? 0;

  return (
    <AdminShell active="kyc" title="KYC審査">
      {openCount > 0 && (
        <div className="alert-banner warn">
          ⚠️ <strong>{num(openCount)}件の未審査申請</strong>があります。48時間以内の審査を推奨します。
        </div>
      )}

      <div className="table-card">
        <FilterBar
          action="/admin/kyc"
          title={
            <TableTitle icon="🪪" tone="yellow">
              KYC申請一覧
            </TableTitle>
          }
          selects={[
            {
              name: "status",
              label: "状態",
              value: status,
              options: [
                { value: "open", label: "未審査・審査中" },
                { value: "pending", label: "未審査" },
                { value: "reviewing", label: "審査中" },
                { value: "approved", label: "承認済み" },
                { value: "rejected", label: "否認" },
                { value: "all", label: "全ステータス" },
              ],
            },
          ]}
        />
        {apps.error ? (
          <Empty>一覧を読めませんでした。時間をおいて読み込み直してください。</Empty>
        ) : rows.length === 0 ? (
          <Empty>{status === "open" ? "審査を待っている申請はありません。" : "該当する申請はありません。"}</Empty>
        ) : (
          <div className="adm-scroll">
            <table>
              <thead>
                <tr>
                  <th>申請者</th>
                  <th>ロール</th>
                  <th>書類種別</th>
                  <th>申請日時</th>
                  <th>ステータス</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const p = byId.get(a.user_id);
                  const name = p?.nickname || "退会したユーザー";
                  const open = a.status === "pending" || a.status === "reviewing";
                  return (
                    <tr key={a.id}>
                      <td>
                        <Initial name={name} />
                        <span className="td-name">{name}</span>
                      </td>
                      <td>{p ? <Badge b={roleBadge(p.role)} /> : <span className="adm-muted">—</span>}</td>
                      <td>
                        {labelOf(KYC_DOC_TYPES, a.doc_type) || a.doc_type}
                        {a.provider === "trustdock" && <span className="adm-muted">（TRUSTDOCK）</span>}
                      </td>
                      <td className="adm-muted">{dateTimeJst(a.created_at)}</td>
                      <td>
                        <Badge b={kycAppBadge(a.status)} />
                        {a.status === "rejected" && a.resubmit_allowed && <div className="adm-hint">再申請できる</div>}
                      </td>
                      <td>
                        <Link href={`/admin/kyc/${a.id}`} className={`action-btn${open ? " approve" : ""}`}>
                          {open ? "審査する" : "詳細"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager base="/admin/kyc" q={{ status: status === "open" ? "" : status }} page={page} total={apps.count ?? 0} />
      </div>
    </AdminShell>
  );
}
