/* ヘッダーの点（未読の通知・メッセージ）。1回の表示の中では1回だけ数える */
import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getUnread = cache(async (): Promise<{ notifications: number; messages: number }> => {
  const supabase = await createClient();
  const [n, m] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    supabase.rpc("my_unread_messages"),
  ]);
  return { notifications: n.count ?? 0, messages: typeof m.data === "number" ? m.data : 0 };
});
