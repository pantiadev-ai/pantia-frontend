"use server";
/* ログインの記録（profiles.last_seen_at。管理画面の「ログイン」の列と、公開側の「オンライン」の印）。
   画面の Heartbeat から、開いたときと見えている間の3分ごとに呼ぶ。書くのは DB の touch_last_seen で、
   3分に1回まで（それより短い間は何もしない）。自分の行の時刻を今にするだけなので、回数の上限は付けない。 */
import { getViewer, runAction, type ActionResult } from "@/lib/auth";
import { throwDb } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";

export async function touchLastSeen(): Promise<ActionResult> {
  return runAction(
    async () => {
      const v = await getViewer();
      // ログインしていない・停止中は何もしない（DB も active の人しか書かない）
      if (!v || v.status !== "active") return { ok: true };
      const supabase = await createClient();
      const { error } = await supabase.rpc("touch_last_seen");
      throwDb(error);
      return { ok: true };
    },
    { mail: false },
  );
}
