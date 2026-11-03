/* 画面の上の帯。見本ごとに囲いのクラス（list-header・detail-header…）が違うので variant で切り替える。
   中身（ロゴ・検索・メニュー）は同じ形。ログインの有無でメニューを替える。
   1024px 以下（スマホと iPad）では pt-desk の項目を隠し、右上の「☰ メニュー」（MobileMenu）にまとめる。
   頭に残すのは、ログイン中は 💬 🔔、ログインしていないときは「ログイン」だけ（2026-11-03 に運営から指摘） */
import Link from "next/link";
import Heartbeat from "@/components/Heartbeat";
import MobileMenu, { type MenuLink } from "@/components/MobileMenu";
import { getViewer, type Viewer } from "@/lib/auth";
import { san } from "@/lib/format";
import { getUnread } from "@/lib/unread";
import { SITE_NAME } from "@/lib/site";

export type HeaderVariant = "index" | "list" | "detail" | "form" | "mypage" | "timeline" | "tweets" | "seller" | "terms" | "app";

export type NavKey = "sellers" | "items" | "tweets" | "ranking" | "timeline" | "mypage" | "messages" | "notifications";

type Props = {
  variant: HeaderVariant;
  active?: NavKey;
  /** 検索欄を出すとき。送り先（/items か /tweets）と、入っている文字 */
  search?: { action: "/items" | "/tweets" | "/sellers"; placeholder: string; defaultValue?: string };
};

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
);

/** スマホの「☰ メニュー」の行き先。チャットの頭（ChatHeaderBar）も同じ物を使う */
export function mobileMenuLinks(viewer: Viewer | null): MenuLink[] {
  if (!viewer) {
    return [
      { href: "/sellers", label: "女の子" },
      { href: "/items", label: "商品" },
      { href: "/tweets", label: "つぶやき" },
      { href: "/ranking", label: "ランキング" },
      { href: "/auth", label: "ログイン" },
    ];
  }
  return [
    { href: "/mypage", label: "マイページ" },
    { href: "/items", label: "商品一覧" },
    { href: "/tweets", label: "つぶやき" },
    { href: "/timeline", label: "タイムライン" },
    { href: "/ranking", label: "ランキング" },
    ...(viewer.isAdmin ? [{ href: "/admin", label: "管理" }] : []),
  ];
}

export default async function SiteHeader({ variant, active, search }: Props) {
  const viewer = await getViewer();
  const unread = viewer ? await getUnread() : { notifications: 0, messages: 0 };
  const cls = (key: NavKey, extra = "") => [active === key ? "nav-active" : "", extra].filter(Boolean).join(" ") || undefined;
  // 見本の timeline だけ通知の囲いが notif-wrap、mypage は notif-btn
  const bellClass = variant === "timeline" ? "notif-wrap" : variant === "mypage" ? "notif-btn" : "";

  return (
    <header className={variant === "index" ? "header" : `${variant}-header`}>
      <Link href="/" className="logo">
        ♡ {SITE_NAME}
      </Link>
      {search ? (
        <form className="header-search pt-hide-sm" action={search.action} method="get" role="search">
          <SearchIcon />
          <input type="search" name="q" placeholder={search.placeholder} defaultValue={search.defaultValue} maxLength={50} aria-label={search.placeholder} />
        </form>
      ) : null}
      <nav className="pt-nav" aria-label="メインメニュー">
        {viewer ? (
          <>
            <Link href="/items" className={cls("items", "pt-desk")}>
              商品一覧
            </Link>
            <Link href="/tweets" className={cls("tweets", "pt-desk")}>
              つぶやき
            </Link>
            <Link href="/timeline" className={cls("timeline", "pt-desk")}>
              タイムライン
            </Link>
            <Link href="/ranking" className={cls("ranking", "pt-desk")}>
              ランキング
            </Link>
            <Link href="/messages" className={cls("messages", `pt-bell ${bellClass}`)} aria-label={`メッセージ${unread.messages ? `（未読 ${unread.messages}件）` : ""}`}>
              💬{unread.messages ? <span className="pt-dot notif-dot" /> : null}
            </Link>
            <Link href="/notifications" className={cls("notifications", `pt-bell ${bellClass}`)} aria-label={`お知らせ${unread.notifications ? `（未読 ${unread.notifications}件）` : ""}`}>
              🔔{unread.notifications ? <span className="pt-dot notif-dot" /> : null}
            </Link>
            <div className="nav-divider pt-desk" />
            <Link href="/mypage" className={`${active === "mypage" ? "nav-active" : "nav-login"} pt-desk pt-name`} title={san(viewer.nickname)}>
              {san(viewer.nickname)}
            </Link>
            {viewer.isAdmin ? (
              <Link href="/admin" className="pt-desk">
                管理
              </Link>
            ) : null}
            {/* ログアウトは POST だけ（app/auth/signout。GET のリンクだと、外のページの画像1枚でログアウトさせられる） */}
            <form action="/auth/signout" method="post" className="pt-signout pt-desk">
              <button type="submit">ログアウト</button>
            </form>
            <MobileMenu links={mobileMenuLinks(viewer)} signedInAs={san(viewer.nickname)} />
            <Heartbeat />
          </>
        ) : (
          <>
            <Link href="/sellers" className={cls("sellers", "pt-desk")}>
              女の子
            </Link>
            <Link href="/items" className={cls("items", "pt-desk")}>
              商品
            </Link>
            <Link href="/tweets" className={cls("tweets", "pt-desk")}>
              つぶやき
            </Link>
            <Link href="/ranking" className={cls("ranking", "pt-desk")}>
              ランキング
            </Link>
            <div className="nav-divider pt-desk" />
            <Link href="/auth" className="nav-login">
              ログイン
            </Link>
            <MobileMenu links={mobileMenuLinks(null)} />
          </>
        )}
      </nav>
    </header>
  );
}
