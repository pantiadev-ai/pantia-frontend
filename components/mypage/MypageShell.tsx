/* マイページの枠（見本 mypage.html の上の帯＋左のメニュー＋中身＋下の帯）。役割（出品者・購入者）でメニューを替える。
   /mypage/*・/settings・/kyc・/notifications・/payout・/orders で共通に使う。
   本人確認が済んでいなければ、上に /kyc への帯を出す。
   中身（children）はここで見本の <div className="panel show"> に入れる（縦に並べて間を空ける）。 */
import type { ReactNode } from "react";
import Link from "next/link";
import "@/styles/mypage.css";
import "./mypage-extra.css";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { getViewer, type Viewer } from "@/lib/auth";
import { getUnread } from "@/lib/unread";
import { avatarImage } from "@/lib/storage";
import { num, ratingAvg } from "@/lib/format";
import { getMyProfile, getOpenOrderCount } from "./data";

export type MypageTab =
  | "dashboard"
  | "items"
  | "sales"
  | "payout"
  | "tweets"
  | "messages"
  | "orders"
  | "favorites"
  | "following"
  | "profile"
  | "settings"
  | "kyc"
  | "notifications";

export type MypageShellProps = {
  /** 左のメニューで今いる所 */
  active: MypageTab;
  children: ReactNode;
};

type NavItem = { tab: MypageTab; href: string; icon: string; label: string; badge?: number };

function navFor(v: Viewer, unread: { notifications: number; messages: number }, openOrders: number): NavItem[] {
  const messages: NavItem = { tab: "messages", href: "/messages", icon: "✉️", label: "メッセージ", badge: unread.messages };
  const tail: NavItem[] = [
    { tab: "profile", href: "/mypage/profile", icon: "🌸", label: "プロフィール" },
    { tab: "settings", href: "/settings", icon: "⚙️", label: "設定" },
    { tab: "kyc", href: "/kyc", icon: "🪪", label: "本人確認" },
    { tab: "notifications", href: "/notifications", icon: "🔔", label: "お知らせ", badge: unread.notifications },
  ];
  if (v.role === "seller") {
    return [
      { tab: "dashboard", href: "/mypage", icon: "📊", label: "ダッシュボード" },
      // つぶやく所が分からないと言われたので、2番目に置き、書く所だと分かる名前にする
      { tab: "tweets", href: "/mypage/tweets", icon: "✏️", label: "つぶやく" },
      { tab: "items", href: "/mypage/items", icon: "📦", label: "出品管理" },
      { tab: "sales", href: "/mypage/sales", icon: "💰", label: "売上" },
      { tab: "payout", href: "/payout", icon: "🏦", label: "振込" },
      messages,
      { tab: "orders", href: "/orders", icon: "🛍", label: "注文", badge: openOrders },
      ...tail,
    ];
  }
  return [
    { tab: "dashboard", href: "/mypage", icon: "🏠", label: "マイページ" },
    { tab: "orders", href: "/orders", icon: "🛍", label: "注文" },
    { tab: "favorites", href: "/mypage/favorites", icon: "♡", label: "お気に入り" },
    { tab: "following", href: "/mypage/following", icon: "👥", label: "フォロー中" },
    messages,
    ...tail,
  ];
}

/** 本人確認がまだの人への帯（役割と状態で文を替える） */
function KycBand({ v }: { v: Viewer }) {
  if (v.kycStatus === "approved") return null;
  const need =
    v.role === "seller"
      ? "出品の公開・つぶやき・メッセージ・振込申請には、本人確認（18歳以上の確認）が必要です。"
      : "購入・メッセージ・コメントには、本人確認（18歳以上の確認）が必要です。";
  const [icon, text, link] =
    v.kycStatus === "pending"
      ? ["⏳", "本人確認を確認中です。結果が出るまで、しばらくお待ちください。", "状況を見る →"]
      : v.kycStatus === "rejected"
        ? ["🪪", "本人確認の書類を出し直してください。", "再提出する →"]
        : ["🪪", need, "本人確認へ →"];
  return (
    <div className={`mp-kyc-band${v.kycStatus === "pending" ? " pending" : ""}`} role="status">
      <span aria-hidden="true">{icon}</span>
      <span className="mp-kyc-band-text">{text}</span>
      <Link href="/kyc" className="mp-kyc-band-link">
        {link}
      </Link>
    </div>
  );
}

export default async function MypageShell({ active, children }: MypageShellProps) {
  const viewer = await getViewer();
  if (!viewer) {
    // ページの側で requireViewer を通しているので、ふつうはここに来ない
    return (
      <div className="pg-mypage">
        <SiteHeader variant="mypage" active="mypage" />
        <main className="layout mp-layout-solo">
          <div className="main">
            <div className="panel show">{children}</div>
          </div>
        </main>
        <SiteFooter variant="mypage" />
      </div>
    );
  }

  const [unread, me, openOrders] = await Promise.all([
    getUnread(),
    getMyProfile(),
    viewer.role === "seller" ? getOpenOrderCount(viewer.id) : Promise.resolve(0),
  ]);
  const items = navFor(viewer, unread, openOrders);
  const name = me?.nickname || viewer.nickname;
  const avatar = avatarImage(me ? me.avatar_path : viewer.avatarPath);
  const initial = Array.from(name.trim())[0] ?? "♡";

  return (
    <div className="pg-mypage">
      <SiteHeader variant="mypage" active="mypage" />
      {active !== "kyc" && <KycBand v={viewer} />}

      <main className="layout">
        <aside className="sidebar fade-in">
          <div className="profile-mini">
            <div className="pm-avatar">
              {avatar ? <img src={avatar} alt="" className="mp-avatar-img" /> : initial}
              <div className="pm-online"></div>
            </div>
            <div className="pm-name">{name}</div>
            <div className="pm-handle">{viewer.role === "seller" ? "出品者アカウント" : "購入者アカウント"}</div>
            {me && (
              <div className="pm-stats">
                {viewer.role === "seller" ? (
                  <>
                    <div>
                      <div className="pm-stat-num">{num(me.follower_count)}</div>
                      <div className="pm-stat-label">フォロワー</div>
                    </div>
                    <div>
                      <div className="pm-stat-num">{num(me.sales_count)}</div>
                      <div className="pm-stat-label">販売数</div>
                    </div>
                    <div>
                      <div className="pm-stat-num">{ratingAvg(me.rating_sum, me.rating_count)}</div>
                      <div className="pm-stat-label">評価</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <div className="pm-stat-num">{num(me.following_count)}</div>
                      <div className="pm-stat-label">フォロー中</div>
                    </div>
                    <div>
                      <div className="pm-stat-num">{num(me.purchase_count)}</div>
                      <div className="pm-stat-label">購入数</div>
                    </div>
                  </>
                )}
              </div>
            )}
            {viewer.kycStatus === "approved" ? (
              <div className="kyc-badge">✅ 本人確認済み</div>
            ) : viewer.kycStatus === "pending" ? (
              <div className="kyc-badge mp-kyc-badge-wait">⏳ 本人確認の確認中</div>
            ) : (
              <Link href="/kyc" className="kyc-badge mp-kyc-badge-warn">
                ⚠ 本人確認がまだです
              </Link>
            )}
          </div>

          <nav className="side-nav" aria-label="マイページのメニュー">
            {items.map((it) => (
              <Link
                key={it.tab}
                href={it.href}
                className={`side-nav-item${active === it.tab ? " active" : ""}`}
                aria-current={active === it.tab ? "page" : undefined}
              >
                <span className="side-nav-icon">{it.icon}</span> {it.label}
                {it.badge ? <span className="side-nav-badge">{it.badge > 99 ? "99+" : it.badge}</span> : null}
              </Link>
            ))}
          </nav>
        </aside>

        <div className="main fade-in" style={{ transitionDelay: "0.08s" }}>
          <div className="panel show">{children}</div>
        </div>
      </main>

      <SiteFooter variant="mypage" />
    </div>
  );
}
