/* サイト設定（見本の panel-settings）。DB の site_settings（admin_update_settings が受け付ける項目）を変える。
   環境変数で決まる物は見るだけ。鍵は値を出さず「設定あり／なし」だけ。 */
import type { Metadata } from "next";
import AdminShell from "@/components/admin/AdminShell";
import { Card, Empty } from "@/components/admin/parts";
import SettingsForm, { type SettingsValues } from "@/components/admin/SettingsForm";
import { envRows, nicknamesOf, requireAdminPage } from "@/lib/admin";
import { dateTimeJst } from "@/lib/format";
import { SITE_NAME } from "@/lib/site";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "サイト設定" };

export default async function AdminSettingsPage() {
  await requireAdminPage();
  const service = createServiceClient();
  const { data: st, error } = await service
    .from("site_settings")
    .select(
      "fee_rate, anonymous_fee, video_fee, extend_fee_per_day, min_payout, payout_fee, auto_complete_days, registration_open, maintenance, notice, mail_order, mail_kyc, mail_payout, mod_spam_filter, forwarding_address, updated_at, updated_by",
    )
    .limit(1)
    .maybeSingle();
  if (error) console.error("[admin] site_settings", error.message);
  const names = await nicknamesOf(service, [st?.updated_by]);
  const env = envRows();
  const envValue = (label: string) => env.find((r) => r.label === label)?.value ?? "未設定";

  const initial: SettingsValues | null = st
    ? {
        feePercent: Math.round(st.fee_rate * 1000) / 10,
        anonymousFee: st.anonymous_fee,
        videoFee: st.video_fee,
        extendFeePerDay: st.extend_fee_per_day,
        minPayout: st.min_payout,
        payoutFee: st.payout_fee,
        autoCompleteDays: st.auto_complete_days,
        registrationOpen: st.registration_open,
        maintenance: st.maintenance,
        mailOrder: st.mail_order,
        mailKyc: st.mail_kyc,
        mailPayout: st.mail_payout,
        modSpamFilter: st.mod_spam_filter,
        notice: st.notice,
        forwardingAddress: st.forwarding_address,
      }
    : null;

  return (
    <AdminShell active="settings" title="サイト設定">
      {st?.maintenance && <div className="alert-banner danger">🛠 いまメンテナンスモードです。管理者以外はサイトを使えません。</div>}
      {initial ? (
        <SettingsForm initial={initial} env={{ siteName: SITE_NAME, mailFrom: envValue("送信元メールアドレス"), mailMode: envValue("メールの仕組み") }} />
      ) : (
        <Card icon="⚙️" title="基本設定">
          <Empty>設定を読めませんでした。時間をおいて読み込み直してください。</Empty>
        </Card>
      )}
      {st && (
        <p className="adm-hint" style={{ margin: "4px 0 16px" }}>
          最後に変えた日時: {dateTimeJst(st.updated_at)}
          {st.updated_by ? `（${names.get(st.updated_by) ?? "管理者"}）` : ""}
        </p>
      )}

      <Card icon="🔑" tone="blue" title="環境変数で決まる設定（見るだけ）">
        <p className="adm-hint" style={{ marginBottom: 10 }}>
          ここは画面からは変えられません。変えるときは、ホスティング（Vercel など）の環境変数を直してから、もう一度デプロイしてください。鍵の値は表示しません。
        </p>
        <div>
          {env.map((r) => (
            <div className="adm-row" key={r.label}>
              <div className="adm-row-title">{r.label}</div>
              <div className={r.ok ? undefined : "adm-danger-text"}>{r.value}</div>
            </div>
          ))}
        </div>
      </Card>
    </AdminShell>
  );
}
