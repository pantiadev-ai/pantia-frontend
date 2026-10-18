/* 画面の下の帯。見本ごとに囲いのクラス（list-footer…）が違うので variant で切り替える */
import Link from "next/link";
import { SITE_NAME } from "@/lib/site";

export type FooterVariant = "index" | "auth" | "list" | "detail" | "form" | "mypage" | "timeline" | "tweets" | "seller" | "terms" | "app";

export default function SiteFooter({ variant }: { variant: FooterVariant }) {
  return (
    <footer className={variant === "index" ? "footer" : `${variant}-footer`}>
      <div className="footer-inner">
        <div className="footer-logo">♡ {SITE_NAME}</div>
        <div className="footer-links">
          <Link className="footer-link" href="/terms">利用規約</Link>
          <Link className="footer-link" href="/privacy">プライバシーポリシー</Link>
          <Link className="footer-link" href="/legal">特定商取引法</Link>
          <Link className="footer-link" href="/help">ヘルプ</Link>
          <Link className="footer-link" href="/contact">お問い合わせ</Link>
        </div>
        <div className="footer-copy">© 2026 {SITE_NAME}.</div>
      </div>
    </footer>
  );
}
