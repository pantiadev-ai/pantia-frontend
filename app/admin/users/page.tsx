/* ユーザー管理（見本の panel-users）。一覧・絞り込み・検索・ページ送りと、ロールの変更申請の承認。
   一覧ではメールアドレスを出さない（1人ずつの詳細ページでだけ Auth から読む）。 */
import type { Metadata } from "next";
import Link from "next/link";
import ActionButton from "@/components/admin/ActionButton";
import AdminShell from "@/components/admin/AdminShell";
import { kycBadge, roleBadge, userStatusBadge } from "@/components/admin/badges";
import { Badge, Empty, FilterBar, Initial, Pager, TableTitle } from "@/components/admin/parts";
import { nicknamesOf, pageOf, param, pick, rangeOf, requireAdminPage } from "@/lib/admin";
import { dateJst, dateTimeJst, num, san } from "@/lib/format";
import { escapeLike, isUuid } from "@/lib/search";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "ユーザー管理" };

const ROLES = ["", "seller", "buyer"] as const;
const STATUSES = ["", "active", "suspended", "withdrawn"] as const;
const KYCS = ["", "unsubmitted", "pending", "approved", "rejected"] as const;

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  await requireAdminPage();
  const sp = await searchParams;
  const q = param(sp, "q", 50);
  const role = pick(param(sp, "role", 10), ROLES, "");
  const status = pick(param(sp, "status", 12), STATUSES, "");
  const kyc = pick(param(sp, "kyc", 12), KYCS, "");
  const page = pageOf(sp);
  const [from, to] = rangeOf(page);

  const service = createServiceClient();
  let query = service
    .from("profiles")
    .select("id, nickname, role, status, kyc_status, created_at, sales_count, purchase_count", { count: "exact" });
  if (role) query = query.eq("role", role);
  if (status) query = query.eq("status", status);
  if (kyc) query = query.eq("kyc_status", kyc);
  if (q) query = isUuid(q) ? query.eq("id", q) : query.ilike("nickname", `%${escapeLike(q)}%`);

  const [users, requests] = await Promise.all([
    query.order("created_at", { ascending: false }).range(from, to),
    service
      .from("role_change_requests")
      .select("id, user_id, from_role, to_role, reason, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50),
  ]);
  if (users.error) console.error("[admin] users", users.error.message);
  if (requests.error) console.error("[admin] role requests", requests.error.message);
  const names = await nicknamesOf(service, (requests.data ?? []).map((r) => r.user_id));
  const rows = users.data ?? [];
  const reqs = requests.data ?? [];
  const filter = { q, role, status, kyc };

  return (
    <AdminShell active="users" title="ユーザー管理">
      {reqs.length > 0 && (
        <div className="table-card">
          <div className="table-toolbar">
            <TableTitle icon="🔄" tone="blue">
              ロールの変更申請（{num(reqs.length)}件）
            </TableTitle>
          </div>
          <div className="adm-scroll">
            <table>
              <thead>
                <tr>
                  <th>ユーザー</th>
                  <th>変更</th>
                  <th>理由</th>
                  <th>申請日時</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {reqs.map((r) => {
                  const name = names.get(r.user_id) ?? "退会したユーザー";
                  return (
                    <tr key={r.id}>
                      <td>
                        <Initial name={name} />
                        <Link href={`/admin/users/${r.user_id}`} className="td-name adm-link">
                          {name}
                        </Link>
                      </td>
                      <td>
                        <Badge b={roleBadge(r.from_role)} /> → <Badge b={roleBadge(r.to_role)} />
                      </td>
                      <td className="adm-pre">{r.reason || <span className="adm-muted">（なし）</span>}</td>
                      <td className="adm-muted">{dateTimeJst(r.created_at)}</td>
                      <td>
                        <div className="adm-actions">
                          <ActionButton
                            op="role.approve"
                            id={r.id}
                            label="承認"
                            className="approve"
                            title="ロールの変更を承認しますか？"
                            body={`${san(name)}を「${roleBadge(r.to_role).label}」に変えます。本人に通知が届きます。`}
                            confirmLabel="承認する"
                          />
                          <ActionButton
                            op="role.reject"
                            id={r.id}
                            label="却下"
                            className="reject"
                            title="ロールの変更を却下しますか？"
                            body={`${san(name)}の申請を却下します。理由は本人に届きます。`}
                            reason="required"
                            reasonLabel="却下の理由"
                            confirmLabel="却下する"
                            danger
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="table-card">
        <FilterBar
          action="/admin/users"
          search={{ value: q, placeholder: "名前・ユーザーIDで検索" }}
          selects={[
            {
              name: "role",
              label: "ロール",
              value: role,
              options: [
                { value: "", label: "全ユーザー" },
                { value: "seller", label: "出品者" },
                { value: "buyer", label: "購入者" },
              ],
            },
            {
              name: "status",
              label: "ステータス",
              value: status,
              options: [
                { value: "", label: "全ステータス" },
                { value: "active", label: "アクティブ" },
                { value: "suspended", label: "停止中" },
                { value: "withdrawn", label: "退会済み" },
              ],
            },
            {
              name: "kyc",
              label: "KYC",
              value: kyc,
              options: [
                { value: "", label: "KYC すべて" },
                { value: "unsubmitted", label: "未提出" },
                { value: "pending", label: "審査中" },
                { value: "approved", label: "確認済み" },
                { value: "rejected", label: "再提出が必要" },
              ],
            },
          ]}
        />
        {users.error ? (
          <Empty>一覧を読めませんでした。時間をおいて読み込み直してください。</Empty>
        ) : rows.length === 0 ? (
          <Empty>{q || role || status || kyc ? "条件に合うユーザーはいません。" : "まだユーザーはいません。"}</Empty>
        ) : (
          <div className="adm-scroll">
            <table>
              <thead>
                <tr>
                  <th>ユーザー</th>
                  <th>ロール</th>
                  <th>KYC</th>
                  <th>登録日</th>
                  <th>取引数</th>
                  <th>ステータス</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <Initial name={u.nickname} />
                      <span className="td-name">{u.nickname || "（名前なし）"}</span>
                    </td>
                    <td>
                      <Badge b={roleBadge(u.role)} />
                    </td>
                    <td>
                      <Badge b={kycBadge(u.kyc_status)} />
                    </td>
                    <td className="adm-muted">{dateJst(u.created_at)}</td>
                    <td>{num(u.role === "seller" ? u.sales_count : u.purchase_count)}件</td>
                    <td>
                      <Badge b={userStatusBadge(u.status)} />
                    </td>
                    <td>
                      <Link href={`/admin/users/${u.id}`} className="action-btn">
                        詳細
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager base="/admin/users" q={filter} page={page} total={users.count ?? 0} />
      </div>
    </AdminShell>
  );
}
