/* 注文の画面で、決済会社に聞き直す・支払いの続きの URL を出す（サーバーだけ）。
   どちらも「見ている人がその group の購入者」と RLS で確かめてから service_role を使う。 */
import "server-only";
import { resumeUrl, syncGroupPayment } from "@/lib/adapters/payment";
import { RULES, takeRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type GroupState = {
  /** 支払い待ちが残っている */
  pending: boolean;
  /** 払われて注文が進んだ（paid 以降が1つでもある） */
  paid: boolean;
  /** 全部が取り消し */
  cancelled: boolean;
  method: string;
  expiresAt: string | null;
};

async function readGroup(groupId: string, buyerId: string): Promise<GroupState | null> {
  const { data, error } = await (await createClient())
    .from("orders")
    .select("status, payment_method, expires_at")
    .eq("group_id", groupId)
    .eq("buyer_id", buyerId);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  const pending = data.filter((o) => o.status === "pending");
  return {
    pending: pending.length > 0,
    paid: data.some((o) => o.status !== "pending" && o.status !== "cancelled"),
    cancelled: data.every((o) => o.status === "cancelled"),
    method: data[0]!.payment_method,
    expiresAt: pending[0]?.expires_at ?? null,
  };
}

/** 購入者の group を読み、支払い待ちなら決済会社に聞き直してから読み直す。購入者でなければ null。
    聞き直しは1人10分60回まで（超えたら聞かずに今の DB の状態を返す） */
export async function refreshGroupForBuyer(groupId: string, buyerId: string): Promise<GroupState | null> {
  const before = await readGroup(groupId, buyerId);
  if (!before || !before.pending || before.method === "mock") return before;
  const limit = await takeRateLimit([{ rule: RULES.paySyncUser, kind: "user", id: buyerId }], { failClosed: true });
  if (!limit.ok) return before;
  try {
    const r = await syncGroupPayment(groupId);
    if (r === "unpaid" || r === "not_found") return before;
  } catch (e) {
    console.error("[orders] 支払いを確かめられませんでした", groupId, e instanceof Error ? e.message : e);
    return before;
  }
  return readGroup(groupId, buyerId);
}

/** 支払い待ちの group の続きの URL（購入者だけ）。無ければ null */
export async function resumeUrlForBuyer(groupId: string, buyerId: string): Promise<string | null> {
  const state = await readGroup(groupId, buyerId);
  if (!state?.pending) return null;
  const { data } = await createServiceClient()
    .from("orders")
    .select("payment_ref")
    .eq("group_id", groupId)
    .not("payment_ref", "is", null)
    .limit(1)
    .maybeSingle();
  return resumeUrl(state.method, data?.payment_ref ?? null, groupId);
}
