/* ログイン・登録の画面の上の帯（見本 auth.html の auth-header をそのまま） */
import Link from "next/link";
import { SITE_NAME } from "@/lib/site";

export default function AuthHeader() {
  return (
    <header className="auth-header">
      <Link href="/" className="logo">
        ♡ {SITE_NAME}
      </Link>
      <div className="header-help">
        困ったことがあれば <Link href="/help">ヘルプ</Link>
      </div>
    </header>
  );
}
