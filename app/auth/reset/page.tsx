/* パスワードの再設定を頼む画面 */
import type { Metadata } from "next";
import SiteFooter from "@/components/SiteFooter";
import AuthHeader from "@/components/auth/AuthHeader";
import ResetForm from "@/components/auth/ResetForm";
import "@/styles/auth.css";
import "@/components/auth/auth-extra.css";

export const metadata: Metadata = {
  title: "パスワードの再設定",
  robots: { index: false, follow: false },
};

export default function ResetPage() {
  return (
    <div className="pg-auth">
      <AuthHeader />
      <main className="page">
        <div className="card">
          <div className="pt-auth-head">
            <h1 className="pt-auth-title">パスワードの再設定 🔑</h1>
            <div className="pt-auth-sub">登録したメールアドレスに、再設定のリンクを送ります</div>
          </div>
          <div className="pt-auth-text">
            <p>メールのリンクは、届いてから1時間ほどで使えなくなります。同じ端末・同じブラウザで開いてください。</p>
          </div>
          <ResetForm />
        </div>
      </main>
      <SiteFooter variant="auth" />
    </div>
  );
}
