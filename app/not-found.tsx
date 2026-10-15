/* ページが見つからない時の画面（存在しない URL・消えた商品など）。理由の詳しいことは出さない */
import type { Metadata } from "next";
import Link from "next/link";
import "@/styles/app.css";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "ページが見つかりません",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="pg-app">
      <SiteHeader variant="app" />
      <main className="app-main narrow">
        <div className="card empty">
          <div className="icon" aria-hidden="true">
            🔍
          </div>
          <h1 className="title">ページが見つかりません</h1>
          <p>URL が間違っているか、ページが消された・非公開になった可能性があります。</p>
          <p style={{ marginTop: 16 }}>
            <Link className="btn primary" href="/">
              トップページへ
            </Link>
          </p>
        </div>
      </main>
      <SiteFooter variant="app" />
    </div>
  );
}
