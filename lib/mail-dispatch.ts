/* お知らせのメール（注文・本人確認・振込）を送る。0009 の claim_mail_batch で拾った分だけ。
   ・呼ぶ所: server action の成功のあと（runAction）、決済・本人確認の webhook、cron。どれも応答を返したあと（after）に走る。
   ・送るかどうか（管理画面のメール設定・本人の「購入が入ったときのメール」）は DB の側で決める。
   ・件名と本文は lib/mail-compose.ts（注文のメールには商品名を載せない）。
     管理画面で書き換えた件名・書き出し（mail_templates）は、送る行があるときに1回の実行で1回だけ読む。読めなければ既定の文面で送る。
   ・失敗しても呼び手は止めない。送れなかった分は mail_outbox に残る（送り直さない。画面のお知らせは残っている）。
   ・環境変数の設定がおかしい（lib/mail-config.ts）あいだは、拾わずに待たせる。 */
import "server-only";
import { after } from "next/server";
import { sendMail } from "@/lib/adapters/mail";
import { publicEnv } from "@/lib/env";
import { composeMail } from "@/lib/mail-compose";
import { mailConfig } from "@/lib/mail-config";
import { loadOverrides, templateFor, type MailOverride } from "@/lib/mail-templates";
import { createServiceClient } from "@/lib/supabase/service";

const BATCH = 50;
/** 1回で拾う回数の上限（50件×4回）。残りは次に呼ばれたときに送る */
const MAX_ROUNDS = 4;

/** 送るべき分を拾って送る。何件送れたかを返す */
export async function flushMail(): Promise<{ sent: number; failed: number }> {
  // 設定がおかしいあいだは拾わない（拾うと mailed_at が付き、送れないまま失われる）。直れば3日以内の分は次に送られる
  const config = mailConfig(process.env);
  if (config.state === "broken") {
    console.error("[mail] メールの設定がおかしいので、お知らせを拾わずに待たせます", config.reason);
    return { sent: 0, failed: 0 };
  }
  const db = createServiceClient();
  const siteUrl = publicEnv.siteUrl;
  let sent = 0;
  let failed = 0;
  // 送る行が無いときは読まない（操作のたびに呼ばれるため）
  let overrides: Map<string, MailOverride> | null = null;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { data, error } = await db.rpc("claim_mail_batch", { p_limit: BATCH });
    if (error) {
      console.error("[mail] お知らせのメールを拾えませんでした", error.message);
      break;
    }
    const rows = data ?? [];
    if (rows.length > 0 && !overrides) overrides = await loadOverrides(db);
    for (const row of rows) {
      const key = templateFor(row.kind, row.title)?.key;
      const { subject, text } = composeMail(row, siteUrl, key ? (overrides?.get(key) ?? null) : null);
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
