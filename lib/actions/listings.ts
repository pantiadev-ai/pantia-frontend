"use server";
/* 出品の保存と、状態（公開・非公開・削除）の切り替え。
   書き込みは利用者の権限で行い、DB の RLS と listings_guard（状態の決まり・本人確認）でも止める。
   公開（published）にできるのは本人確認が済んだ出品者だけ（ここと DB の両方で確かめる）。 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionViewer, assertKyc, ActionError, runAction, type ActionResult, type Viewer } from "@/lib/auth";
import { throwDb } from "@/lib/db-errors";
import { INCOMPLETE, ListingSchema, isComplete, listingRow, listingRowError, type ParsedListing } from "@/lib/listing-input";
import { RULES, takeRateLimit } from "@/lib/rate-limit";
import { isUuid } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";

/* 入力の確かめ方と DB に渡す列は lib/listing-input.ts（キャラの出品と同じ物を使う） */
export type ListingInput = ParsedListing;

/** draft: 下書きで保存 / publish: 出品する（公開） / keep: 今の状態のまま内容だけ保存（編集のとき） */
const IntentSchema = z.enum(["draft", "publish", "keep"]);
export type ListingIntent = z.infer<typeof IntentSchema>;

function refreshPaths(id: string) {
  revalidatePath("/mypage");
  revalidatePath("/mypage/items");
  revalidatePath(`/items/${id}`);
  revalidatePath(`/listings/${id}/edit`);
}

async function sellerOnly(): Promise<Viewer> {
  const v = await actionViewer();
  if (v.role !== "seller") throw new ActionError("出品は出品者のアカウントで行えます。");
  return v;
}

/** 出品を保存する。listingId が null なら新しく作る（insert）、あれば自分の出品を書き換える（update） */
export async function saveListing(
  listingId: string | null,
  input: ListingInput,
  intent: ListingIntent,
): Promise<ActionResult<{ id: string; status: "draft" | "published" | "private" }>> {
  return runAction(async () => {
    const v = await sellerOnly();
    if (listingId !== null && !isUuid(listingId)) throw new ActionError("出品が見つかりません。");
    const parsedIntent = IntentSchema.safeParse(intent);
    const parsed = ListingSchema.safeParse(input);
    if (!parsed.success || !parsedIntent.success) throw new ActionError("入力の内容を確かめてください。");
    const d = parsed.data;
    const how = parsedIntent.data;

    // 写真は本人のフォルダの物だけ・延長の日数・有料オプション
    const inputError = listingRowError(d, v.id);
    if (inputError) throw new ActionError(inputError);

    const limit = await takeRateLimit([{ rule: RULES.listingUser, kind: "user", id: v.id }], { failClosed: true });
    if (!limit.ok) throw new ActionError(limit.message);

    const supabase = await createClient();

    let current: { id: string; status: string } | null = null;
    if (listingId) {
      const { data, error } = await supabase
        .from("listings")
        .select("id, status")
        .eq("id", listingId)
        .eq("seller_id", v.id)
        .maybeSingle();
      throwDb(error);
      if (!data || data.status === "deleted") throw new ActionError("出品が見つかりません。");
      if (data.status === "hidden") throw new ActionError("運営により非公開になっている出品は編集できません。");
      if (data.status === "sold") throw new ActionError("売り切れの出品は編集できません。");
      current = data;
    }

    let status: "draft" | "published" | "private";
    if (how === "publish") {
      status = "published";
    } else if (how === "draft") {
      if (current && current.status !== "draft") throw new ActionError("一度出品した商品は、下書きに戻せません。");
      status = "draft";
    } else {
      if (!current) throw new ActionError("入力の内容を確かめてください。");
      status = current.status as "draft" | "published" | "private";
    }

    if (status === "published" && current?.status !== "published") assertKyc(v);
    if (status !== "draft" && !isComplete(d)) throw new ActionError(INCOMPLETE);

    // 列を1つずつ選んで渡す（受け取った object をそのまま DB に渡さない）
    const row = listingRow(d);

    let id: string;
    if (current) {
      const patch = how === "keep" ? row : { ...row, status };
      const { error } = await supabase.from("listings").update(patch).eq("id", current.id).eq("seller_id", v.id);
      throwDb(error, "保存できませんでした。入力の内容を確かめてください。");
      id = current.id;
    } else {
      const { data, error } = await supabase
        .from("listings")
        .insert({ ...row, status })
        .select("id")
        .single();
      throwDb(error, "保存できませんでした。入力の内容を確かめてください。");
      if (!data) throw new ActionError("保存できませんでした。");
      id = data.id;
    }

    refreshPaths(id);
    revalidatePath("/items");
    const message =
      how === "keep" ? "保存しました。" : status === "published" ? "出品しました。" : "下書きに保存しました。";
    return { ok: true, data: { id, status }, message };
  });
}

/** 自分の出品の状態を変える（公開・非公開・削除）。削除は status を deleted にする（取引の記録は注文の側に残る） */
export async function setListingStatus(
  listingId: string,
  next: "published" | "private" | "deleted",
): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const v = await sellerOnly();
    if (!isUuid(listingId)) throw new ActionError("出品が見つかりません。");
    const parsed = z.enum(["published", "private", "deleted"]).safeParse(next);
    if (!parsed.success) throw new ActionError("入力の内容を確かめてください。");
    const to = parsed.data;
    if (to === "published") assertKyc(v);

    const limit = await takeRateLimit([{ rule: RULES.listingStatusUser, kind: "user", id: v.id }], { failClosed: true });
    if (!limit.ok) throw new ActionError(limit.message);

    const supabase = await createClient();
    const { data: cur, error: readError } = await supabase
      .from("listings")
      .select("id, status, title, description, category, worn_days, price, image_paths")
      .eq("id", listingId)
      .eq("seller_id", v.id)
      .maybeSingle();
    throwDb(readError);
    if (!cur || cur.status === "deleted") throw new ActionError("出品が見つかりません。");
    if (cur.status === "hidden") throw new ActionError("運営により非公開になっている出品は変更できません。");
    if (cur.status === to) return { ok: true, data: { status: to } };

    if (to === "published") {
      if (cur.status !== "draft" && cur.status !== "private") throw new ActionError("今の状態では公開できません。");
      if (!isComplete(cur)) throw new ActionError(`${INCOMPLETE}編集の画面から入れてください。`);
    }
    if (to === "private" && cur.status !== "published") throw new ActionError("公開中の出品だけ非公開にできます。");

    // 削除は DB の関数で（本人にも deleted の行は見えないので、RLS 越しの update では通らない。支払い待ちの注文がある商品も断る）
    const { error } =
      to === "deleted"
        ? await supabase.rpc("delete_my_listing", { p_listing: cur.id })
        : await supabase.from("listings").update({ status: to }).eq("id", cur.id).eq("seller_id", v.id);
    throwDb(error, "変更できませんでした。時間をおいて、もう一度お試しください。");

    refreshPaths(cur.id);
    revalidatePath("/items");
    const message = to === "published" ? "公開しました。" : to === "private" ? "非公開にしました。" : "削除しました。";
    return { ok: true, data: { status: to }, message };
  });
}
