"use server";
/* 購入の手続き。
   ・値段とオプションは画面から受け取らない。カートの中身（RLS で本人の分だけ）を読み、create_checkout がその時の値段で計算する。
   ・注文は service_role で作る（create_checkout は service_role だけ）。その前に、ログイン・購入者・本人確認・回数を確かめる。
   ・決済会社の画面へは、画面が URL を受け取って移る（外へのリダイレクトを server action で返さない。CSP の form-action に触れない）。
   ・決済会社の準備に失敗したら、作った支払い待ちをその場で取り消す（1点物を押さえたままにしない）。 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  availableMethods,
  cancelProviderPayment,
  mockAllowed,
  settleGroup,
  startPayment,
  syncGroupPayment,
} from "@/lib/adapters/payment";
import { actionViewer, ActionError, assertKyc, runAction, type ActionResult } from "@/lib/auth";
import { dbCode, throwDb } from "@/lib/db-errors";
import { expireStaleOrders } from "@/lib/order-sweep";
import { RULES, takeRateLimit } from "@/lib/rate-limit";
import { isUuid } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/database.types";

const Address = z
  .object({
    name: z.string().trim().min(1).max(30),
    postal: z
      .string()
      .trim()
      .regex(/^\d{3}-?\d{4}$/)
      .transform((s) => (s.includes("-") ? s : `${s.slice(0, 3)}-${s.slice(3)}`)),
    prefecture: z.string().trim().min(2).max(4),
    address1: z.string().trim().min(1).max(100),
    address2: z.string().trim().max(100).default(""),
    phone: z
      .string()
      .transform((s) => s.replace(/[^0-9]/g, ""))
      .pipe(z.string().regex(/^0\d{9,10}$/)),
  })
  .strict();

const PlaceInput = z
  .object({
    listingIds: z.array(z.string().refine(isUuid)).min(1).max(10),
    method: z.enum(["card", "bank", "paypay", "mock"]),
    address: Address,
    saveAddress: z.boolean().optional(),
  })
  .strict();

export type PlaceOrderInput = z.input<typeof PlaceInput>;

/** 注文を作って、決済会社の画面（テスト決済なら /checkout/mock）の URL を返す */
export async function placeOrder(input: PlaceOrderInput): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    const v = await actionViewer();
    if (v.role !== "buyer") throw new ActionError("購入は購入者のアカウントで行えます。");
    assertKyc(v);
    const parsed = PlaceInput.safeParse(input);
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      throw new ActionError(field === "address" ? "お届け先を確かめてください。" : "カートの中身と支払い方法を確かめてください。");
    }
    const { listingIds, method, address, saveAddress } = parsed.data;
    if (!availableMethods().includes(method)) throw new ActionError("この支払い方法は、いまは使えません。");
    const limit = await takeRateLimit([{ rule: RULES.checkoutUser, kind: "user", id: v.id }], { failClosed: true });
    if (!limit.ok) throw new ActionError(limit.message);

    const supabase = await createClient();
    const ids = [...new Set(listingIds)];
    const { data: cart, error: cartErr } = await supabase
      .from("cart_items")
      .select("listing_id, options")
      .eq("user_id", v.id)
      .in("listing_id", ids);
    throwDb(cartErr);
    if (!cart || cart.length !== ids.length) throw new ActionError("カートの中身が変わりました。カートを確かめてください。");
    const items: Json = ids.map((id) => ({ listing_id: id, options: cart.find((c) => c.listing_id === id)?.options ?? {} }));

    const service = createServiceClient();
    const create = () => service.rpc("create_checkout", { p_buyer: v.id, p_items: items, p_method: method, p_address: address });
    let { data, error } = await create();
    const code = dbCode(error);
    if (code === "reserved" || code === "too_many_pending") {
      // 期限の切れた支払い待ちが残っているだけのことがある（cron は1日1回）。片付けてから1回だけやり直す
      await expireStaleOrders().catch((e: unknown) => console.error("[checkout] 期限切れの片付けに失敗", e instanceof Error ? e.message : e));
      ({ data, error } = await create());
    }
    throwDb(error, "注文を作れませんでした。時間をおいて、もう一度お試しください。");
    const created = data as { group_id?: unknown; total?: unknown } | null;
    if (!created || !isUuid(created.group_id) || typeof created.total !== "number") {
      throw new ActionError("注文を作れませんでした。時間をおいて、もう一度お試しください。");
    }
    const groupId = created.group_id;

    if (saveAddress) {
      const { error: saveErr } = await supabase.from("saved_addresses").upsert(address, { onConflict: "user_id" });
      // 住所の保存に失敗しても、購入は止めない
      if (saveErr) console.error("[checkout] お届け先を保存できませんでした", saveErr.code, saveErr.message);
    }

    const started = await startPayment({ groupId, total: created.total, method, buyerId: v.id, buyerEmail: v.email });
    if (!started.ok) {
      await releaseGroup(groupId);
      throw new ActionError(started.error);
    }
    const { error: refErr } = await service.rpc("attach_payment_ref", { p_group: groupId, p_ref: started.ref });
    if (refErr) {
      // 決済会社の番号を結べないと、戻ってきたときに入金を確かめられない。決済会社の側も止めて、やり直してもらう
      console.error("[checkout] 決済の番号を結べませんでした", groupId, refErr.message);
      await cancelProviderPayment(method, started.ref, groupId);
      await releaseGroup(groupId);
      throw new ActionError("お支払いの準備ができませんでした。時間をおいて、もう一度お試しください。");
    }
    revalidatePath("/cart");
    revalidatePath("/orders");
    return { ok: true, data: { url: started.redirectUrl } };
  });
}

async function releaseGroup(groupId: string): Promise<void> {
  const { error } = await (await createClient()).rpc("cancel_my_pending_group", { p_group: groupId });
  if (error) console.error("[checkout] 支払い待ちを取り消せませんでした（期限切れで消えます）", groupId, error.message);
}

/** 支払い待ちの注文を、購入者が自分で取り消す（決済をやめた・PayPay の QR を閉じた・別の方法で買い直す） */
export async function cancelPendingGroup(groupId: string): Promise<ActionResult> {
  return runAction(async () => {
    const v = await actionViewer();
    if (!isUuid(groupId)) throw new ActionError("注文が見つかりません。");
    const supabase = await createClient();
    // 本人の注文か（RLS で購入者・出品者の分しか見えない。さらに購入者に絞る）
    const { data: mine, error } = await supabase
      .from("orders")
      .select("id, status, payment_method")
      .eq("group_id", groupId)
      .eq("buyer_id", v.id);
    throwDb(error);
    if (!mine || mine.length === 0) throw new ActionError("注文が見つかりません。");
    if (!mine.some((o) => o.status === "pending")) throw new ActionError("この注文は、もう取り消せません。画面を読み込み直してください。");

    // 決済会社の番号は利用者からは読めない（列の権限）。本人の確認が済んだので service_role で読む
    const { data: refRow } = await createServiceClient()
      .from("orders")
      .select("payment_ref")
      .eq("group_id", groupId)
      .not("payment_ref", "is", null)
      .limit(1)
      .maybeSingle();
    const outcome = await cancelProviderPayment(mine[0]!.payment_method, refRow?.payment_ref ?? null, groupId);
    if (outcome === "paid") {
      await syncGroupPayment(groupId);
      revalidatePath("/orders");
      return { ok: true, message: "お支払いは完了していました。注文の内容を確かめてください。" };
    }
    if (outcome === "error") throw new ActionError("決済会社の手続きを止められませんでした。時間をおいて、もう一度お試しください。");

    const { error: cancelErr } = await supabase.rpc("cancel_my_pending_group", { p_group: groupId });
    throwDb(cancelErr);
    revalidatePath("/orders");
    return { ok: true, message: "注文を取り消しました。" };
  });
}

/** テスト決済（PAYMENT_MODE=mock・本番以外だけ）。決済会社の代わりに「払われた」と DB に書く */
export async function mockPay(groupId: string): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    if (!mockAllowed()) throw new ActionError("テスト決済は使えません。");
    const v = await actionViewer();
    if (!isUuid(groupId)) throw new ActionError("注文が見つかりません。");
    const { data: rows, error } = await (await createClient())
      .from("orders")
      .select("total, status, payment_method")
      .eq("group_id", groupId)
      .eq("buyer_id", v.id);
    throwDb(error);
    if (!rows || rows.length === 0) throw new ActionError("注文が見つかりません。");
    if (rows.some((o) => o.payment_method !== "mock")) throw new ActionError("この注文はテスト決済ではありません。");
    if (!rows.some((o) => o.status === "pending")) throw new ActionError("この注文は、もう支払い待ちではありません。");
    const total = rows.reduce((s, o) => s + o.total, 0);
    const result = await settleGroup(groupId, `mock:${groupId}`, total);
    if (result === "amount_mismatch" || result === "not_found") throw new ActionError("テスト決済に失敗しました。");
    revalidatePath("/orders");
    revalidatePath("/cart");
    return { ok: true, data: { url: `/orders?group=${groupId}` } };
  });
}
