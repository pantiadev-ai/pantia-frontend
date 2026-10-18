/* 期限の切れた支払い待ちを取り消し、決済会社の側も止める。cron（/api/cron/expire-orders）と、購入の手続きで
   「押さえられています・支払い待ちが多すぎます」と言われたときに呼ぶ（Vercel の cron が1日1回でも、売り場が詰まらないように）。
   取り消したあとに払われていたら、mark_group_paid が生き返らせるか返金待ちにする（syncGroupPayment）。 */
import "server-only";
import { cancelProviderPayment, refundOrder, syncGroupPayment } from "@/lib/adapters/payment";
import { createServiceClient } from "@/lib/supabase/service";

export async function expireStaleOrders(): Promise<{ cancelled: number; groups: number; paidLate: number; errors: number }> {
  const db = createServiceClient();
  const { data, error } = await db.rpc("cancel_expired_orders");
  if (error) throw new Error(error.message);
  const groups = new Map<string, { method: string; ref: string | null }>();
  for (const r of data ?? []) {
    const g = groups.get(r.group_id);
    if (!g || (!g.ref && r.payment_ref)) groups.set(r.group_id, { method: r.payment_method, ref: r.payment_ref ?? null });
  }
  let paidLate = 0;
  let errors = 0;
  for (const [groupId, g] of groups) {
    const outcome = await cancelProviderPayment(g.method, g.ref, groupId);
    if (outcome === "paid") {
      paidLate++;
      await syncGroupPayment(groupId).catch((e: unknown) => {
        errors++;
        console.error("[sweep] 遅れて届いた入金を書けませんでした", groupId, e instanceof Error ? e.message : e);
      });
    } else if (outcome === "error") {
      errors++;
    }
  }
  return { cancelled: data?.length ?? 0, groups: groups.size, paidLate, errors };
}

/** 返金待ちのまま残っている注文を、もう一度返金にかける（決済会社の不調・記録の失敗のやり直し） */
export async function retryRefunds(limit = 50): Promise<{ tried: number; refunded: number; failed: number }> {
  const { data, error } = await createServiceClient()
    .from("orders")
    .select("id")
    .eq("needs_refund", true)
    .is("refunded_at", null)
    .order("cancelled_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  let refunded = 0;
  let failed = 0;
  for (const o of data ?? []) {
    const r = await refundOrder(o.id);
    if (r.ok) refunded++;
    else failed++;
  }
  return { tried: data?.length ?? 0, refunded, failed };
}
