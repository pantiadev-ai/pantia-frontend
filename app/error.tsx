"use client";
/* 画面の表示中に問題が起きた時の画面。エラーの中身（文言・スタック）は画面に出さない。
   ヘッダーはサーバーで読む部品なのでここでは使わず、トップへの道だけ出す */
import Link from "next/link";
import "@/styles/app.css";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  // 運営がサーバーのログと照らし合わせるための番号（中身は分からない文字列）
  const code = typeof error.digest === "string" && /^[A-Za-z0-9-]{1,40}$/.test(error.digest) ? error.digest : null;

  return (
    <div className="pg-app">
      <main className="app-main narrow">
        <div className="card empty" role="alert">
          <div className="icon" aria-hidden="true">
            ⚠️
          </div>
          <h1 className="title">問題が起きました</h1>
          <p>少し時間をおいて、もう一度お試しください。続くときはお問い合わせからご連絡ください。</p>
          {code ? <p style={{ fontSize: 12, marginTop: 8 }}>番号：{code}</p> : null}
          <p style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn primary" type="button" onClick={() => retry()}>
              もう一度読み込む
            </button>
            <Link className="btn" href="/">
              トップページへ
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
