/* 管理画面の外枠（左のメニュー・上の帯・中身の枠）。見本 admin.html の形のまま。
   中で requireAdminPage() を通す（ページの側でも先に通している。React の cache で問い合わせは1回だけ）。
   左のメニューの数（未処理の件数）は、確認が済んだ後に service で数える。 */
import "server-only";
import Form from "next/form";
import Link from "next/link";
import type { ReactNode } from "react";
import { navCounts, requireAdminPage } from "@/lib/admin";
import { SITE_NAME } from "@/lib/site";
import { createServiceClient } from "@/lib/supabase/service";
import { FlashProvider } from "./Flash";

export type AdminPanel =
  | "dashboard"
  | "users"
  | "items"
  | "orders"
  | "sales"
  | "kyc"
  | "reports"
  | "moderation"
  | "settings"
  | "logs"
  | "search";

type NavItem = { key: AdminPanel; href: string; icon: string; label: string; count?: number; tone?: "yellow" | "blue" | "" };

function NavLink({ item, active }: { item: NavItem; active: AdminPanel }) {
  const on = item.key === active;
  return (
    <Link href={item.href} className={`nav-item${on ? " active" : ""}`} aria-current={on ? "page" : undefined}>
      <span className="nav-icon" aria-hidden="true">
        {item.icon}
      </span>{" "}
      {item.label}
      {item.count != null && item.count > 0 && (
        <span className={`nav-badge${item.tone ? ` ${item.tone}` : ""}`} aria-label={`未処理 ${item.count}件`}>
          {item.count > 99 ? "99+" : item.count}
        </span>
      )}
    </Link>
  );
}

export default async function AdminShell({ active, title, children }: { active: AdminPanel; title: string; children: ReactNode }) {
  const me = await requireAdminPage();
  const c = await navCounts(createServiceClient());
  const pending = c.kyc + c.reports + c.held + c.roles + c.refunds + c.payouts;

  const sections: { label: string; items: NavItem[] }[] = [
    {
      label: "メイン",
      items: [
        { key: "dashboard", href: "/admin", icon: "📊", label: "ダッシュボード" },
        { key: "users", href: "/admin/users", icon: "👥", label: "ユーザー管理", count: c.roles, tone: "blue" },
        { key: "items", href: "/admin/items", icon: "📦", label: "商品管理" },
        { key: "orders", href: "/admin/orders", icon: "🛍", label: "注文管理", count: c.refunds, tone: "" },
        { key: "sales", href: "/admin/sales", icon: "💰", label: "売上・振込管理", count: c.payouts, tone: "yellow" },
      ],
    },
    {
      label: "審査・安全",
      items: [
        { key: "kyc", href: "/admin/kyc", icon: "🪪", label: "KYC審査", count: c.kyc, tone: "yellow" },
        { key: "reports", href: "/admin/reports", icon: "🚩", label: "通報対応", count: c.reports, tone: "" },
        { key: "moderation", href: "/admin/moderation", icon: "🛡", label: "モデレーション", count: c.held, tone: "" },
      ],
    },
    {
      label: "システム",
      items: [
        { key: "settings", href: "/admin/settings", icon: "⚙️", label: "サイト設定" },
        { key: "logs", href: "/admin/logs", icon: "📋", label: "アクティビティログ" },
      ],
    },
  ];

  return (
    <div className="pg-admin">
      <FlashProvider>
        <aside className="admin-sidebar">
          <div className="admin-logo">
            <div className="admin-logo-text">♡ {SITE_NAME}</div>
            <div className="admin-logo-sub">Admin Dashboard</div>
          </div>

          <nav className="adm-nav" aria-label="管理メニュー">
            {sections.map((s) => (
              <div className="nav-section" key={s.label}>
                <div className="nav-section-label">{s.label}</div>
                {s.items.map((it) => (
                  <NavLink key={it.key} item={it} active={active} />
                ))}
              </div>
            ))}
          </nav>

          <div className="admin-user">
            <div className="au-avatar" aria-hidden="true">
              {Array.from(me.nickname.trim())[0] ?? "A"}
            </div>
            <div>
              <div className="au-name">{me.nickname}</div>
              <div className="au-role">管理者</div>
            </div>
          </div>
        </aside>

        <main className="admin-main">
          <header className="topbar">
            <h1 className="topbar-title">{title}</h1>
            <div className="topbar-right">
              <div className="topbar-search">
                <Form action="/admin/search" role="search">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                  <input type="search" name="q" placeholder="ユーザー・商品・注文を検索" maxLength={50} aria-label="ユーザー・商品・注文を検索" />
                </Form>
              </div>
              <Link href="/admin" className="topbar-icon" aria-label={pending > 0 ? `未処理が ${pending}件あります（ダッシュボードへ）` : "ダッシュボードへ"}>
                🔔{pending > 0 && <div className="notif-dot" />}
              </Link>
              <Link href="/" className="topbar-icon" aria-label="サイトを開く">
                🌐
              </Link>
            </div>
          </header>

          <div className="content">
            <section className="panel show fade-in">{children}</section>
          </div>
        </main>
      </FlashProvider>
    </div>
  );
}
