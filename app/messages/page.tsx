/* メッセージの一覧（見本 chat.html の左の欄）。広い画面では右に「会話を選んでください」、狭い画面では一覧だけ。
   会話の画面は /messages/<会話の id>。古いお知らせの住所 /messages?t=<id> はそちらへ送る */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ChatHeaderBar from "@/components/chat/ChatHeaderBar";
import ThreadList from "@/components/chat/ThreadList";
import { listEmpty, toThreadRow } from "@/components/chat/view";
import { requireViewer } from "@/lib/auth";
import { isUuid } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";
import "@/styles/chat.css";
import "@/components/chat/chat-extra.css";

export const metadata: Metadata = {
  title: "メッセージ",
  robots: { index: false, follow: false },
};

export default async function MessagesPage({ searchParams }: PageProps<"/messages">) {
  const sp = await searchParams;
  const t = Array.isArray(sp.t) ? sp.t[0] : sp.t;
  // ログインの前に送る（ログインの後に、その会話へ戻れるように）
  if (isUuid(t)) redirect(`/messages/${t.toLowerCase()}`);

  const viewer = await requireViewer("/messages");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_threads");
  if (error) throw new Error(`会話の一覧を読めませんでした: ${error.code ?? ""}`);
  const rows = (data ?? []).map(toThreadRow);
  const empty = listEmpty(viewer.role);

  return (
    <div className="pg-chat">
      <ChatHeaderBar viewer={viewer} />
      <div className="chat-layout no-side is-list">
        <ThreadList initial={rows} activeId={null} emptyText={empty.text} emptyLink={empty.link} />
        <main className="chat-main chat-placeholder">
          <div className="chat-placeholder-icon" aria-hidden="true">
            💬
          </div>
          <p>{rows.length > 0 ? "左の一覧から会話を選んでください" : "まだメッセージはありません"}</p>
        </main>
      </div>
    </div>
  );
}
