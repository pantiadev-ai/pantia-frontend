"use client";
/* 会話の一覧（左の欄）。検索とタブは手元で絞るだけ。
   会話が動いたら（threads の Realtime）、少し待ってから自分の権限で my_threads を読み直す */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { isOnline } from "@/lib/format";
import { createClient, realtimeReady } from "@/lib/supabase/browser";
import type { ThreadRow } from "./types";
import { initialOf, listTime, toThreadRow } from "./view";

type Props = {
  initial: ThreadRow[];
  /** 今開いている会話（/messages では null） */
  activeId: string | null;
  /** 0件のときの案内（役割で文が変わる） */
  emptyText: string;
  emptyLink?: { href: string; label: string };
};

export default function ThreadList({ initial, activeId, emptyText, emptyLink }: Props) {
  const [rows, setRows] = useState(initial);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "unread">("all");

  useEffect(() => {
    const supabase = createClient();
    let disposed = false;
    let joined = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refetch = () => {
      if (timer) clearTimeout(timer);
      // 送信は threads を2回更新する（既読・最後の一言）。まとめて1回だけ読む
      timer = setTimeout(async () => {
        timer = null;
        const { data } = await supabase.rpc("my_threads");
        if (!disposed && Array.isArray(data)) setRows(data.map(toThreadRow));
      }, 1000);
    };
    let channel: ReturnType<typeof supabase.channel> | null = null;
    // 鍵を渡してから購読する（lib/supabase/browser.ts の realtimeReady）
    void realtimeReady(supabase)
      .catch(() => undefined)
      .then(() => {
        if (disposed) return;
        channel = supabase
          .channel(`chat-list:${crypto.randomUUID()}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "threads" }, refetch)
          .subscribe((status) => {
            joined = status === "SUBSCRIBED";
          });
      });
    // Realtime がつながらないときは、見えている間だけ30秒ごとに読み直す
    const poll = setInterval(() => {
      if (!joined && document.visibilityState === "visible") refetch();
    }, 30000);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  // 開いている会話は、その画面で既読にするので未読0として出す
  const view = useMemo(() => rows.map((r) => (r.threadId === activeId ? { ...r, unread: 0 } : r)), [rows, activeId]);
  const unreadThreads = view.filter((r) => r.unread > 0).length;
  const q = query.trim().toLowerCase();
  const shown = view.filter((r) => (tab === "all" || r.unread > 0) && (!q || r.name.toLowerCase().includes(q) || r.preview.toLowerCase().includes(q)));

  return (
    <aside className="thread-list" aria-label="会話の一覧">
      <div className="tl-header">
        <h1 className="tl-title">メッセージ</h1>
        <div className="tl-search">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input type="search" placeholder="会話を検索..." aria-label="会話を検索" value={query} maxLength={50} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      <div className="thread-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "all"} className={`tt${tab === "all" ? " active" : ""}`} onClick={() => setTab("all")}>
          すべて
        </button>
        <button type="button" role="tab" aria-selected={tab === "unread"} className={`tt${tab === "unread" ? " active" : ""}`} onClick={() => setTab("unread")}>
          未読{unreadThreads > 0 && <span className="tt-unread-badge">{unreadThreads}</span>}
        </button>
      </div>
      <div className="threads-scroll">
        {rows.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-icon" aria-hidden="true">
              💬
            </div>
            <p>まだメッセージはありません。</p>
            <p>{emptyText}</p>
            {emptyLink && (
              <Link href={emptyLink.href} className="chat-empty-btn">
                {emptyLink.label}
              </Link>
            )}
          </div>
        ) : shown.length === 0 ? (
          <div className="chat-empty">
            <p>{tab === "unread" && !q ? "未読の会話はありません。" : "当てはまる会話はありません。"}</p>
          </div>
        ) : (
          shown.map((r) => {
            const online = r.role === "seller" && isOnline(r.lastSeenAt);
            const active = r.threadId === activeId;
            return (
              <Link
                key={r.threadId}
                href={`/messages/${r.threadId}`}
                className={`thread-item${active ? " active" : ""}${r.unread > 0 ? " unread" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <div className="ti-avatar">
                  {r.avatarUrl ? <img src={r.avatarUrl} alt="" className="chat-avatar-img" /> : initialOf(r.name)}
                  {online && <div className="ti-online" />}
                </div>
                <div className="ti-info">
                  <div className="ti-name">
                    <span className="chat-ellipsis">{r.name}</span>
                    {online && <span className="online-tag">オンライン</span>}
                    {r.muted && (
                      <span className="chat-muted-mark" title="お知らせを止めています" aria-label="お知らせを止めています">
                        🔕
                      </span>
                    )}
                  </div>
                  <div className={`ti-preview${r.unread > 0 ? " unread-text" : ""}`}>{r.preview || "（まだメッセージはありません）"}</div>
                </div>
                <div className="ti-right">
                  <div className="ti-time" suppressHydrationWarning>
                    {listTime(r.lastMessageAt)}
                  </div>
                  {r.unread > 0 && (
                    <div className="ti-badge" aria-label={`未読 ${r.unread}件`}>
                      {r.unread > 99 ? "99+" : r.unread}
                    </div>
                  )}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </aside>
  );
}
