/* お知らせの一覧（新しい順・20件ずつ）。開いた画面の未読は既読にする。読み込みは利用者の権限（RLS）で行う。 */
import type { Metadata } from "next";
import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateTimeJst, relTime } from "@/lib/format";
import MypageShell from "@/components/mypage/MypageShell";
import { DeleteNotificationButton, MarkAllReadButton, MarkReadOnView } from "@/components/account/NotificationControls";
import "@/components/account/account.css";

export const metadata: Metadata = { title: "お知らせ", robots: { index: false, follow: false } };

const PER = 20;
const MAX_PAGE = 50;

const KIND_ICON: Record<string, string> = {
  message: "💬",
  order: "📦",
  review: "⭐",
  follow: "👤",
  like: "❤️",
  comment: "💭",
  kyc: "🪪",
  payout: "💴",
  report: "🚩",
  listing: "🛍️",
  post: "📝",
  system: "📢",
};

/** サイトの中のパス（/ で始まり // ではない）だけをリンクにする */
function innerLink(link: string | null): string | null {
  return link && /^\/(?!\/)/.test(link) ? link : null;
}

function pageOf(v: string | string[] | undefined): number {
  const n = Number.parseInt(Array.isArray(v) ? (v[0] ?? "") : (v ?? ""), 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), MAX_PAGE) : 1;
}

function now(): Date {
  return new Date();
}

export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const viewer = await requireViewer("/notifications");
  const sp = await searchParams;
  const page = pageOf(sp.page);
  const from = (page - 1) * PER;
  const supabase = await createClient();

  const [listRes, unreadRes] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, kind, title, body, link, read_at, created_at")
      .eq("user_id", viewer.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + PER),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", viewer.id)
      .is("read_at", null),
  ]);
  if (listRes.error) console.error("[notifications] list", listRes.error.message);
  if (unreadRes.error) console.error("[notifications] unread", unreadRes.error.message);

  const rows = listRes.data ?? [];
  const hasNext = rows.length > PER && page < MAX_PAGE;
  const list = rows.slice(0, PER);
  const unreadIds = list.filter((n) => !n.read_at).map((n) => n.id);
  const unread = unreadRes.count ?? 0;
  const at = now();

  return (
    <MypageShell active="notifications">
      <div className="acc-head">
        <div>
          <h1 className="acc-title">お知らせ</h1>
          <p className="acc-lead">{unread > 0 ? `未読が ${unread} 件あります。` : "未読のお知らせはありません。"}</p>
        </div>
        <div className="acc-actions">
          <MarkAllReadButton disabled={unread === 0} />
        </div>
      </div>

      {listRes.error ? (
        <p className="pt-msg error" role="alert">
          お知らせを読み込めませんでした。時間をおいて開き直してください。
        </p>
      ) : list.length === 0 ? (
        <div className="acc-empty">
          <span className="acc-empty-icon">🔔</span>
          {page > 1 ? (
            <>
              このページにはお知らせがありません。<Link href="/notifications">最初のページへ</Link>
            </>
          ) : (
            "お知らせはまだありません。"
          )}
        </div>
      ) : (
        <div className="msg-list">
          {list.map((n) => {
            const href = innerLink(n.link);
            const text = (
              <>
                <div className="msg-name">{n.title}</div>
                {n.body && <div className="msg-preview acc-noti-body">{n.body}</div>}
              </>
            );
            return (
              <div className={`msg-item acc-noti${n.read_at ? "" : " unread"}`} key={n.id}>
                <div className="msg-avatar" aria-hidden="true">
                  {KIND_ICON[n.kind] ?? "🔔"}
                </div>
                <div className="msg-info">
                  {href ? (
                    <Link className="acc-noti-link" href={href}>
                      {text}
                    </Link>
                  ) : (
                    text
                  )}
                </div>
                <div className="acc-noti-side">
                  <time className="msg-time" dateTime={n.created_at} title={dateTimeJst(n.created_at)}>
                    {relTime(n.created_at, at)}
                  </time>
                  {!n.read_at && <div className="msg-unread-dot" role="img" aria-label="未読" />}
                  <DeleteNotificationButton id={n.id} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(page > 1 || hasNext) && (
        <nav className="acc-pager" aria-label="ページ送り">
          {page > 1 && <Link href={page === 2 ? "/notifications" : `/notifications?page=${page - 1}`}>← 新しいお知らせ</Link>}
          <span>{page} ページ目</span>
          {hasNext && <Link href={`/notifications?page=${page + 1}`}>古いお知らせ →</Link>}
        </nav>
      )}

      <MarkReadOnView ids={unreadIds} />
    </MypageShell>
  );
}
