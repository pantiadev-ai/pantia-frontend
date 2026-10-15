/* 回数の上限（サーバー側）。ルールの表とIPの読み方は ./rate-limit-rules.ts。

   ▼数えられなかったとき（DBの不調・migration 未適用）
   ・ログイン・登録は通す（failClosed: false）。数えられないせいで全員が入れなくなるのを避ける。
     Supabase Auth 側にも回数の上限がある。
   ・それ以外（投稿・通報・購入など）は止める（failClosed: true）。 */

import "server-only";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { bucketKey, clientIp, tooManyMessage, type LimitCheck, type LimitDecision } from "./rate-limit-rules";

export { RULES, type LimitCheck, type LimitDecision } from "./rate-limit-rules";

const UNAVAILABLE: LimitDecision = {
  ok: false,
  reason: "unavailable",
  retryAfter: 30,
  message: "ただいま混み合っています。少し時間をおいて、もう一度お試しください。",
};

/** 並べた枠を順に数える。1つでも超えていたら止める。
    誰か分からない枠（IPが取れない等）は外す（空のまま数えると全員が1つの枠を分け合う）。 */
export async function takeRateLimit(checks: LimitCheck[], opts: { failClosed: boolean }): Promise<LimitDecision> {
  const kept = checks.filter((c) => c.id.trim() !== "");
  if (kept.length === 0) return { ok: true };
  if (kept.length > 8) {
    console.error("[rate-limit] 1回に数えられる枠は8つまでです");
    return opts.failClosed ? UNAVAILABLE : { ok: true };
  }
  try {
    const { data, error } = await createServiceClient().rpc("rate_limit_take", {
      p_buckets: kept.map(bucketKey),
      p_window_seconds: kept.map((c) => c.rule.windowSec),
      p_max: kept.map((c) => c.rule.max),
      p_offset_seconds: kept.map(() => 0),
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as
      | { allowed?: unknown; retry_after_seconds?: number | null }
      | null
      | undefined;
    if (!row || typeof row.allowed !== "boolean") throw new Error("返事の形が違います");
    if (row.allowed) return { ok: true };
    const retryAfter = Math.max(1, Math.ceil(Number(row.retry_after_seconds) || 60));
    return { ok: false, reason: "limited", retryAfter, message: tooManyMessage(retryAfter) };
  } catch (e) {
    console.error("[rate-limit] 回数を数えられませんでした", e instanceof Error ? e.message : e);
    return opts.failClosed ? UNAVAILABLE : { ok: true };
  }
}

/** 呼び手のIP（取れなければ ""）。 */
export async function requestIp(): Promise<string> {
  try {
    return clientIp(await headers());
  } catch {
    return "";
  }
}
