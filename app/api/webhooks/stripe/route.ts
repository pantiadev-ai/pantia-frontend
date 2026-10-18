/* Stripe からの通知（カード・銀行振込の入金、返金の失敗）。
   ・署名（STRIPE_WEBHOOK_SECRET）を生の本文で確かめる。鍵が無い・mock のときは受けない（503）。
   ・本文の金額や状態は信じず、applyStripeEvent が Stripe に聞き直してから DB に書く。
   ・同じ event を2回受けても、2回目は何もしない（payment_events）。処理が失敗したら 500 を返し、Stripe に再送させる。 */
import { NextResponse } from "next/server";
import { applyStripeEvent, stripeEventFrom } from "@/lib/adapters/payment";
import { serverEnv } from "@/lib/env";
import { scheduleMailFlush } from "@/lib/mail-dispatch";
import { createServiceClient } from "@/lib/supabase/service";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

const MAX_BODY = 256 * 1024;

function configured(): boolean {
  try {
    return serverEnv.paymentMode === "live" && serverEnv.stripeSecretKey !== "" && serverEnv.stripeWebhookSecret !== "";
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!configured()) return NextResponse.json({ ok: false }, { status: 503 });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ ok: false }, { status: 400 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return NextResponse.json({ ok: false }, { status: 413 });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ ok: false }, { status: 413 });

  let event: Stripe.Event;
  try {
    event = stripeEventFrom(raw, signature);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const db = createServiceClient();
  const { data: seen, error: seenError } = await db
    .from("payment_events")
    .select("event_id")
    .eq("provider", "stripe")
    .eq("event_id", event.id)
    .maybeSingle();
  if (seenError) {
    console.error("[webhook:stripe] 受信記録を読めませんでした", seenError.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  if (seen) return NextResponse.json({ received: true });

  try {
    await applyStripeEvent(event);
  } catch (e) {
    console.error("[webhook:stripe] 処理に失敗（Stripe が再送します）", event.type, e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const { error } = await db.from("payment_events").insert({ provider: "stripe", event_id: event.id, kind: event.type.slice(0, 80) });
  // 同時に2通届いたときの重複（23505）は問題ない。処理は何度やっても同じ結果になる（mark_group_paid が already を返す）
  if (error && error.code !== "23505") console.error("[webhook:stripe] 受信記録を書けませんでした", error.message);
  scheduleMailFlush();
  return NextResponse.json({ received: true });
}
