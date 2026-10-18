/* 通報対応（見本の panel-reports）。一覧・種類と状態の絞り込み・対象へのリンク・状態の更新と、対象を非表示にする操作。
   対象の中身は種類ごとにまとめて読む（1行ごとに問い合わせない）。 */
import type { Metadata } from "next";
import Link from "next/link";
import ActionButton from "@/components/admin/ActionButton";
import AdminShell from "@/components/admin/AdminShell";
import { reportBadge, reportTypeBadge } from "@/components/admin/badges";
import { Badge, Empty, FilterBar, Pager } from "@/components/admin/parts";
import { nicknamesOf, pageOf, param, pick, rangeOf, requireAdminPage } from "@/lib/admin";
import { dateTimeJst, excerpt } from "@/lib/format";
import { labelOf, REPORT_REASONS } from "@/lib/labels";
import { isUuid } from "@/lib/search";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "通報対応" };

const TYPES = ["", "listing", "user", "post", "comment", "message"] as const;
const STATUSES = ["active", "open", "reviewing", "resolved", "dismissed", "all"] as const;

type Target = { text: string; href: string | null; status: string | null; hideable: boolean };

export default async function AdminReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  await requireAdminPage();
  const sp = await searchParams;
  const q = param(sp, "q", 50);
  const type = pick(param(sp, "type", 10), TYPES, "");
  const status = pick(param(sp, "status", 10), STATUSES, "active");
  const page = pageOf(sp);
  const [from, to] = rangeOf(page);

  const service = createServiceClient();
  let query = service
    .from("reports")
    .select("id, report_no, reporter_id, target_type, target_id, target_owner, reason, detail, status, resolution_note, handled_by, handled_at, created_at", { count: "exact" });
  if (type) query = query.eq("target_type", type);
  if (status === "active") query = query.in("status", ["open", "reviewing"]);
  else if (status !== "all") query = query.eq("status", status);
  if (q) {
    const no = q.replace(/^#?R?/i, "");
    if (isUuid(q)) query = query.or(`target_id.eq.${q},target_owner.eq.${q}`);
    else if (/^\d{1,9}$/.test(no)) query = query.eq("report_no", Number(no));
  }
  const reports = await query.order("created_at", { ascending: status === "active" }).range(from, to);
  if (reports.error) console.error("[admin] reports", reports.error.message);
  const rows = reports.data ?? [];

  // 対象の中身を種類ごとにまとめて読む
  const idsOf = (t: string) => [...new Set(rows.filter((r) => r.target_type === t && isUuid(r.target_id)).map((r) => r.target_id))];
  const none = { data: [] as never[], error: null };
  const [listings, users, posts, comments, messages, names] = await Promise.all([
    idsOf("listing").length > 0 ? service.from("listings").select("id, title, status").in("id", idsOf("listing")) : none,
    idsOf("user").length > 0 ? service.from("profiles").select("id, nickname, status").in("id", idsOf("user")) : none,
    idsOf("post").length > 0 ? service.from("posts").select("id, body, status").in("id", idsOf("post")) : none,
    idsOf("comment").length > 0 ? service.from("post_comments").select("id, post_id, body, status").in("id", idsOf("comment")) : none,
    idsOf("message").length > 0 ? service.from("messages").select("id, body, kind, status").in("id", idsOf("message")) : none,
    nicknamesOf(
      service,
      rows.flatMap((r) => [r.reporter_id, r.target_owner, r.handled_by]),
    ),
  ]);

  const targets = new Map<string, Target>();
  for (const l of listings.data ?? []) {
    targets.set(`listing:${l.id}`, { text: excerpt(l.title, 24), href: `/admin/items?q=${l.id}`, status: l.status, hideable: l.status !== "hidden" && l.status !== "deleted" });
  }
  for (const u of users.data ?? []) {
    targets.set(`user:${u.id}`, { text: u.nickname || "（名前なし）", href: `/admin/users/${u.id}`, status: u.status, hideable: false });
  }
  for (const p of posts.data ?? []) {
    targets.set(`post:${p.id}`, { text: excerpt(p.body, 30) || "（画像だけ）", href: `/tweets/${p.id}`, status: p.status, hideable: p.status !== "hidden" });
  }
  for (const c of comments.data ?? []) {
    targets.set(`comment:${c.id}`, { text: excerpt(c.body, 30), href: `/tweets/${c.post_id}`, status: c.status, hideable: c.status !== "hidden" });
  }
  for (const m of messages.data ?? []) {
    const system = m.kind === "system" || m.kind === "shipping";
    targets.set(`message:${m.id}`, { text: excerpt(m.body, 30) || "（画像）", href: null, status: m.status, hideable: !system && m.status !== "hidden" });
  }
  const filter = { q, type, status: status === "active" ? "" : status };

  return (
    <AdminShell active="reports" title="通報対応">
      <div className="table-card">
        <FilterBar
          action="/admin/reports"
          search={{ value: q, placeholder: "通報番号・対象のIDで検索" }}
          selects={[
            {
              name: "type",
              label: "種類",
              value: type,
              options: [
                { value: "", label: "全種類" },
                { value: "listing", label: "商品" },
                { value: "user", label: "ユーザー" },
                { value: "post", label: "つぶやき" },
                { value: "comment", label: "コメント" },
                { value: "message", label: "メッセージ" },
              ],
            },
            {
              name: "status",
              label: "状態",
              value: status,
              options: [
                { value: "active", label: "未対応・対応中" },
                { value: "open", label: "未対応" },
                { value: "reviewing", label: "対応中" },
                { value: "resolved", label: "解決済み" },
                { value: "dismissed", label: "問題なし" },
                { value: "all", label: "全ステータス" },
              ],
            },
          ]}
        />
        {reports.error ? (
          <Empty>一覧を読めませんでした。時間をおいて読み込み直してください。</Empty>
        ) : rows.length === 0 ? (
          <Empty>{status === "active" && !type && !q ? "対応を待っている通報はありません。" : "該当する通報はありません。"}</Empty>
        ) : (
          <div className="adm-scroll">
            <table>
              <thead>
                <tr>
                  <th>通報ID</th>
                  <th>種類</th>
                  <th>対象</th>
                  <th>通報理由</th>
                  <th>通報者</th>
                  <th>日時</th>
                  <th>ステータス</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const t = targets.get(`${r.target_type}:${r.target_id}`);
                  const owner = r.target_owner ? (names.get(r.target_owner) ?? "退会したユーザー") : null;
                  const closed = r.status === "resolved" || r.status === "dismissed";
                  const typeLabel = reportTypeBadge(r.target_type).label;
                  return (
                    <tr key={r.id}>
                      <td className="adm-mono adm-price">#R{r.report_no}</td>
                      <td>
                        <Badge b={reportTypeBadge(r.target_type)} />
                      </td>
                      <td>
                        {t ? (
                          t.href ? (
                            <Link href={t.href} className="adm-link">
                              {t.text}
                            </Link>
                          ) : (
                            <span>{t.text}</span>
                          )
                        ) : (
                          <span className="adm-muted">（消えています）</span>
                        )}
                        {t?.status === "hidden" && <div className="adm-hint">非表示済み</div>}
                        {owner && r.target_type !== "user" && r.target_owner && (
                          <div className="adm-hint">
                            投稿者:{" "}
                            <Link href={`/admin/users/${r.target_owner}`} className="adm-link">
                              {owner}
                            </Link>
                          </div>
                        )}
                      </td>
                      <td>
                        {labelOf(REPORT_REASONS, r.reason) || r.reason}
                        {r.detail && (
                          <div className="adm-hint" title={r.detail}>
                            {excerpt(r.detail, 40)}
                          </div>
                        )}
                      </td>
                      <td>{r.reporter_id ? (names.get(r.reporter_id) ?? "退会したユーザー") : "—"}</td>
                      <td className="adm-muted">{dateTimeJst(r.created_at)}</td>
                      <td>
                        <Badge b={reportBadge(r.status)} />
                        {closed && r.resolution_note && <div className="adm-hint">{excerpt(r.resolution_note, 40)}</div>}
                        {r.handled_by && <div className="adm-hint">{names.get(r.handled_by) ?? "管理者"}</div>}
                      </td>
                      <td>
                        <div className="adm-actions">
                          {r.status === "open" && (
                            <ActionButton op="report.reviewing" id={r.id} label="確認" title="この通報を「対応中」にしますか？" body="ほかの管理者に、対応を始めたことがわかるようにします。" confirmLabel="対応中にする" />
                          )}
                          {!closed && (
                            <>
                              <ActionButton
                                op="report.resolved"
                                id={r.id}
                                label="解決"
                                className="approve"
                                title="この通報を「解決済み」にしますか？"
                                body="対象を非表示にした・利用者に警告したなど、対応が済んだときに使います。"
                                reason="optional"
                                reasonLabel="対応の記録"
                                reasonMax={500}
                                confirmLabel="解決済みにする"
                              />
                              <ActionButton
                                op="report.dismissed"
                                id={r.id}
                                label="却下"
                                title="この通報を「問題なし」で閉じますか？"
                                body="規約違反が見つからなかったときに使います。"
                                reason="optional"
                                reasonLabel="判断の理由"
                                reasonMax={500}
                                confirmLabel="問題なしで閉じる"
                              />
                            </>
                          )}
                          {closed && (
                            <ActionButton op="report.open" id={r.id} label="未対応に戻す" title="この通報を「未対応」に戻しますか？" reason="optional" reasonLabel="戻す理由" reasonMax={500} confirmLabel="未対応に戻す" />
                          )}
                          {t?.hideable && r.target_type === "listing" && (
                            <ActionButton
                              op="listing.hide"
                              id={r.target_id}
                              label="非公開"
                              className="reject"
                              title="通報された商品を運営の判断で非公開にしますか？"
                              body={`「${t.text}」を一覧と検索から外します。出品者には理由つきで通知が届きます。通報の状態は別に「解決」にしてください。`}
                              reason="required"
                              reasonLabel="非公開にする理由"
                              confirmLabel="非公開にする"
                              danger
                            />
                          )}
                          {t?.hideable && (r.target_type === "post" || r.target_type === "comment" || r.target_type === "message") && (
                            <ActionButton
                              op="mod.hide"
                              id={r.target_id}
                              sub={r.target_type}
                              label="非表示"
                              className="reject"
                              title={`通報された${typeLabel}を非表示にしますか？`}
                              body={`「${t.text}」を、ほかの人から見えなくします。通報の状態は別に「解決」にしてください。`}
                              confirmLabel="非表示にする"
                              danger
                            />
                          )}
                          {r.target_type === "user" && t && (
                            <Link href={t.href ?? `/admin/users/${r.target_id}`} className="action-btn warn">
                              警告・停止
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager base="/admin/reports" q={filter} page={page} total={reports.count ?? 0} />
      </div>
    </AdminShell>
  );
}
