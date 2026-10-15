/* 新しいパスワードを決める画面。ログインしていないと使えない（再設定のメールのリンクで一時的にログインした状態で来る）。
   ログインしていても、メールのリンクを通った札（lib/recovery-grant.ts）が無ければ、フォームは出さずに案内だけ */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import SiteFooter from "@/components/SiteFooter";
import AuthHeader from "@/components/auth/AuthHeader";
import { PASSWORD_HINT } from "@/components/auth/rules";
import UpdatePasswordForm from "@/components/auth/UpdatePasswordForm";
import { getViewer } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { RECOVERY_COOKIE, hasRecoveryGrant } from "@/lib/recovery-grant";
import "@/styles/auth.css";
import "@/components/auth/auth-extra.css";

export const metadata: Metadata = {
  title: "新しいパスワード",
  robots: { index: false, follow: false },
};

export default async function UpdatePasswordPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth/reset");
  if (viewer.status !== "active") redirect("/auth/suspended");
  const grant = (await cookies()).get(RECOVERY_COOKIE)?.value;
  const granted = hasRecoveryGrant(grant, viewer.id, serverEnv.supabaseServiceRoleKey);

  return (
    <div className="pg-auth">
      <AuthHeader />
      <main className="page">
        <div className="card">
          <div className="pt-auth-head">
            <h1 className="pt-auth-title">新しいパスワード 🔒</h1>
            <div className="pt-auth-sub">{PASSWORD_HINT}</div>
          </div>
          <UpdatePasswordForm expired={!granted} />
        </div>
      </main>
      <SiteFooter variant="auth" />
    </div>
  );
}
