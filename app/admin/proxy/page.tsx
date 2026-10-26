/* 代理登録（本人に頼まれて、運営が代わりにアカウントを作る）。登録のフォームと、代理登録した人の一覧。
   年齢の確認は省かない。作った人は本人確認が「未提出」のままで、書類を出して承認されるまで出品も購入もできない。
   パスワードは本人が決める（詳細ページでリンクを作って送る）。一覧ではメールアドレスを出さない。 */
import type { Metadata } from "next";
import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";
import { kycBadge, roleBadge, userStatusBadge } from "@/components/admin/badges";
import ProxyRegisterForm from "@/components/admin/ProxyRegisterForm";
import { Badge, Card, Empty, FilterBar, Initial, Pager } from "@/components/admin/parts";
import { nicknamesOf, pageOf, param, pick, rangeOf, requireAdminPage } from "@/lib/admin";
import { dateJst, dateTimeJst, excerpt } from "@/lib/format";
import { escapeLike, isUuid } from "@/lib/search";
import { getSettings } from "@/lib/settings";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "代理登録" };

const HANDOVERS = ["", "waiting", "done"] as const;
const KYCS = ["", "unsubmitted", "pending", "approved", "rejected"] as const;

export default async function AdminProxyPage({ searchParams }: PageProps<"/admin/proxy">) {
  await requireAdminPage();
  const sp = await searchParams;
  const q = param(sp, "q", 50);
  const handover = pick(param(sp, "handover", 10), HANDOVERS, "");
  const kyc = pick(param(sp, "kyc", 12), KYCS, "");
  const page = pageOf(sp);
  const [from, to] = rangeOf(page);

  const service = createServiceClient();
  let query = service
    .from("proxy_registrations")
    .select(
      "user_id, registered_by, note, link_issued_at, link_issue_count, handed_over_at, created_at, profile:profiles!inner(id, nickname, role, status, kyc_status)",
      { count: "exact" },
    );
  if (handover === "waiting") query = query.is("handed_over_at", null);
  if (handover === "done") query = query.not("handed_over_at", "is", null);
  if (kyc) query = query.eq("profile.kyc_status", kyc);
  if (q) query = isUuid(q) ? query.eq("user_id", q) : query.ilike("profile.nickname", `%${escapeLike(q)}%`);

  const [list, settings] = await Promise.all([query.order("created_at", { ascending: false }).range(from, to), getSettings()]);
  if (list.error) console.error("[admin] proxy", list.error.message);
  const rows = list.data ?? [];
  const names = await nicknamesOf(service, rows.map((r) => r.registered_by));
  const filter = { q, handover, kyc };

  return (
    <AdminShell active="proxy" title="代理登録">
      <div className="dual-grid">
        <Card icon="🤝" title="代理で登録する">
          <ProxyRegisterForm closed={!settings.registrationOpen} />
        </Card>
        <Card icon="📝" tone="blue" title="代理登録の決まり">
          <ul className="adm-hint" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9, fontSize: 12 }}>
            <li>本人から頼まれたときだけ使います。本人のメールアドレスで作り、運営のアカウントや架空の人は作りません。</li>
            <li>年齢の確認は省けません。本人確認の書類を出して、審査で承認されるまで、出品も購入もできません。</li>
            <li>パスワードは運営が決めません。詳細ページでリンクを作り、本人だけに送ります。本人が決めると「渡し済み」になります。</li>
            <li>書類は本人から受け取り、「本人の同意を得た」の印を付けて出します。出した運営は記録に残ります。</li>
            <li>メモには連絡の経路などだけを書きます。住所・電話番号・書類の中身は書きません。</li>
            <li>登録・リンクの作成・書類の提出は、すべてアクティビティログに残ります。</li>
          </ul>
        </Card>
      </div>

      <div className="table-card">
        <FilterBar
          action="/admin/proxy"
          search={{ value: q, placeholder: "名前・ユーザーIDで検索" }}
          selects={[
            {
              name: "handover",
              label: "引き渡し",
              value: handover,
              options: [
                { value: "", label: "引き渡し すべて" },
                { value: "waiting", label: "まだ渡していない" },
                { value: "done", label: "渡し済み" },
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
        {list.error ? (
          <Empty>一覧を読めませんでした。時間をおいて読み込み直してください。</Empty>
        ) : rows.length === 0 ? (
          <Empty>{q || handover || kyc ? "条件に合う人はいません。" : "まだ代理登録した人はいません。"}</Empty>
        ) : (
          <div className="adm-scroll">
            <table>
              <thead>
                <tr>
                  <th>ユーザー</th>
                  <th>ロール</th>
                  <th>KYC</th>
                  <th>ステータス</th>
                  <th>引き渡し</th>
                  <th>登録日</th>
                  <th>登録した運営</th>
                  <th>メモ</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const p = r.profile;
                  return (
                    <tr key={r.user_id}>
                      <td>
                        <Initial name={p.nickname} />
                        <Link href={`/admin/users/${r.user_id}`} className="td-name adm-link">
                          {p.nickname || "（名前なし）"}
                        </Link>
                      </td>
                      <td>
                        <Badge b={roleBadge(p.role)} />
                      </td>
                      <td>
                        <Badge b={kycBadge(p.kyc_status)} />
                      </td>
                      <td>
                        <Badge b={userStatusBadge(p.status)} />
                      </td>
                      <td>
                        {r.handed_over_at ? (
                          <Badge b={{ cls: "badge-active", label: `渡し済み ${dateJst(r.handed_over_at)}` }} />
                        ) : r.link_issued_at ? (
                          <span title={`最後に作った日時: ${dateTimeJst(r.link_issued_at)}`}>
                            <Badge b={{ cls: "badge-warn", label: `リンク作成済み（${r.link_issue_count}回）` }} />
                          </span>
                        ) : (
                          <Badge b={{ cls: "badge-muted", label: "リンク未作成" }} />
                        )}
                      </td>
                      <td className="adm-muted">{dateJst(r.created_at)}</td>
                      <td>{r.registered_by ? (names.get(r.registered_by) ?? "管理者") : <span className="adm-muted">（不明）</span>}</td>
                      <td className="adm-muted">{r.note ? excerpt(r.note, 30) : ""}</td>
                      <td>
                        <Link href={`/admin/proxy/${r.user_id}`} className="action-btn">
                          詳細
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager base="/admin/proxy" q={filter} page={page} total={list.count ?? 0} />
      </div>
    </AdminShell>
  );
}
