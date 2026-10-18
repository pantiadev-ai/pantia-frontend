/* 利用停止・退会済みの人の案内。ログインしていない人が開いても、ふつうの説明を出す */
import type { Metadata } from "next";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import AuthHeader from "@/components/auth/AuthHeader";
import { getViewer } from "@/lib/auth";
import "@/styles/auth.css";
import "@/components/auth/auth-extra.css";

export const metadata: Metadata = {
  title: "ご利用について",
  robots: { index: false, follow: false },
};

export default async function SuspendedPage() {
  const viewer = await getViewer();
  const status = viewer?.status ?? null;

  let icon = "🔒";
  let title = "このアカウントは使えません";
  let body: string[] = [
    "このアカウントは、利用の停止か退会の手続きが済んでいるため、ログインできません。",
    "心当たりがないときは、お問い合わせからご連絡ください。",
  ];
  if (status === "withdrawn") {
    icon = "🌙";
    title = "退会の手続きが済んでいます";
    body = [
      "このアカウントは退会済みです。これまでのご利用、ありがとうございました。",
      "取引の記録など、法律で残す決まりのある情報は、決められた期間だけ保管したあとに消します。",
    ];
  } else if (status === "suspended") {
    title = "利用を停止しています";
    body = [
      "利用規約に反する疑いがあるため、このアカウントの利用を止めています。停止中は出品・購入・メッセージなどが使えません。",
      "理由のご説明や、停止の見直しのご相談は、お問い合わせの「利用停止について」からご連絡ください。",
    ];
  } else if (status === "active") {
    icon = "🌸";
    title = "このアカウントはご利用いただけます";
    body = ["いまは利用の停止はかかっていません。"];
  }

  return (
    <div className="pg-auth">
      <AuthHeader />
      <main className="page">
        <div className="card">
          <div className="success-screen show">
            <div className="success-icon" aria-hidden="true">
              {icon}
            </div>
            <h1 className="success-title">{title}</h1>
          </div>
          <div className="pt-auth-text">
            {body.map((t) => (
              <p key={t}>{t}</p>
            ))}
          </div>
          <div className="pt-auth-actions">
            {status === "active" ? (
              <Link href="/" className="btn-go seller">
                トップページへ →
              </Link>
            ) : (
              <Link href="/contact" className="btn-go seller">
                お問い合わせ →
              </Link>
            )}
            {viewer ? (
              <form action="/auth/signout" method="post">
                <button type="submit" className="btn-submit buyer-mode" style={{ marginTop: 0 }}>
                  ログアウト
                </button>
              </form>
            ) : (
              <Link href="/auth" className="btn-go buyer">
                ログイン画面へ
              </Link>
            )}
          </div>
        </div>
      </main>
      <SiteFooter variant="auth" />
    </div>
  );
}
