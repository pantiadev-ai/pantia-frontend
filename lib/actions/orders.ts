"use server";
/* 注文を進める（出品者: 準備→発送・取り消し／購入者: 受け取り→レビュー）。
   本人か・今の状態で進めてよいかは DB の関数が確かめる（利用者の権限で呼ぶ）。ここはログイン・入力・回数を見る。
   出品者が取り消したら、その場で返金にかける。決済会社の不調で返せなければ cron（retry-refunds）がやり直す。 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { refundOrder } from "@/lib/adapters/payment";
import { actionViewer, ActionError, runAction, type ActionResult } from "@/lib/auth";
import { throwDb } from "@/lib/db-errors";
import { CARRIERS } from "@/lib/labels";
import { RULES, takeRateLimit } from "@/lib/rate-limit";
import { isUuid } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";

function checkedId(orderId: unknown): string {
  if (!isUuid(orderId)) throw new ActionError("注文が見つかりません。");
  return orderId;
}

function refresh(orderId: string) {
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/mypage/sales");
}

/** 出品者: 発送の準備に入る */
export async function prepareOrder(orderId: string): Promise<ActionResult> {
  return runAction(async () => {
    await actionViewer();
    const id = checkedId(orderId);
    const { error } = await (await createClient()).rpc("prepare_order", { p_order: id });
    throwDb(error);
    refresh(id);
    return { ok: true, message: "発送準備中にしました。" };
  });
}

const Ship = z.object({
  carrier: z.enum(CARRIERS.map((c) => c.value) as [string, ...string[]]),
  tracking: z
    .string()
    .transform((s) => s.normalize("NFKC").toUpperCase().replace(/\s+/g, ""))
    .pipe(z.string().regex(/^[0-9A-Z-]{4,30}$/)),
});

/** 出品者: 発送した（運送会社と追跡番号） */
export async function shipOrder(orderId: string, carrier: string, tracking: string): Promise<ActionResult> {
  return runAction(async () => {
    await actionViewer();
    const id = checkedId(orderId);
    const parsed = Ship.safeParse({ carrier, tracking });
    if (!parsed.success) throw new ActionError("運送会社と追跡番号を確かめてください（英数字とハイフン4〜30字）。");
    const { error } = await (await createClient()).rpc("ship_order", {
      p_order: id,
      p_carrier: parsed.data.carrier,
      p_tracking: parsed.data.tracking,
    });
    throwDb(error);
    refresh(id);
    return { ok: true, message: "発送済みにしました。購入者にお知らせしました。" };
  });
}

/** 購入者: 受け取った（取引完了。出品者の売上が残高に入る） */
export async function completeOrder(orderId: string): Promise<ActionResult> {
  return runAction(async () => {
    await actionViewer();
    const id = checkedId(orderId);
    const { error } = await (await createClient()).rpc("complete_order", { p_order: id });
    throwDb(error);
    refresh(id);
    return { ok: true, message: "受け取りを連絡しました。よろしければレビューをお願いします。" };
  });
}

/** 出品者: 発送の前に取り消す（全額を返金） */
export async function sellerCancelOrder(orderId: string, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    await actionViewer();
    const id = checkedId(orderId);
    const r = String(reason ?? "").trim();
    if (r.length < 1 || r.length > 200) throw new ActionError("取り消しの理由を200字以内で入力してください。");
    const { error } = await (await createClient()).rpc("seller_cancel_order", { p_order: id, p_reason: r });
    throwDb(error);
    const refund = await refundOrder(id);
    refresh(id);
    if (!refund.ok) {
      console.error("[orders] 取り消しのあとの返金に失敗（cron でやり直し）", id, refund.error);
      return { ok: true, message: "注文を取り消しました。返金の手続きは自動でやり直します。" };
    }
    return { ok: true, message: "注文を取り消し、購入者へ返金しました。" };
  });
}

/** 購入者: 取引完了のあとにレビューを書く */
export async function postReview(orderId: string, rating: number, body: string): Promise<ActionResult> {
  return runAction(async () => {
    const v = await actionViewer();
    const id = checkedId(orderId);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ActionError("評価を1〜5で選んでください。");
    const text = String(body ?? "").trim();
    if (text.length > 500) throw new ActionError("レビューは500字以内で書いてください。");
    const limit = await takeRateLimit([{ rule: RULES.commentUser, kind: "user", id: v.id }], { failClosed: true });
    if (!limit.ok) throw new ActionError(limit.message);
    const { error } = await (await createClient()).rpc("post_review", { p_order: id, p_rating: rating, p_body: text });
    throwDb(error);
    refresh(id);
    return { ok: true, message: "レビューを投稿しました。" };
  });
}
