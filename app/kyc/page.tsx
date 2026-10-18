/* 本人確認（KYC）。今の状態と、出せるときだけ提出のフォームを出す。
   書類の画像は本人の画面にも出さない（署名付き URL を作らない）。 */
import type { Metadata } from "next";
import Link from "next/link";
import { requireViewer, type KycStatus } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateJst, dateTimeJst } from "@/lib/format";
import { KYC_DOC_TYPES, KYC_STATUS } from "@/lib/labels";
import { assertKycReady, KycNotReadyError, type KycProvider } from "@/lib/adapters/kyc";
import MypageShell from "@/components/mypage/MypageShell";
import KycForm from "@/components/account/KycForm";
import "@/components/account/account.css";

export const metadata: Metadata = { title: "本人確認", robots: { index: false, follow: false } };

const PILL: Record<KycStatus, { icon: string; cls: string }> = {
  approved: { icon: "✅", cls: "" },
  pending: { icon: "⏳", cls: " is-pending" },
  rejected: { icon: "⚠️", cls: " is-rejected" },
  unsubmitted: { icon: "📄", cls: " is-unsubmitted" },
};

/** 受付の状態。設定がおかしいときは受け付けない側に倒す */
function intake(): { mode: KycProvider; open: boolean } {
  try {
    return { mode: assertKycReady(), open: true };
  } catch (e) {
    if (!(e instanceof KycNotReadyError)) console.error("[kyc] 受け方の設定を読めませんでした");
    return { mode: "manual", open: false };
  }
}

/** 今日の日付（日本時間、YYYY-MM-DD） */
function todayJst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
}

function docLabel(v: string): string {
  return KYC_DOC_TYPES.find((d) => d.value === v)?.label ?? "身分証";
}

export default async function KycPage() {
  const viewer = await requireViewer("/kyc");
  const supabase = await createClient();
  const { data: app, error } = await supabase
    .from("kyc_applications")
    .select("id, app_no, doc_type, status, reject_reason, resubmit_allowed, created_at, decided_at")
    .eq("user_id", viewer.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) console.error("[kyc] kyc_applications", error.message);

  const status = viewer.kycStatus;
  const open = app?.status === "pending" || app?.status === "reviewing";
  const canSubmit =
    !error && !open && (status === "unsubmitted" || (status === "rejected" && (app ? app.resubmit_allowed : true)));
  const pill = PILL[status] ?? PILL.unsubmitted;
  const { mode, open: accepting } = intake();

  return (
    <MypageShell active="kyc">
      <div className="acc-head">
        <div>
          <h1 className="acc-title">本人確認</h1>
          <p className="acc-lead">
            パンティアは18歳以上の方だけが使えます。出品・購入・メッセージの前に、身分証で年齢を確かめます。
          </p>
        </div>
      </div>

      <section className="settings-section">
        <h2 className="settings-title">
          <span className="icon-pill">🪪</span> いまの状態
        </h2>
        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-name">本人確認</div>
            {app && (
              <div className="setting-desc">
                受付番号 {app.app_no}・{docLabel(app.doc_type)}・{dateTimeJst(app.created_at)} に提出
              </div>
            )}
          </div>
          <div className={`kyc-status${pill.cls}`}>
            {pill.icon} {KYC_STATUS[status] ?? "未提出"}
          </div>
        </div>

        {status === "approved" && (
          <div className="acc-box">
            {app?.decided_at ? `${dateJst(app.decided_at)} に確認が済みました。` : "確認が済んでいます。"}
            すべての機能を使えます。提出した書類の画像は、確認が済んでから7日後に消しています。
          </div>
        )}
        {status === "pending" && (
          <div className="acc-box">
            運営が確かめています。結果はお知らせでお伝えします。審査中は、提出し直すことはできません。
          </div>
        )}
        {status === "rejected" && (
          <div className="acc-box warn">
            {app?.reject_reason ? `確認できませんでした。理由: ${app.reject_reason}` : "確認できませんでした。"}
            {canSubmit ? (
              <>
                <br />
                下のフォームから、もう一度提出してください。
              </>
            ) : (
              <>
                <br />
                この申請は再提出を受け付けていません。わからないことは
                <Link href="/contact">お問い合わせ</Link>
                からご連絡ください。
              </>
            )}
          </div>
        )}
        {error && (
          <p className="pt-msg error" role="alert">
            申請の状況を読み込めませんでした。時間をおいて開き直してください。
          </p>
        )}
      </section>

      {canSubmit && (
        <section className="settings-section">
          <h2 className="settings-title">
            <span className="icon-pill">📤</span> 書類を提出する
          </h2>
          <div className="acc-box">
            使える書類（どれか1つ）
            <ul>
              <li>運転免許証</li>
              <li>マイナンバーカード（顔写真のある表面だけ）</li>
              <li>パスポート</li>
            </ul>
            有効期限内で、氏名・生年月日・顔写真がはっきり写っているものを使ってください。
          </div>
          {accepting ? (
            <KycForm mode={mode} today={todayJst()} />
          ) : (
            <p className="pt-msg error" role="alert">
              ただいま本人確認の受付を止めています。時間をおいて、もう一度お試しください。
            </p>
          )}
        </section>
      )}

      <section className="settings-section">
        <h2 className="settings-title">
          <span className="icon-pill">🔒</span> 書類の扱い
        </h2>
        <div className="acc-box">
          <ul>
            <li>書類の画像は、本人確認のためだけに使います。ほかの利用者には見えません。</li>
            <li>画像は鍵のかかった場所に置き、確認が済んでから7日後に消します。</li>
            <li>マイナンバー（12桁の個人番号）は受け取りません。カードの裏面は撮らないでください。</li>
          </ul>
        </div>
      </section>
    </MypageShell>
  );
}
