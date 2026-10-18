/* 決済の口（Stripe のカード・銀行振込、PayPay、契約前の mock）。
   ・お金が動いたかは、決済会社に聞き直した値だけを信じる。画面の戻り先・webhook の本文は「聞き直す合図」にしか使わない。
   ・DB に書くのは service_role の関数だけ（create_checkout → attach_payment_ref → mark_group_paid／mark_refunded）。
   ・決済会社に送るのは金額・まとめ番号（group_id）・購入者のメールアドレスだけ。商品名は送らない（明細は「パンティアのご注文」）。
   ・PAYMENT_MODE=mock は本番（VERCEL_ENV=production）では受け付けない。

   orders.payment_ref に入る値:
     card・bank … 手続き中は Checkout Session（cs_…）。銀行振込の案内が出たら PaymentIntent（pi_…）。入金後も pi_…
     paypay     … 手続き中は QR の codeId。入金後は PayPay の paymentId
     mock       … mock:<group_id> */
import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import Stripe from "stripe";
import { publicEnv, serverEnv } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/service";

export type PayMethod = "card" | "bank" | "paypay" | "mock";
export type RefundResult = { ok: true; ref: string } | { ok: false; error: string };
export type StartResult = { ok: true; redirectUrl: string; ref: string } | { ok: false; error: string };
/** mark_group_paid の返事（paid・already・revived・refund_needed・amount_mismatch・not_found）か、まだ払われていない（unpaid） */
export type SyncResult = string;

const ORDER_LABEL = "パンティアのご注文";
const MIN = 60;

/** 今の設定で選べる支払い方法。mock の間は mock だけ（本番では何も選べない＝購入を受け付けない） */
export function availableMethods(): PayMethod[] {
  if (serverEnv.paymentMode === "mock") return serverEnv.isProduction ? [] : ["mock"];
  return serverEnv.paymentMethods.filter((m): m is PayMethod => m === "card" || m === "bank" || m === "paypay");
}

export function mockAllowed(): boolean {
  return serverEnv.paymentMode === "mock" && !serverEnv.isProduction;
}

/* ───────────── Stripe ───────────── */

let stripeClient: Stripe | null = null;
function stripe(): Stripe {
  stripeClient ??= new Stripe(serverEnv.stripeSecretKey, { maxNetworkRetries: 2, timeout: 20_000 });
  return stripeClient;
}

/** Checkout の期限（30分〜24時間の間でなければ Stripe が受け付けない） */
function stripeExpiry(seconds: number): number {
  return Math.floor(Date.now() / 1000) + Math.min(Math.max(seconds, 30 * MIN + 60), 24 * 60 * MIN - 60);
}

function lineItem(total: number): Stripe.Checkout.SessionCreateParams.LineItem {
  return { quantity: 1, price_data: { currency: "jpy", unit_amount: total, product_data: { name: ORDER_LABEL } } };
}

/** 銀行振込の振込先（バーチャル口座）は Stripe の顧客ごとに決まる。同じ購入者には同じ顧客を使い回す */
async function stripeCustomerFor(buyerId: string, email: string): Promise<string> {
  const list = await stripe().customers.list({ email, limit: 10 });
  const hit = list.data.find((c) => c.metadata?.user_id === buyerId);
  if (hit) return hit.id;
  const c = await stripe().customers.create(
    { email, metadata: { user_id: buyerId } },
    { idempotencyKey: `customer-${buyerId}-${email}` },
  );
  return c.id;
}

function piId(pi: string | Stripe.PaymentIntent | null | undefined): string | null {
  if (!pi) return null;
  return typeof pi === "string" ? pi : pi.id;
}

/** 署名を確かめて event にする（webhook 用）。だめなら投げる */
export function stripeEventFrom(rawBody: string, signature: string): Stripe.Event {
  return stripe().webhooks.constructEvent(rawBody, signature, serverEnv.stripeWebhookSecret);
}

/* ───────────── PayPay（Open Payment API。署名は HMAC-SHA256） ───────────── */

type PaypayReply<T> = { status: number; code: string; data: T | null };

function paypayBase(): string {
  return serverEnv.paypayProduction ? "https://apigw.paypay.ne.jp" : "https://apigw.sandbox.paypay.ne.jp";
}

async function paypay<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<PaypayReply<T>> {
  const payload = body === undefined ? "" : JSON.stringify(body);
  const contentType = body === undefined ? "empty" : "application/json;charset=UTF-8;";
  const hash =
    body === undefined ? "empty" : createHash("md5").update(contentType, "utf8").update(payload, "utf8").digest("base64");
  const nonce = randomBytes(8).toString("hex").slice(0, 8);
  const epoch = String(Math.floor(Date.now() / 1000));
  const mac = createHmac("sha256", serverEnv.paypayApiSecret)
    .update([path, method, nonce, epoch, contentType, hash].join("\n"), "utf8")
    .digest("base64");
  const headers: Record<string, string> = {
    Authorization: `hmac OPA-Auth:${serverEnv.paypayApiKey}:${mac}:${nonce}:${epoch}:${hash}`,
    "X-ASSUME-MERCHANT": serverEnv.paypayMerchantId,
  };
  if (body !== undefined) headers["Content-Type"] = contentType;
  const res = await fetch(paypayBase() + path, {
    method,
    headers,
    body: body === undefined ? undefined : payload,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => null)) as { resultInfo?: { code?: string }; data?: T } | null;
  return { status: res.status, code: json?.resultInfo?.code ?? "", data: json?.data ?? null };
}

type PaypayPayment = {
  status?: string;
  paymentId?: string;
  merchantPaymentId?: string;
  amount?: { amount?: number; currency?: string };
};

/** PayPay の支払いの状態（merchantPaymentId = group_id）。取れなければ null */
export async function fetchPaypayPayment(groupId: string): Promise<PaypayPayment | null> {
  const r = await paypay<PaypayPayment>("GET", `/v2/codes/payments/${encodeURIComponent(groupId)}`);
  return r.code === "SUCCESS" && r.data ? r.data : null;
}

/* ───────────── 支払いを始める ───────────── */

export type StartInput = {
  groupId: string;
  total: number;
  method: PayMethod;
  buyerId: string;
  buyerEmail: string | null;
};

/** 決済会社の画面を用意して、行き先の URL と payment_ref を返す（DB への書き込みは呼び手が attach_payment_ref で行う） */
export async function startPayment(p: StartInput): Promise<StartResult> {
  if (!availableMethods().includes(p.method)) return { ok: false, error: "この支払い方法は、いまは使えません。" };
  const back = `${publicEnv.siteUrl}/orders?group=${p.groupId}`;
  try {
    switch (p.method) {
      case "mock":
        return { ok: true, redirectUrl: `/checkout/mock?group=${p.groupId}`, ref: `mock:${p.groupId}` };

      case "card": {
        const s = await stripe().checkout.sessions.create(
          {
            mode: "payment",
            locale: "ja",
            payment_method_types: ["card"],
            line_items: [lineItem(p.total)],
            client_reference_id: p.groupId,
            metadata: { group_id: p.groupId },
            payment_intent_data: { metadata: { group_id: p.groupId } },
            ...(p.buyerEmail ? { customer_email: p.buyerEmail } : {}),
            success_url: `${back}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${back}&back=1`,
            expires_at: stripeExpiry(30 * MIN + 60),
          },
          { idempotencyKey: `checkout-${p.groupId}` },
        );
        if (!s.url) throw new Error("Checkout の URL がありません");
        return { ok: true, redirectUrl: s.url, ref: s.id };
      }

      case "bank": {
        // 返金のときに Stripe が口座を聞くメールを送るので、メールアドレスが要る
        if (!p.buyerEmail) return { ok: false, error: "銀行振込には、メールアドレスの登録が必要です。" };
        const customer = await stripeCustomerFor(p.buyerId, p.buyerEmail);
        const s = await stripe().checkout.sessions.create(
          {
            mode: "payment",
            locale: "ja",
            customer,
            payment_method_types: ["customer_balance"],
            payment_method_options: {
              customer_balance: { funding_type: "bank_transfer", bank_transfer: { type: "jp_bank_transfer" } },
            },
            line_items: [lineItem(p.total)],
            client_reference_id: p.groupId,
            metadata: { group_id: p.groupId },
            payment_intent_data: { metadata: { group_id: p.groupId } },
            success_url: `${back}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${back}&back=1`,
            // 振込先を受け取るまでの期限。振込そのものの期限は注文の72時間（過ぎたら cron が PaymentIntent を止める）
            expires_at: stripeExpiry(23 * 60 * MIN),
          },
          { idempotencyKey: `checkout-${p.groupId}` },
        );
        if (!s.url) throw new Error("Checkout の URL がありません");
        return { ok: true, redirectUrl: s.url, ref: s.id };
      }

      case "paypay": {
        const r = await paypay<{ url?: string; codeId?: string }>("POST", "/v2/codes", {
          merchantPaymentId: p.groupId,
          amount: { amount: p.total, currency: "JPY" },
          codeType: "ORDER_QR",
          orderDescription: ORDER_LABEL,
          isAuthorization: false,
          redirectUrl: back,
          redirectType: "WEB_LINK",
          requestedAt: Math.floor(Date.now() / 1000),
        });
        if (r.code !== "SUCCESS" || !r.data?.url || !r.data.codeId) throw new Error(`PayPay: ${r.status} ${r.code}`);
        return { ok: true, redirectUrl: r.data.url, ref: r.data.codeId };
      }
    }
  } catch (e) {
    console.error("[payment] 支払いを始められませんでした", p.method, e instanceof Error ? e.message : e);
    return { ok: false, error: "決済の画面を開けませんでした。少しおいて、もう一度お試しください。" };
  }
}

/* ───────────── 入金を確かめて DB に書く ───────────── */

type GroupRow = { id: string; status: string; total: number; payment_method: string; payment_ref: string | null; needs_refund: boolean };

async function loadGroup(groupId: string): Promise<GroupRow[]> {
  const { data, error } = await createServiceClient()
    .from("orders")
    .select("id, status, total, payment_method, payment_ref, needs_refund")
    .eq("group_id", groupId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** 入金を DB に書く。期限切れのあとに払われて、もう売れていた分は、その場で返金にかける */
export async function settleGroup(groupId: string, ref: string, amount: number): Promise<SyncResult> {
  const db = createServiceClient();
  const { data, error } = await db.rpc("mark_group_paid", { p_group: groupId, p_ref: ref, p_amount: amount });
  if (error) throw new Error(error.message);
  if (data === "amount_mismatch") console.error("[payment] 金額が合いません（監査ログに記録済み）", groupId);
  if (data === "refund_needed") {
    for (const o of await loadGroup(groupId)) {
      if (o.needs_refund) {
        const r = await refundOrder(o.id);
        if (!r.ok) console.error("[payment] 返金できませんでした（cron でやり直します）", o.id, r.error);
      }
    }
  }
  return data;
}

/** 決済会社に聞き直して、払われていれば DB に書く。画面に戻ってきたとき・cron・webhook から呼ぶ。
    呼ぶ前に、呼び手がこの group の購入者であること（画面）か、署名・秘密を確かめたこと（webhook・cron）を確かめておく */
export async function syncGroupPayment(groupId: string): Promise<SyncResult> {
  const rows = await loadGroup(groupId);
  if (rows.length === 0) return "not_found";
  const open = rows.filter((o) => o.status === "pending" || (o.status === "cancelled" && !o.needs_refund));
  if (open.length === 0) return "already";
  const method = rows[0]!.payment_method as PayMethod;
  const ref = rows.find((o) => o.payment_ref)?.payment_ref ?? null;

  if (method === "mock") return "unpaid";

  if (method === "paypay") {
    const pay = await fetchPaypayPayment(groupId);
    if (pay?.status === "COMPLETED" && pay.paymentId && typeof pay.amount?.amount === "number") {
      return settleGroup(groupId, pay.paymentId, pay.amount.amount);
    }
    return "unpaid";
  }

  // card・bank（Stripe）
  if (!ref) return "unpaid";
  if (ref.startsWith("cs_")) {
    const s = await stripe().checkout.sessions.retrieve(ref);
    const pi = piId(s.payment_intent);
    if (s.payment_status === "paid" && pi && s.amount_total !== null) return settleGroup(groupId, pi, s.amount_total);
    // 銀行振込で振込先を受け取った所。以後は PaymentIntent で追う（期限切れで止めるため）
    if (s.status === "complete" && pi) await attachRef(groupId, pi);
    return "unpaid";
  }
  if (ref.startsWith("pi_")) {
    const pi = await stripe().paymentIntents.retrieve(ref);
    if (pi.status === "succeeded") return settleGroup(groupId, pi.id, pi.amount_received);
  }
  return "unpaid";
}

async function attachRef(groupId: string, ref: string): Promise<void> {
  const { error } = await createServiceClient().rpc("attach_payment_ref", { p_group: groupId, p_ref: ref });
  if (error) throw new Error(error.message);
}

/** Stripe の webhook の中身を DB に映す（署名・二重受けの確認は route で済ませてから呼ぶ） */
export async function applyStripeEvent(event: Stripe.Event): Promise<string> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object;
      const groupId = s.metadata?.group_id ?? s.client_reference_id ?? "";
      const pi = piId(s.payment_intent);
      if (!groupId || !pi) return "ignored";
      // 本文の値は信じず、Stripe に聞き直す
      const fresh = await stripe().checkout.sessions.retrieve(s.id);
      if (fresh.payment_status === "paid" && fresh.amount_total !== null) return settleGroup(groupId, pi, fresh.amount_total);
      if (fresh.status === "complete") await attachRef(groupId, pi);
      return "unpaid";
    }
    case "refund.failed": {
      // 銀行振込の返金で、45日のうちに口座が届かなかった等。Stripe の外で返す必要がある
      const r = event.data.object;
      await createServiceClient().rpc("audit", {
        p_actor: null as unknown as string,
        p_action: "payment.refund_failed",
        p_target_type: "refund",
        p_target_id: r.id,
        p_detail: { order_id: r.metadata?.order_id ?? null, reason: r.failure_reason ?? null },
      });
      return "logged";
    }
    default:
      return "ignored";
  }
}

/* ───────────── 決済会社の側を止める（期限切れ・本人の取り消し） ───────────── */

/** 止めた（cancelled）／もう払われていた（paid）／止められなかった（error） */
export type CancelOutcome = "cancelled" | "paid" | "error";

export async function cancelProviderPayment(method: string, ref: string | null, groupId: string): Promise<CancelOutcome> {
  try {
    if (method === "mock") return "cancelled";
    if (method === "paypay") {
      const pay = await fetchPaypayPayment(groupId);
      if (pay?.status === "COMPLETED") return "paid";
      if (ref) await paypay("DELETE", `/v2/codes/${encodeURIComponent(ref)}`);
      return "cancelled";
    }
    if (!ref) return "cancelled";
    if (ref.startsWith("cs_")) {
      const s = await stripe().checkout.sessions.retrieve(ref);
      if (s.payment_status === "paid") return "paid";
      if (s.status === "open") {
        await stripe().checkout.sessions.expire(ref);
        return "cancelled";
      }
      const pi = piId(s.payment_intent);
      return pi ? cancelIntent(pi) : "cancelled";
    }
    if (ref.startsWith("pi_")) return cancelIntent(ref);
    return "cancelled";
  } catch (e) {
    console.error("[payment] 決済会社の側を止められませんでした", method, e instanceof Error ? e.message : e);
    return "error";
  }
}

async function cancelIntent(id: string): Promise<CancelOutcome> {
  const pi = await stripe().paymentIntents.retrieve(id);
  if (pi.status === "succeeded") return "paid";
  if (pi.status === "canceled") return "cancelled";
  try {
    await stripe().paymentIntents.cancel(id);
    return "cancelled";
  } catch {
    // 止める間に入金が来た
    const again = await stripe().paymentIntents.retrieve(id);
    return again.status === "succeeded" ? "paid" : again.status === "canceled" ? "cancelled" : "error";
  }
}

/** 支払い待ちの続き（カード: まだ開いている支払い画面／銀行振込: 振込先の案内／テスト決済）。無ければ null。
    PayPay は QR の URL を持っていないので出せない（取り消して買い直してもらう）。
    呼ぶ前に、見ている人がこの group の購入者であることを確かめておく（URL は本人だけに見せる） */
export async function resumeUrl(method: string, ref: string | null, groupId: string): Promise<string | null> {
  try {
    if (method === "mock") return mockAllowed() ? `/checkout/mock?group=${groupId}` : null;
    if (!ref || method === "paypay") return null;
    let pi: string | null = ref.startsWith("pi_") ? ref : null;
    if (ref.startsWith("cs_")) {
      const s = await stripe().checkout.sessions.retrieve(ref);
      if (s.status === "open" && s.url) return s.url;
      pi = piId(s.payment_intent);
    }
    if (!pi) return null;
    const intent = await stripe().paymentIntents.retrieve(pi);
    return intent.next_action?.display_bank_transfer_instructions?.hosted_instructions_url ?? null;
  } catch (e) {
    console.error("[payment] 支払いの続きを取れませんでした", method, e instanceof Error ? e.message : e);
    return null;
  }
}

/* ───────────── 返金 ───────────── */

/** キャンセルになった注文のお金を返す。返せたら DB に返金済みを書く（mark_refunded）。
    呼ぶ前に、注文が needs_refund であること・呼び手が管理者か当事者であることを確かめておく */
export async function refundOrder(orderId: string): Promise<RefundResult> {
  const db = createServiceClient();
  const { data: o, error } = await db
    .from("orders")
    .select("id, total, payment_method, payment_ref, needs_refund, refunded_at")
    .eq("id", orderId)
    .maybeSingle();
  if (error) return { ok: false, error: "注文を読めませんでした。" };
  if (!o) return { ok: false, error: "注文が見つかりません。" };
  if (o.refunded_at) return { ok: true, ref: "already" };
  if (!o.needs_refund) return { ok: false, error: "この注文は返金待ちではありません。" };

  let ref: string;
  try {
    if (o.payment_method === "mock") {
      if (serverEnv.isProduction) return { ok: false, error: "本番では mock の返金はできません。" };
      ref = `mock-refund:${o.id}`;
    } else if (o.payment_method === "paypay") {
      ref = await refundPaypay(o.id, o.payment_ref, o.total);
    } else {
      ref = await refundStripe(o.id, o.payment_ref, o.total);
    }
  } catch (e) {
    console.error("[payment] 返金できませんでした", o.payment_method, e instanceof Error ? e.message : e);
    return { ok: false, error: "決済会社で返金できませんでした。時間をおいて自動でやり直します。" };
  }

  const { error: markErr } = await db.rpc("mark_refunded", { p_order: o.id, p_ref: ref });
  if (markErr) {
    // 返金は通った。次のやり直しで同じ返金を見つけて印だけ付け直す（二重に返さない）
    console.error("[payment] 返金の印を付けられませんでした", o.id, markErr.message);
    return { ok: false, error: "返金は受け付けましたが、記録に失敗しました。自動でやり直します。" };
  }
  return { ok: true, ref };
}

async function refundStripe(orderId: string, ref: string | null, amount: number): Promise<string> {
  if (!ref) throw new Error("payment_ref がありません");
  let pi = ref;
  if (ref.startsWith("cs_")) {
    const s = await stripe().checkout.sessions.retrieve(ref);
    const id = piId(s.payment_intent);
    if (!id) throw new Error("PaymentIntent がありません");
    pi = id;
  }
  if (!pi.startsWith("pi_")) throw new Error("PaymentIntent ではありません");
  // 同じ注文の返金がもうあれば、それを使う（印を付け損ねたあとのやり直しで二重に返さない）
  const existing = await stripe().refunds.list({ payment_intent: pi, limit: 100 });
  const hit = existing.data.find((r) => r.metadata?.order_id === orderId && r.status !== "failed" && r.status !== "canceled");
  if (hit) return hit.id;
  const r = await stripe().refunds.create(
    { payment_intent: pi, amount, metadata: { order_id: orderId } },
    { idempotencyKey: `refund-${orderId}` },
  );
  if (r.status === "failed" || r.status === "canceled") throw new Error(`refund ${r.status}`);
  return r.id;
}

async function refundPaypay(orderId: string, paymentId: string | null, amount: number): Promise<string> {
  if (!paymentId) throw new Error("paymentId がありません");
  const merchantRefundId = `rf-${orderId}`;
  const r = await paypay<{ status?: string }>("POST", "/v2/refunds", {
    merchantRefundId,
    paymentId,
    amount: { amount, currency: "JPY" },
    requestedAt: Math.floor(Date.now() / 1000),
    reason: "注文の取り消し",
  });
  if (r.code === "SUCCESS") return merchantRefundId;
  // 前のやり直しで受け付け済みなら、それを使う
  const again = await paypay<{ status?: string }>("GET", `/v2/refunds/${encodeURIComponent(merchantRefundId)}`);
  if (again.code === "SUCCESS" && (again.data?.status === "CREATED" || again.data?.status === "COMPLETED")) {
    return merchantRefundId;
  }
  throw new Error(`PayPay refund: ${r.status} ${r.code}`);
}
