/* cron の入口の共通（28 §B5・§F）。
   ・合言葉（CRON_SECRET）が無い・短いときは動かさない（503）。違えば 401。比べ方は時間差の出ない形。
   ・最後まで走ったら cron_runs に残す。/api/cron/health がそれを見て、止まっていれば 503 を返す（外形監視が知らせる）。
   ・vercel.json の crons を足したら、CRON_MAX_AGE_HOURS にも足す。 */
import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/database.types";
import { flushMail } from "@/lib/mail-dispatch";

const SECRET_MIN_LENGTH = 16;

/** cron ごとの「最後に走ってからこの時間を過ぎたら止まっている」。毎日1回なら 26 時間（Vercel の遅れを見込む） */
export const CRON_MAX_AGE_HOURS = {
  "expire-orders": 26,
  "auto-complete": 26,
  "retry-refunds": 26,
  cleanup: 26,
} as const;

export type CronName = keyof typeof CRON_MAX_AGE_HOURS;

function bearerMatches(header: string | null, secret: string): boolean {
  if (!header) return false;
  const given = createHash("sha256").update(header).digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(given, expected);
}

/** 合言葉の確認。通れば null、だめなら返す応答 */
export function cronGuard(req: Request): NextResponse | null {
  let secret = "";
  try {
    secret = serverEnv.cronSecret;
  } catch {
    secret = "";
  }
  if (secret.length < SECRET_MIN_LENGTH) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET が未設定か短すぎます（16文字以上）" }, { status: 503 });
  }
  if (!bearerMatches(req.headers.get("authorization"), secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return null;
}

/** 中身を走らせて、始めと終わりを cron_runs に残す。中身の失敗は 500（Vercel のログに残る） */
export async function runCron(name: CronName, fn: () => Promise<Record<string, Json>>): Promise<NextResponse> {
  const db = createServiceClient();
  const started = new Date().toISOString();
  await db.from("cron_runs").upsert({ name, last_started_at: started });
  try {
    const detail = await fn();
    // cron で動いた注文（期限切れ・自動完了・返金）のお知らせをメールにする。取りこぼしの拾い直しも兼ねる
    const mail = await flushMail().catch((e: unknown) => {
      console.error(`[cron] ${name}: お知らせのメールで失敗`, e instanceof Error ? e.message : e);
      return null;
    });
    if (mail) detail.mail_sent = mail.sent;
    const { error } = await db
      .from("cron_runs")
      .upsert({ name, last_started_at: started, last_finished_at: new Date().toISOString(), last_ok: true, last_error: null, detail });
    // 記録の失敗で結果は変えない。記録されなければ health が 503 になって外形監視が知らせる
    if (error) console.error(`[cron] cron_runs の記録に失敗: ${name}: ${error.message}`);
    return NextResponse.json({ ok: true, ...detail });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[cron] ${name} が失敗しました`, msg);
    await db.from("cron_runs").upsert({ name, last_started_at: started, last_ok: false, last_error: msg.slice(0, 500) });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

/** 決めた時間の内に最後まで（成功で）走っていない cron の名前 */
export function staleCrons(
  rows: { name: string; last_finished_at: string | null; last_ok: boolean | null }[],
  now: number,
): string[] {
  const last = new Map(rows.filter((r) => r.last_ok && r.last_finished_at).map((r) => [r.name, Date.parse(r.last_finished_at!)]));
  return Object.entries(CRON_MAX_AGE_HOURS)
    .filter(([name, hours]) => !(now - (last.get(name) ?? 0) <= hours * 3_600_000))
    .map(([name]) => name);
}
