/* 設定（見本 mypage.html の panel-settings）。アカウント・お届け先・通知・ブロック・役割の変更・退会。
   読み込みはすべて利用者の権限（RLS）で行う。 */
import type { Metadata } from "next";
import Link from "next/link";
import { requireViewer, type KycStatus } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { avatarImage } from "@/lib/storage";
import { dateJst, displayName } from "@/lib/format";
import { KYC_STATUS } from "@/lib/labels";
import MypageShell from "@/components/mypage/MypageShell";
import { getMyProfile } from "@/components/mypage/data";
import { BlockButton } from "@/components/ToggleButtons";
import EmailForm from "@/components/account/EmailForm";
import PasswordForm from "@/components/account/PasswordForm";
import AddressForm from "@/components/account/AddressForm";
import NotifyToggles from "@/components/account/NotifyToggles";
import RoleChangeForm from "@/components/account/RoleChangeForm";
import WithdrawForm from "@/components/account/WithdrawForm";
import { NOTIFY_ITEMS, usesPassword, type NotifyKey } from "@/components/account/options";
import "@/components/account/account.css";

export const metadata: Metadata = { title: "設定", robots: { index: false, follow: false } };

const ROLE_NAME = { seller: "出品者", buyer: "購入者" } as const;

const KYC_PILL: Record<KycStatus, { icon: string; cls: string }> = {
  approved: { icon: "✅", cls: "" },
  pending: { icon: "⏳", cls: " is-pending" },
  rejected: { icon: "⚠️", cls: " is-rejected" },
  unsubmitted: { icon: "📄", cls: " is-unsubmitted" },
};

/** 画面に出すメールアドレスは伏せる（例: me***@gmail.com） */
function maskEmail(email: string | null | undefined): string {
  if (!email) return "";
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}

export default async function SettingsPage() {
  const viewer = await requireViewer("/settings");
  const supabase = await createClient();

  const [userRes, me, addressRes, blocksRes, roleRes] = await Promise.all([
    supabase.auth.getUser(),
    getMyProfile(),
    supabase
      .from("saved_addresses")
      .select("name, postal, prefecture, address1, address2, phone")
      .eq("user_id", viewer.id)
      .maybeSingle(),
    supabase
      .from("blocks")
      .select("blocked_id, created_at, profiles!blocks_blocked_id_fkey(public_name, avatar_path)")
      .eq("blocker_id", viewer.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("role_change_requests")
      .select("id, status, to_role, reject_reason, created_at, decided_at")
      .eq("user_id", viewer.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (addressRes.error) console.error("[settings] saved_addresses", addressRes.error.message);
  if (blocksRes.error) console.error("[settings] blocks", blocksRes.error.message);
  if (roleRes.error) console.error("[settings] role_change_requests", roleRes.error.message);

  const user = userRes.data.user;
  const hasPassword = user ? usesPassword(user) : false;
  const email = maskEmail(user?.email ?? viewer.email);

  const items = NOTIFY_ITEMS[viewer.role];
  const notify: Partial<Record<NotifyKey, boolean>> = {};
  for (const it of items) notify[it.key] = me ? Boolean(me[it.key]) : false;

  const blocks = blocksRes.data ?? [];
  const role = roleRes.data;
  const kyc = KYC_PILL[viewer.kycStatus] ?? KYC_PILL.unsubmitted;
  const toRole = viewer.role === "seller" ? "buyer" : "seller";

  return (
    <MypageShell active="settings">
      <div className="acc-head">
        <div>
          <h1 className="acc-title">設定</h1>
          <p className="acc-lead">アカウント・お届け先・通知などを変えられます。</p>
        </div>
      </div>

      {/* アカウント */}
      <section className="settings-section">
        <h2 className="settings-title">
          <span className="icon-pill">👤</span> アカウント情報
        </h2>
        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-name">ニックネーム</div>
            <div className="setting-desc">ほかの人には伏せて表示されます。</div>
          </div>
          <div className="setting-val">{me?.nickname ?? viewer.nickname ?? "未設定"}</div>
          <Link className="setting-btn" href="/mypage/profile">
            変更
          </Link>
        </div>
        <EmailForm current={email} />
        <PasswordForm hasPassword={hasPassword} />
        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-name">本人確認</div>
            <div className="setting-desc">18歳以上であることを、身分証で確かめます。</div>
          </div>
          <div className={`kyc-status${kyc.cls}`}>
            {kyc.icon} {KYC_STATUS[viewer.kycStatus] ?? "未提出"}
          </div>
          {viewer.kycStatus !== "approved" && (
            <Link className="setting-btn" href="/kyc">
              {viewer.kycStatus === "pending" ? "状況を見る" : "手続きへ"}
            </Link>
          )}
        </div>
      </section>

      {/* お届け先 */}
      <section className="settings-section">
        <h2 className="settings-title">
          <span className="icon-pill">📮</span> お届け先
        </h2>
        <AddressForm initial={addressRes.data ?? null} />
      </section>

      {/* 通知 */}
      <section className="settings-section">
        <h2 className="settings-title">
          <span className="icon-pill">🔔</span> 通知設定
        </h2>
        {me ? (
          <NotifyToggles items={items} initial={notify} />
        ) : (
          <p className="acc-note">通知の設定を読み込めませんでした。時間をおいて開き直してください。</p>
        )}
      </section>

      {/* ブロック */}
      <section className="settings-section">
        <h2 className="settings-title">
          <span className="icon-pill">🚫</span> ブロックした人
        </h2>
        {blocks.length === 0 ? (
          <p className="acc-note">ブロックしている人はいません。</p>
        ) : (
          blocks.map((b) => {
            const p = b.profiles;
            const avatar = avatarImage(p?.avatar_path ?? null);
            const name = displayName(p?.public_name ?? null);
            return (
              <div className="setting-row" key={b.blocked_id}>
                <div className="acc-person">
                  {avatar ? <img src={avatar} alt="" loading="lazy" /> : <span className="icon-pill">👤</span>}
                  <div className="setting-info">
                    <div className="setting-name">{name}</div>
                    <div className="setting-desc">{dateJst(b.created_at)} にブロック</div>
                  </div>
                </div>
                <BlockButton
                  id={b.blocked_id}
                  initial
                  loggedIn
                  labels={["ブロックする", "ブロック解除"]}
                  className="setting-btn"
                  activeClassName="is-blocked"
                />
              </div>
            );
          })
        )}
      </section>

      {/* 役割の変更 */}
      <section className="settings-section">
        <h2 className="settings-title">
          <span className="icon-pill">🔁</span> 出品者・購入者の切り替え
        </h2>
        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-name">今の役割</div>
          </div>
          <div className="setting-val">{ROLE_NAME[viewer.role]}</div>
        </div>
        {role?.status === "pending" ? (
          <div className="acc-box">
            {dateJst(role.created_at)} に「{ROLE_NAME[role.to_role as keyof typeof ROLE_NAME] ?? "別の役割"}」への切り替えを申請しました。運営が確かめています。
          </div>
        ) : (
          <>
            {role?.status === "rejected" && (
              <div className="acc-box warn">
                {dateJst(role.decided_at ?? role.created_at)} の申請は見送りになりました。
                {role.reject_reason ? `理由: ${role.reject_reason}` : ""}
              </div>
            )}
            <RoleChangeForm toLabel={ROLE_NAME[toRole]} />
          </>
        )}
      </section>

      {/* 退会 */}
      <section className="settings-section acc-danger-zone">
        <h2 className="settings-title acc-danger-text">⚠️ 退会</h2>
        {viewer.isAdmin ? (
          <p className="acc-note">運営者のアカウントは、ここでは退会できません。</p>
        ) : (
          <WithdrawForm hasPassword={hasPassword} />
        )}
      </section>
    </MypageShell>
  );
}
