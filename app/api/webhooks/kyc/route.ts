/* 本人確認の会社（TRUSTDOCK）からの結果の通知（POST）。ログインなしで届く（proxy.ts の公開パス）。
   ① 秘密の鍵が未設定なら 503（素通りさせない）
   ② 生の本文の HMAC-SHA256 を見出しの値と比べる。違えば 401
   ③ 同じ通知の二度目は、payment_events（provider='trustdock'）に記録があれば何もしない
   ④ kyc_provider_result を service role で呼ぶ（判定・お知らせ・18歳未満の停止は DB がする）
   ⑤ 終わったら payment_events に記録する（一意の違反＝同時に届いた二度目は無視）
   記録を先に書かないのは、service role が payment_events の行を消せないため。先に書いて④で失敗すると、
   再送が③で弾かれて結果が二度と入らない。同時に2本届いても、④の中の行ロックで2本目は bad_state になる。
   書類の写真はここでは消さない（判定から7日後に cron の cleanup が消す）。中身（個人の情報）はログに出さない。
   見出しの名前・中身の形は仮（lib/adapters/kyc.ts）。 */
import { NextResponse } from "next/server";
import { KYC_SIGNATURE_HEADER, parseKycWebhook, verifyKycSignature } from "@/lib/adapters/kyc";
import { dbCode } from "@/lib/db-errors";
import { serverEnv } from "@/lib/env";
import { scheduleMailFlush } from "@/lib/mail-dispatch";
import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/database.types";

export const dynamic = "force-dynamic";

/** 本文の上限（結果の通知は小さい。大きな本文で処理を重くさせない） */
const MAX_BODY = 64 * 1024;

function reply(status: number, body: Record<string, string | boolean>) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function resultStatus(v: Json | null): string {
  return v && typeof v === "object" && !Array.isArray(v) && typeof v.status === "string" ? v.status : "unknown";
}

export async function POST(req: Request) {
  // ① 鍵が無ければ受け付けない
  let secret: string;
  try {
    secret = serverEnv.trustdockWebhookSecret;
  } catch {
    console.error("[kyc-webhook] TRUSTDOCK_WEBHOOK_SECRET が未設定です");
    return reply(503, { error: "unavailable" });
  }

  // ② 本文の大きさと署名
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY) return reply(413, { error: "too_large" });
  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY) return reply(413, { error: "too_large" });
  if (!verifyKycSignature(raw, req.headers.get(KYC_SIGNATURE_HEADER), secret)) {
    return reply(401, { error: "bad_signature" });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply(400, { error: "bad_body" });
  }
  const result = parseKycWebhook(body);
  if (!result) return reply(400, { error: "bad_body" });

  const db = createServiceClient();

  // ③ 二度目か
  const { data: seen, error: seenError } = await db
    .from("payment_events")
    .select("event_id")
    .eq("provider", "trustdock")
    .eq("event_id", result.eventId)
    .maybeSingle();
  if (seenError) {
    console.error("[kyc-webhook] 記録を読めませんでした", seenError.code);
    return reply(500, { error: "retry" });
  }
  if (seen) return reply(200, { ok: true, duplicate: true });

  // ④ 判定を反映する
  const { data, error } = await db.rpc("kyc_provider_result", {
    p_ref: result.ref,
    p_approve: result.approve,
    p_reason: result.reason,
    p_underage: result.underage,
  });
  let kind: string;
  if (error) {
    if (dbCode(error) !== "bad_state") {
      console.error("[kyc-webhook] 判定を反映できませんでした", error.code, dbCode(error));
      return reply(500, { error: "retry" });
    }
    // 同時に届いた二度目（1本目が反映済み）
    kind = "kyc.already_decided";
  } else {
    const status = resultStatus(data);
    // not_found: 受付番号の申請が無い・判定済み（運営が手で判定した等）。再送しても変わらないので記録して終える
    if (status === "not_found") console.warn("[kyc-webhook] 受付番号に合う審査中の申請がありません");
    kind = `kyc.${status}`.slice(0, 80);
  }

  // ⑤ 記録する（一意の違反は同時に届いた二度目なので無視）
  const { error: insertError } = await db
    .from("payment_events")
    .insert({ provider: "trustdock", event_id: result.eventId, kind });
  if (insertError && insertError.code !== "23505") {
    // 判定は反映済み。記録だけ失敗しても、再送は④で not_found／bad_state になって害は無い
    console.error("[kyc-webhook] 記録を書けませんでした", insertError.code);
  }
  scheduleMailFlush();
  return reply(200, { ok: true });
}
