"use server";
/* カート。中身は利用者の権限（RLS）で書く。オプションの組み合わせは DB の見積もり（quote_listing）で先に確かめる。
   値段はここでは持たない。買うときに create_checkout がその時の値段で計算し直す。 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionViewer, ActionError, runAction, type ActionResult } from "@/lib/auth";
import { throwDb } from "@/lib/db-errors";
import { RULES, takeRateLimit } from "@/lib/rate-limit";
import { isUuid } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";

const Options = z
  .object({
    worn_days: z.number().int().min(1).max(30).optional(),
    photo: z.boolean().optional(),
    letter: z.boolean().optional(),
    anonymous: z.boolean().optional(),
    video: z.boolean().optional(),
  })
  .strict();

export type CartOptions = z.infer<typeof Options>;

async function checkedOptions(listingId: unknown, options: unknown) {
  if (!isUuid(listingId)) throw new ActionError("商品が見つかりません。");
  const parsed = Options.safeParse(options ?? {});
  if (!parsed.success) throw new ActionError("選んだオプションの組み合わせは使えません。");
  const supabase = await createClient();
  // 見えない出品・使えないオプションはここで止まる（pantia:unavailable / bad_options）
  const { error } = await supabase.rpc("quote_listing", { p_listing: listingId, p_opts: parsed.data });
  throwDb(error);
  return { supabase, id: listingId, options: parsed.data };
}

async function limitCart(userId: string) {
  const limit = await takeRateLimit([{ rule: RULES.cartUser, kind: "user", id: userId }], { failClosed: true });
  if (!limit.ok) throw new ActionError(limit.message);
}

/** カートに入れる（すでに入っていればオプションを置き換える） */
export async function addToCart(listingId: string, options: CartOptions): Promise<ActionResult> {
  return runAction(async () => {
    const v = await actionViewer();
    if (v.role !== "buyer") throw new ActionError("購入は購入者のアカウントで行えます。");
    await limitCart(v.id);
    const { supabase, id, options: opts } = await checkedOptions(listingId, options);
    const { error } = await supabase.from("cart_items").insert({ listing_id: id, options: opts });
    if (error?.code === "23505") {
      const { error: e2 } = await supabase.from("cart_items").update({ options: opts }).eq("user_id", v.id).eq("listing_id", id);
      throwDb(e2);
    } else {
      throwDb(error, "カートに入れられませんでした。");
    }
    revalidatePath("/cart");
    return { ok: true, message: "カートに入れました。" };
  });
}

export async function updateCartOptions(listingId: string, options: CartOptions): Promise<ActionResult> {
  return runAction(async () => {
    const v = await actionViewer();
    await limitCart(v.id);
    const { supabase, id, options: opts } = await checkedOptions(listingId, options);
    const { error } = await supabase.from("cart_items").update({ options: opts }).eq("user_id", v.id).eq("listing_id", id);
    throwDb(error);
    revalidatePath("/cart");
    return { ok: true };
  });
}

export async function removeFromCart(listingId: string): Promise<ActionResult> {
  return runAction(async () => {
    const v = await actionViewer();
    if (!isUuid(listingId)) throw new ActionError("商品が見つかりません。");
    const supabase = await createClient();
    const { error } = await supabase.from("cart_items").delete().eq("user_id", v.id).eq("listing_id", listingId);
    throwDb(error);
    revalidatePath("/cart");
    return { ok: true };
  });
}
