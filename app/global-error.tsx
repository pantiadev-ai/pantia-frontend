"use client";
/* 一番外側（app/layout.tsx）で問題が起きた時の画面。レイアウトの代わりに html と body を自分で出す。
   エラーの中身は画面に出さない。部品（ヘッダーなど）にも頼らず、素の a でトップへ戻す */
import "@/app/globals.css";
import "@/styles/app.css";
import { SITE_NAME } from "@/lib/site";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const code = typeof error.digest === "string" && /^[A-Za-z0-9-]{1,40}$/.test(error.digest) ? error.digest : null;

  return (
    <html lang="ja">
      <body>
        <title>{`問題が起きました - ${SITE_NAME}`}</title>
        <div className="pg-app">
          <main className="app-main narrow">
            <div className="card empty" role="alert">
              <div className="icon" aria-hidden="true">
                ⚠️
              </div>
              <h1 className="title">問題が起きました</h1>
              <p>少し時間をおいて、もう一度お試しください。</p>
              {code ? <p style={{ fontSize: 12, marginTop: 8 }}>番号：{code}</p> : null}
              <p style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                <button className="btn primary" type="button" onClick={() => retry()}>
                  もう一度読み込む
                </button>
                {/* レイアウトごと作り直したいので、Link ではなく普通の移動にする */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- 壊れたレイアウトを捨てて読み込み直すため */}
                <a className="btn" href="/">
                  トップページへ
                </a>
              </p>
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
