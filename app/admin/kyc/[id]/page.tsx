/* 本人確認の申請1件（管理画面）。申請の中身・生年月日と年齢・書類を見る・承認／却下。
   書類の画像はここでは読まない。「書類を見る」を押したときだけ server action で期限つき URL を作る（記録に残る）。 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ActionButton from "@/components/admin/ActionButton";
import AdminShell from "@/components/admin/AdminShell";
import { kycAppBadge, kycBadge, roleBadge, userStatusBadge } from "@/components/admin/badges";
import KycReview from "@/components/admin/KycReview";
import { Badge, Card, Dl, Empty } from "@/components/admin/parts";
import { ageOf, nicknamesOf, requireAdminPage } from "@/lib/admin";
import { dateJst, dateTimeJst } from "@/lib/format";
import { KYC_DOC_TYPES, labelOf } from "@/lib/labels";
import { isUuid } from "@/lib/search";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "本人確認の審査" };

export default async function AdminKycDetailPage({ params }: PageProps<"/admin/kyc/[id]">) {
  const me = await requireAdminPage();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const service = createServiceClient();
  const { data: a, error } = await service
    .from("kyc_applications")
    .select("id, app_no, user_id, provider, provider_ref, doc_type, document_paths, birth_date, status, reject_reason, resubmit_allowed, documents_purged_at, created_at, decided_at, decided_by, submitted_by")
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("[admin] kyc app", error.message);
  if (!a) notFound();

  const [profile, history] = await Promise.all([
    service.from("profiles").select("id, nickname, role, status, kyc_status, created_at").eq("id", a.user_id).maybeSingle(),
    service.from("kyc_applications").select("id, app_no, status, reject_reason, created_at").eq("user_id", a.user_id).neq("id", id).order("created_at", { ascending: false }).limit(10),
  ]);
  const names = await nicknamesOf(service, [a.decided_by, a.submitted_by]);
  // 運営が代理で出した申請（lib/actions/proxy.ts）。出した本人が審査するときは注意を出す（止めはしない。運営が1人でも回るように）
  const selfSubmitted = !!a.submitted_by && a.submitted_by === me.id;
  const p = profile.data;
  const age = ageOf(a.birth_date);
  const open = a.status === "pending" || a.status === "reviewing";
  const paths = a.document_paths ?? [];
  const purged = !!a.documents_purged_at || paths.length === 0;

  return (
    <AdminShell active="kyc" title={`本人確認の申請 #${a.app_no}`}>
      <Link href="/admin/kyc" className="adm-back">
        ← KYC申請一覧へ
      </Link>

      {age != null && age < 18 && (
        <div className="alert-banner danger">
          ⛔ <strong>申告の生年月日では{age}歳です。</strong>18歳未満は承認できません。却下して「18歳未満」にチェックを入れてください。
        </div>
      )}

      {selfSubmitted && open && (
        <div className="alert-banner warn">
          この申請は、あなたが代理で出しました。できれば別の運営に審査してもらってください（書類と本人が同じ人か、出した人とは別の目で確かめるため）。
        </div>
      )}

      <div className="dual-grid">
        <Card icon="🪪" tone="yellow" title={`申請 #${a.app_no}`} right={<Badge b={kycAppBadge(a.status)} />}>
          <Dl
            rows={[
              ["書類の種類", labelOf(KYC_DOC_TYPES, a.doc_type) || a.doc_type],
              ["確認の方法", a.provider === "trustdock" ? "TRUSTDOCK（外部の本人確認）" : "運営が書類を見る"],
              ["外部の受付番号", a.provider_ref ? <span className="adm-mono" key="ref">{a.provider_ref}</span> : ""],
              [
                "生年月日",
                a.birth_date ? (
                  <span key="b" className={age != null && age < 18 ? "adm-danger-text" : undefined}>
                    {dateJst(a.birth_date)}（{age == null ? "年齢不明" : `${age}歳`}）
                  </span>
                ) : (
                  ""
                ),
              ],
              ["申請日時", dateTimeJst(a.created_at)],
              [
                "提出した人",
                a.submitted_by ? (
                  <Link key="by" href={`/admin/proxy/${a.user_id}`} className="adm-link">
                    運営が代理で提出（{names.get(a.submitted_by) ?? "管理者"}）
                  </Link>
                ) : (
                  "本人"
                ),
              ],
              ["書類の枚数", purged ? (a.documents_purged_at ? `消去済み（${dateTimeJst(a.documents_purged_at)}）` : "なし") : `${paths.length}枚`],
              ["審査した日時", a.decided_at ? dateTimeJst(a.decided_at) : ""],
              ["審査した人", a.decided_by ? (names.get(a.decided_by) ?? "管理者") : ""],
              ["却下の理由", a.reject_reason ? <span className="adm-pre" key="rr">{a.reject_reason}</span> : ""],
              ["再申請", a.status === "rejected" ? (a.resubmit_allowed ? "受け付ける" : "受け付けない") : ""],
            ]}
          />
        </Card>

        <Card icon="👤" title="申請者">
          {p ? (
            <>
              <Dl
                rows={[
                  ["名前", p.nickname || "（名前なし）"],
                  ["ロール", <Badge b={roleBadge(p.role)} key="r" />],
                  ["状態", <Badge b={userStatusBadge(p.status)} key="s" />],
                  ["本人確認", <Badge b={kycBadge(p.kyc_status)} key="k" />],
                  ["登録日", dateJst(p.created_at)],
                ]}
              />
              <div className="adm-actions" style={{ marginTop: 12 }}>
                <Link href={`/admin/users/${p.id}`} className="action-btn">
                  ユーザーの詳細
                </Link>
              </div>
            </>
          ) : (
            <Empty>この利用者は退会しています。</Empty>
          )}
          {(history.data ?? []).length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="adm-label">これまでの申請</div>
              {(history.data ?? []).map((h) => (
                <div className="adm-row" key={h.id}>
                  <div>
                    <div className="adm-row-title">
                      <Link href={`/admin/kyc/${h.id}`} className="adm-link">
                        #{h.app_no}
                      </Link>{" "}
                      <span className="adm-muted">{dateTimeJst(h.created_at)}</span>
                    </div>
                    {h.reject_reason && <div className="adm-row-note">{h.reject_reason}</div>}
                  </div>
                  <Badge b={kycAppBadge(h.status)} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card icon="🔍" tone="green" title={open ? "書類の確認と審査" : "書類"}>
        {open || !purged ? (
          <KycReview appId={a.id} canDecide={open} purged={purged} />
        ) : (
          <Empty>審査が済んだので、書類は消しました。</Empty>
        )}
        {a.status === "rejected" && !a.resubmit_allowed && (
          <div className="adm-actions" style={{ marginTop: 14 }}>
            <ActionButton
              op="kyc.resubmit"
              id={a.id}
              label="再申請を受け付ける"
              className="warn"
              title="この利用者の再申請を受け付けますか？"
              body="本人がもう一度、書類を出せるようになります。本人に通知が届きます。18歳未満で停止した利用者には使わないでください。"
              confirmLabel="受け付ける"
            />
          </div>
        )}
      </Card>
    </AdminShell>
  );
}
