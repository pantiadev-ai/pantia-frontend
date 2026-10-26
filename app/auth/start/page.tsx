/* 運営が代理登録した人に送る「パスワードを決めるリンク」の入口（lib/actions/proxy.ts の proxyIssueLink が作る）。
   開いただけではリンクを使わない。LINE などはリンクのプレビューのために中身を先に読みに行くので、
   /auth/callback（開くとその場でトークンを使う）に直接つなぐと、本人が押す前にリンクが使えなくなる。
   ボタンを押したときだけ /auth/callback へ送る（読みに来るだけの機械はフォームを送らない）。 */
import type { Metadata } from "next";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import AuthHeader from "@/components/auth/AuthHeader";
import "@/styles/auth.css";
import "@/components/auth/auth-extra.css";

export const metadata: Metadata = {
  title: "パスワードを決める",
  robots: { index: false, follow: false },
  // URL にトークンが入っているので、次のページにも Referer で渡さない
  referrer: "no-referrer",
};

/** generateLink の hashed_token の形（英数字。長さは /auth/callback と同じ上限） */
const TOKEN = /^[A-Za-z0-9_-]{16,512}$/;

export default async function StartPage({ searchParams }: PageProps<"/auth/start">) {
  const sp = await searchParams;
  const raw = sp.token_hash;
  const token = typeof raw === "string" && TOKEN.test(raw) ? raw : null;

  return (
    <div className="pg-auth">
      <AuthHeader />
      <main className="page">
        <div className="card">
          <div className="success-screen show">
            <div className="success-icon" aria-hidden="true">
              {token ? "🔑" : "⚠️"}
            </div>
            <h1 className="success-title">{token ? "パスワードを決めましょう" : "このリンクは使えません"}</h1>
          </div>
          {token ? (
            <>
              <div className="pt-auth-text">
                <p>運営がお手伝いして作ったアカウントです。下のボタンを押して、ログインに使うパスワードを決めてください。</p>
                <p>このリンクは1回だけ使えます。期限が切れていたら、運営にもう一度リンクを頼んでください。</p>
              </div>
              <form action="/auth/callback" method="get" className="pt-auth-actions">
                <input type="hidden" name="token_hash" value={token} />
                <input type="hidden" name="type" value="recovery" />
                <input type="hidden" name="next" value="/auth/update-password" />
                <button type="submit" className="btn-go seller">
                  パスワードを決める →
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="pt-auth-text">
                <p>リンクの形が正しくありません。届いたリンクを、最後まで欠けずに開いてください。</p>
              </div>
              <div className="pt-auth-actions">
                <Link href="/auth" className="btn-go buyer">
                  ログイン画面へ
                </Link>
              </div>
            </>
          )}
        </div>
      </main>
      <SiteFooter variant="auth" />
    </div>
  );
}
