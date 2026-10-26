/* 代理登録した人1人（管理画面）。本人に渡すまでの作業をここでする。
   ① パスワードを決めるリンクを作って本人に送る（本人が決めたら「渡し済み」になり、ここからは作れない）
   ② 本人から受け取った書類で、本人確認を代理で出す（書類を目で見る受け方のときだけ。審査は KYC審査の画面でふつうどおり）
   代理登録の台帳（proxy_registrations）に無い人は 404（ふつうに登録した人は、ここから操作できない）。 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { describeAudit } from "@/components/admin/audit";
import AdminShell from "@/components/admin/AdminShell";
import { kycAppBadge, kycBadge, roleBadge, userStatusBadge } from "@/components/admin/badges";
import ProxyKycForm from "@/components/admin/ProxyKycForm";
import ProxyLinkIssuer from "@/components/admin/ProxyLinkIssuer";
import { Badge, Card, Dl, Empty } from "@/components/admin/parts";
import { kycProvider } from "@/lib/adapters/kyc";
import { nicknamesOf, requireAdminPage } from "@/lib/admin";
import { dateTimeJst } from "@/lib/format";
import { isUuid } from "@/lib/search";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "代理登録の詳細" };

const PROXY_ACTIONS = ["user.proxy_register", "user.proxy_link", "user.proxy_handover", "kyc.proxy_submit"];

/** 今日の日付（日本時間、YYYY-MM-DD） */
function todayJst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
}

export default async function AdminProxyDetailPage({ params }: PageProps<"/admin/proxy/[id]">) {
  await requireAdminPage();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const service = createServiceClient();
  const { data: r, error } = await service
    .from("proxy_registrations")
    .select(
      "user_id, registered_by, note, consent_confirmed_at, link_issued_at, link_issue_count, handed_over_at, created_at, profile:profiles!inner(id, nickname, role, status, kyc_status, created_at)",
    )
    .eq("user_id", id)
    .maybeSingle();
  if (error) console.error("[admin] proxy detail", error.message);
  if (!r) notFound();

  const [auth, kycApp, logs] = await Promise.all([
    service.auth.admin.getUserById(id),
    service
      .from("kyc_applications")
      .select("id, app_no, status, submitted_by, resubmit_allowed, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // id は isUuid で確かめた値だけ（or の文字列に入れる）
    service
      .from("audit_logs")
      .select("id, action, actor_id, target_type, target_id, detail, created_at")
      .in("action", PROXY_ACTIONS)
      .or(`and(target_type.eq.user,target_id.eq.${id}),detail->>user.eq.${id}`)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  if (kycApp.error) console.error("[admin] proxy kyc", kycApp.error.message);
  if (logs.error) console.error("[admin] proxy logs", logs.error.message);
  const p = r.profile;
  const user = auth.data?.user ?? null;
  const app = kycApp.data;
  const names = await nicknamesOf(service, [r.registered_by, app?.submitted_by, ...(logs.data ?? []).map((l) => l.actor_id)]);
  const name = p.nickname || "（名前なし）";
  const active = p.status === "active";
  const manual = kycProvider() === "manual";
  const canSubmitKyc = active && (p.kyc_status === "unsubmitted" || (p.kyc_status === "rejected" && app?.status === "rejected" && app.resubmit_allowed));

  return (
    <AdminShell active="proxy" title="代理登録の詳細">
      <Link href="/admin/proxy" className="adm-back">
        ← 代理登録の一覧へ
      </Link>

      {p.status === "suspended" && <div className="alert-banner danger">⛔ この利用者は利用停止中です。リンクの作成も本人確認の提出もできません。</div>}
      {p.status === "withdrawn" && <div className="alert-banner warn">この利用者は退会済みです。</div>}

      <div className="dual-grid">
        <Card icon="👤" title={name} right={<Badge b={userStatusBadge(p.status)} />}>
          <Dl
            rows={[
              ["ユーザーID", <span className="adm-mono" key="id">{p.id}</span>],
              ["ロール", <Badge b={roleBadge(p.role)} key="role" />],
              ["本人確認", <Badge b={kycBadge(p.kyc_status)} key="kyc" />],
              ["メールアドレス", user?.email ?? (auth.error ? "読めませんでした" : "")],
              ["登録日", dateTimeJst(r.created_at)],
              ["登録した運営", r.registered_by ? (names.get(r.registered_by) ?? "管理者") : "（不明）"],
              ["本人の同意を確かめた日時", dateTimeJst(r.consent_confirmed_at)],
              ["運営のメモ", r.note ? <span className="adm-pre" key="note">{r.note}</span> : ""],
              ["最後のログイン", user?.last_sign_in_at ? dateTimeJst(user.last_sign_in_at) : "まだ"],
            ]}
          />
          <div className="adm-actions" style={{ marginTop: 12 }}>
            <Link href={`/admin/users/${p.id}`} className="action-btn">
              ユーザーの詳細
            </Link>
          </div>
        </Card>

        <Card icon="🔑" tone="yellow" title="① 本人に渡す（パスワードを決めるリンク）" right={r.handed_over_at ? <Badge b={{ cls: "badge-active", label: "渡し済み" }} /> : undefined}>
          {r.handed_over_at ? (
            <Empty>
              本人が {dateTimeJst(r.handed_over_at)} にパスワードを決めました。運営からはリンクを作れません（パスワードを忘れたときは、本人がログイン画面の「パスワードを忘れた方」から再設定します）。
            </Empty>
          ) : !active ? (
            <Empty>この利用者は利用を止めているため、リンクを作れません。</Empty>
          ) : (
            <>
              {r.link_issued_at && (
                <p className="adm-hint" style={{ marginBottom: 10 }}>
                  これまでに {r.link_issue_count}回 作りました（最後: {dateTimeJst(r.link_issued_at)}）。本人はまだパスワードを決めていません。
                </p>
              )}
              <ProxyLinkIssuer userId={p.id} userName={name} issued={r.link_issue_count} />
            </>
          )}
        </Card>
      </div>

      <Card icon="🪪" tone="green" title="② 本人確認を代理で出す">
        {app && (
          <div className="adm-row" style={{ marginBottom: 12 }}>
            <div>
              <div className="adm-row-title">
                <Link href={`/admin/kyc/${app.id}`} className="adm-link">
                  申請 #{app.app_no}
                </Link>{" "}
                <span className="adm-muted">{dateTimeJst(app.created_at)}</span>
              </div>
              <div className="adm-row-note">
                {app.submitted_by ? `運営が代理で提出（${names.get(app.submitted_by) ?? "管理者"}）` : "本人が提出"}
              </div>
            </div>
            <Badge b={kycAppBadge(app.status)} />
          </div>
        )}
        {p.kyc_status === "approved" ? (
          <Empty>本人確認は済んでいます。</Empty>
        ) : p.kyc_status === "pending" ? (
          <Empty>審査中です。KYC審査の画面から、ふつうどおり審査してください。</Empty>
        ) : !active ? (
          <Empty>この利用者は利用を止めているため、本人確認を出せません。</Empty>
        ) : !canSubmitKyc ? (
          <Empty>本人確認の再提出を受け付けていません。KYC審査の画面で再申請を受け付けると、ここから出せます。</Empty>
        ) : !manual ? (
          <Empty>本人確認を確認の会社（TRUSTDOCK）で受けているため、代理では出せません。本人の端末で、ログインしてから出してもらってください。</Empty>
        ) : (
          <ProxyKycForm userId={p.id} userName={name} today={todayJst()} />
        )}
      </Card>

      <Card icon="📋" tone="blue" title="代理登録の記録">
        {logs.error ? (
          <Empty>記録を読めませんでした。時間をおいて読み込み直してください。</Empty>
        ) : (logs.data ?? []).length === 0 ? (
          <Empty>まだ記録がありません。</Empty>
        ) : (
          <div className="activity-list">
            {(logs.data ?? []).map((l) => {
              const view = describeAudit(l, l.actor_id ? (names.get(l.actor_id) ?? null) : null);
              return (
                <div className="activity-item" key={l.id}>
                  <div className={`act-icon ${view.tone}`} aria-hidden="true">
                    {view.icon}
                  </div>
                  <div className="act-text">
                    <strong>[{view.tag}]</strong> {view.text}
                  </div>
                  <div className="act-time">{dateTimeJst(l.created_at)}</div>
                </div>
              );
            })}
          </div>
        )}
        <p className="adm-hint" style={{ marginTop: 10 }}>
          この人のほかの記録は{" "}
          <Link href={`/admin/logs?q=${p.id}`} className="adm-link">
            アクティビティログ
          </Link>
          で見られます。
        </p>
      </Card>
    </AdminShell>
  );
}
