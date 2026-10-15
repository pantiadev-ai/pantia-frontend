/* お知らせのメール（注文・本人確認・振込）を送る。0009 の claim_mail_batch で拾った分だけ。
   ・呼ぶ所: server action の成功のあと（runAction）、決済・本人確認の webhook、cron。どれも応答を返したあと（after）に走る。
   ・送るかどうか（管理画面のメール設定・本人の「購入が入ったときのメール」）は DB の側で決める。
   ・件名と本文は lib/mail-compose.ts（注文のメールには商品名を載せない）。
   ・失敗しても呼び手は止めない。送れなかった分は mail_outbox に残る（送り直さない。画面のお知らせは残っている）。 */
import "server-only";
import { after } from "next/server";
import { sendMail } from "@/lib/adapters/mail";
import { publicEnv } from "@/lib/env";
import { composeMail } from "@/lib/mail-compose";
import { createServiceClient } from "@/lib/supabase/service";

const BATCH = 50;
/** 1回で拾う回数の上限（50件×4回）。残りは次に呼ばれたときに送る */
const MAX_ROUNDS = 4;

/** 送るべき分を拾って送る。何件送れたかを返す */
export async function flushMail(): Promise<{ sent: number; failed: number }> {
  const db = createServiceClient();
  const siteUrl = publicEnv.siteUrl;
  let sent = 0;
  let failed = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { data, error } = await db.rpc("claim_mail_batch", { p_limit: BATCH });
    if (error) {
      console.error("[mail] お知らせのメールを拾えませんでした", error.message);
      break;
    }
    const rows = data ?? [];
    for (const row of rows) {
      const { subject, text } = composeMail(row, siteUrl);
      try {
        const r = await sendMail({ to: row.email, subject, text, userId: row.user_id, kind: `notice.${row.kind}` });
        if (r.sent) sent++;
        else failed++;
      } catch (e) {
        failed++;
        console.error("[mail] 送れませんでした", e instanceof Error ? e.message : e);
      }
    }
    // 拾った件数（送らない設定の分を含む）は DB の側で決まる。返ってきた行が BATCH より少なければ、まず残りは無い
    if (rows.length < BATCH) break;
  }
  return { sent, failed };
}

/** 応答を返したあとにメールを送る。リクエストの外（テストなど）で呼ばれたときは何もしない */
export function scheduleMailFlush(): void {
  try {
    after(async () => {
      try {
        await flushMail();
      } catch (e) {
        console.error("[mail] お知らせのメールの送信で失敗", e instanceof Error ? e.message : e);
      }
    });
  } catch {
    // after() はリクエストの中でしか呼べない
  }
}
