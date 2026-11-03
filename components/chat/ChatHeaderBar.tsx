/* チャットの頭（見本の chat-header-bar）。メッセージの画面は SiteHeader を使わず、ここで書く。
   1024px 以下（スマホと iPad）では名前を隠し、ほかの画面と同じ「☰ メニュー」を出す（ログアウトもそこから） */
import Link from "next/link";
import Heartbeat from "@/components/Heartbeat";
import MobileMenu from "@/components/MobileMenu";
import { mobileMenuLinks } from "@/components/SiteHeader";
import type { Viewer } from "@/lib/auth";
import { SITE_NAME } from "@/lib/site";
import { getUnread } from "@/lib/unread";
import { san } from "@/lib/format";

export default async function ChatHeaderBar({ viewer }: { viewer: Viewer }) {
  const unread = await getUnread();
  return (
    <header className="chat-header-bar">
      <Link href="/" className="logo">
        ♡ {SITE_NAME}
      </Link>
      <div className="header-right">
        <Link href="/items" className="hbtn chat-hide-sm">
          商品一覧
        </Link>
        <Link href="/timeline" className="hbtn chat-hide-sm">
          タイムライン
        </Link>
        <Link
          href="/notifications"
          className="hbtn pt-bell"
          aria-label={`お知らせ${unread.notifications ? `（未読 ${unread.notifications}件）` : ""}`}
        >
          🔔{unread.notifications ? <span className="pt-dot" /> : null}
        </Link>
        <Link href="/mypage" className="hbtn nav-login chat-hide-sm pt-name" title={san(viewer.nickname)}>
          {san(viewer.nickname)}
        </Link>
        <MobileMenu links={mobileMenuLinks(viewer)} signedInAs={san(viewer.nickname)} />
      </div>
      <Heartbeat />
    </header>
  );
}
