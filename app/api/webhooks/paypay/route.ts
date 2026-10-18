/* PayPay からの通知（支払いの完了など）。
   PayPay の通知には署名が無い。だから本文は「どの注文を見直すか」の合図にだけ使い、
   状態と金額は必ず PayPay に聞き直す（syncGroupPayment）。偽の通知が来ても、PayPay で払われていなければ何も起きない。
   ・聞き直しの連打で PayPay の枠を食い潰されないよう、回線ごとに回数を数える（失敗したら止める側）。
   ・PayPay で払う注文が無い group は、そのまま 200 で返す（あるか無いかを外に見せない）。 */
import { NextResponse } from "next/server";
import { syncGroupPayment } from "@/lib/adapters/payment";
import { serverEnv } from "@/lib/env";
import { scheduleMailFlush } from "@/lib/mail-dispatch";
import { takeRateLimit } from "@/lib/rate-limit";
import { RULES, clientIp } from "@/lib/rate-limit-rules";
import { isUuid } from "@/lib/search";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const MAX_BODY = 64 * 1024;

function configured(): boolean {
  try {
    return serverEnv.paymentMode === "live" && serverEnv.paymentMethods.includes("paypay") && serverEnv.paypayApiKey !== "";
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!configured()) return NextResponse.json({ ok: false }, { status: 503 });

  const limit = await takeRateLimit([{ rule: RULES.paypayHookIp, kind: "ip", id: clientIp(req.headers) }], { failClosed: true });
  if (!limit.ok) {
    return NextResponse.json({ ok: false }, { status: limit.reason === "limited" ? 429 : 503, headers: { "Retry-After": String(limit.retryAfter) } });
  }

  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return NextResponse.json({ ok: false }, { status: 413 });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ ok: false }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const groupId = b.merchant_order_id;
  const state = typeof b.state === "string" ? b.state.slice(0, 40) : "";
  const kind = typeof b.notification_type === "string" ? b.notification_type.slice(0, 80) : "Transaction";
  if (!isUuid(groupId)) return NextResponse.json({ ok: false }, { status: 400 });

  const db = createServiceClient();
  const { data: orders, error } = await db.from("orders").select("id").eq("group_id", groupId).eq("payment_method", "paypay").limit(1);
  if (error) {
    console.error("[webhook:paypay] 注文を読めませんでした", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  if (!orders || orders.length === 0) return NextResponse.json({ received: true });

  try {
    await syncGroupPayment(groupId);
  } catch (e) {
    console.error("[webhook:paypay] 聞き直しに失敗（PayPay が再送します）", groupId, e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const { error: logError } = await db
    .from("payment_events")
    .insert({ provider: "paypay", event_id: `${groupId}:${state || "unknown"}`, kind });
  if (logError && logError.code !== "23505") console.error("[webhook:paypay] 受信記録を書けませんでした", logError.message);
  scheduleMailFlush();
  return NextResponse.json({ received: true });
}
