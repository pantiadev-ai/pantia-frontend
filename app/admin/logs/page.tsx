/* アクティビティログ（見本の panel-logs）。操作の記録（audit_logs・新しい順・種類で絞り込み）と、メールの送信の控え（mail_outbox）。
   メールは宛先を伏せ、本文は出さない（件名と結果だけ）。 */
import type { Metadata } from "next";
import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";
import { AUDIT_KINDS, describeAudit } from "@/components/admin/audit";
import { Card, Empty, FilterBar, Pager, Tabs, hrefOf } from "@/components/admin/parts";
import { mailMockInProduction, maskEmail, nicknamesOf, pageOf, param, pick, rangeOf, requireAdminPage } from "@/lib/admin";
import { dateTimeJst, excerpt } from "@/lib/format";
import { escapeLike, isUuid } from "@/lib/search";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "アクティビティログ" };

const SIZE = 50;
const KIND_VALUES = AUDIT_KINDS.map((k) => k.value);

export default async function AdminLogsPage({ searchParams }: PageProps<"/admin/logs">) {
  await requireAdminPage();
  const sp = await searchParams;
  const tab = pick(param(sp, "tab", 6), ["audit", "mail"] as const, "audit");
  const page = pageOf(sp);
  const [from, to] = rangeOf(page, SIZE);
  const service = createServiceClient();

  const tabs = (
    <Tabs
      active={tab}
      items={[
        { key: "audit", label: "操作の記録", href: "/admin/logs" },
        { key: "mail", label: "メールの控え", href: hrefOf("/admin/logs", { tab: "mail" }) },
      ]}
    />
  );

  if (tab === "mail") {
    const result = pick(param(sp, "result", 8), ["", "sent", "failed", "mock"] as const, "");
    let query = service.from("mail_outbox").select("id, user_id, to_address, kind, subject, mode, sent, error, created_at", { count: "exact" });
    if (result === "sent") query = query.eq("sent", true);
    else if (result === "failed") query = query.eq("sent", false).not("error", "is", null);
    else if (result === "mock") query = query.eq("mode", "mock");
    const mails = await query.order("created_at", { ascending: false }).range(from, to);
    if (mails.error) console.error("[admin] mail_outbox", mails.error.message);
    const rows = mails.data ?? [];
    const names = await nicknamesOf(
      service,
      rows.map((m) => m.user_id),
    );

    return (
      <AdminShell active="logs" title="アクティビティログ">
        {mailMockInProduction() && <div className="alert-banner danger">⚠️ 本番なのにメールが mock（送らずに控えだけ）になっています。環境変数 MAIL_MODE を live にしてください。</div>}
        <div className="table-card">
          <FilterBar
            action="/admin/logs"
            title={tabs}
            keep={{ tab: "mail" }}
            selects={[
              {
                name: "result",
                label: "結果",
                value: result,
                options: [
                  { value: "", label: "すべて" },
                  { value: "sent", label: "送れた" },
                  { value: "failed", label: "失敗" },
                  { value: "mock", label: "mock（控えだけ）" },
                ],
              },
            ]}
          />
          {mails.error ? (
            <Empty>控えを読めませんでした。時間をおいて読み込み直してください。</Empty>
          ) : rows.length === 0 ? (
            <Empty>メールの控えはありません。</Empty>
          ) : (
            <div className="adm-scroll">
              <table>
                <thead>
                  <tr>
                    <th>日時</th>
                    <th>宛先</th>
                    <th>種類</th>
                    <th>件名</th>
                    <th>結果</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.id}>
                      <td className="adm-muted">{dateTimeJst(m.created_at)}</td>
                      <td>
                        <span className="adm-mono">{maskEmail(m.to_address)}</span>
                        {m.user_id && (
                          <div className="adm-hint">
                            <Link href={`/admin/users/${m.user_id}`} className="adm-link">
                              {names.get(m.user_id) ?? "退会したユーザー"}
                            </Link>
                          </div>
                        )}
                      </td>
                      <td>{m.kind}</td>
                      <td>{excerpt(m.subject, 40)}</td>
                      <td>
                        {m.mode === "mock" ? (
                          <span className="badge badge-muted">mock（控えだけ）</span>
                        ) : m.sent ? (
                          <span className="badge badge-active">送れた</span>
                        ) : m.error ? (
                          <span className="badge badge-reject">失敗</span>
                        ) : (
                          <span className="badge badge-pending">送信待ち</span>
                        )}
                        {m.error && <div className="adm-hint adm-danger-text">{excerpt(m.error, 60)}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager base="/admin/logs" q={{ tab: "mail", result }} page={page} total={mails.count ?? 0} size={SIZE} />
        </div>
      </AdminShell>
    );
  }

  const kind = pick(param(sp, "kind", 20), KIND_VALUES, "");
  const qRaw = param(sp, "q", 50);
  const q = isUuid(qRaw) ? qRaw : "";
  let query = service.from("audit_logs").select("id, action, actor_id, target_type, target_id, detail, created_at", { count: "exact" });
  if (kind) query = query.like("action", `${escapeLike(kind)}%`);
  if (q) query = query.or(`target_id.eq.${q},actor_id.eq.${q}`);
  const logs = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to);
  if (logs.error) console.error("[admin] audit_logs", logs.error.message);
  const rows = logs.data ?? [];
  const actors = await nicknamesOf(
    service,
    rows.map((l) => l.actor_id),
  );

  return (
    <AdminShell active="logs" title="アクティビティログ">
      <Card
        icon="📋"
        tone="blue"
        title="アクティビティログ"
        right={
          <FilterBar
            action="/admin/logs"
            title={tabs}
            search={{ value: q, placeholder: "ユーザーID・対象IDで検索" }}
            selects={[{ name: "kind", label: "種別", value: kind, options: AUDIT_KINDS }]}
          />
        }
      >
        {qRaw && !q && <p className="adm-msg error">検索は ID（ユーザー詳細などに出ている英数字の列）で入れてください。</p>}
        {logs.error ? (
          <Empty>記録を読めませんでした。時間をおいて読み込み直してください。</Empty>
        ) : rows.length === 0 ? (
          <Empty>{kind || q ? "条件に合う記録はありません。" : "まだ記録がありません。"}</Empty>
        ) : (
          <div className="activity-list">
            {rows.map((l) => {
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
                  <div className="act-time">{dateTimeJst(l.created_at)}</div>
                </div>
              );
            })}
          </div>
        )}
        <Pager base="/admin/logs" q={{ kind, q }} page={page} total={logs.count ?? 0} size={SIZE} />
      </Card>
    </AdminShell>
  );
}
