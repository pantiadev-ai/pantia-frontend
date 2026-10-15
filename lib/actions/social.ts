"use server";
/* フォロー・お気に入り・いいね・ブロック・通報。
   どれも利用者の権限（RLS）で書く。相手が見えない（停止中・ブロック中・非公開）なら RLS が止める。
   連打は reactUser（通報は reportUser）で止める。数が数えられないときは止める側（failClosed）。 */
import { actionViewer, ActionError, runAction, type ActionResult } from "@/lib/auth";
import { dbCode, throwDb } from "@/lib/db-errors";
import { RULES, takeRateLimit } from "@/lib/rate-limit";
import type { LimitRule } from "@/lib/rate-limit-rules";
import { isUuid } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";

async function limit(rule: LimitRule, userId: string) {
  const d = await takeRateLimit([{ rule, kind: "user", id: userId }], { failClosed: true });
  if (!d.ok) throw new ActionError(d.message);
}

function mustUuid(id: unknown): string {
  if (!isUuid(id)) throw new ActionError("見つかりませんでした。");
  return id;
}

/** 重なり（すでに入っている）は成功と同じに扱う */
function ignoreDup(error: { code?: string; message?: string } | null, fallback: string) {
  if (error && error.code !== "23505") throwDb(error, fallback);
}

export async function setFollow(sellerId: string, on: boolean): Promise<ActionResult<{ on: boolean }>> {
  return runAction(async () => {
    const v = await actionViewer();
    const id = mustUuid(sellerId);
    if (id === v.id) throw new ActionError("自分はフォローできません。");
    await limit(RULES.reactUser, v.id);
    const supabase = await createClient();
    if (on) {
      const { error } = await supabase.from("follows").insert({ seller_id: id });
      ignoreDup(error, "フォローできませんでした。");
    } else {
      const { error } = await supabase.from("follows").delete().eq("follower_id", v.id).eq("seller_id", id);
      throwDb(error);
    }
    return { ok: true, data: { on } };
  });
}

export async function setFavorite(listingId: string, on: boolean): Promise<ActionResult<{ on: boolean }>> {
  return runAction(async () => {
    const v = await actionViewer();
    const id = mustUuid(listingId);
    await limit(RULES.reactUser, v.id);
    const supabase = await createClient();
    if (on) {
      const { error } = await supabase.from("favorites").insert({ listing_id: id });
      ignoreDup(error, "お気に入りに入れられませんでした。");
    } else {
      const { error } = await supabase.from("favorites").delete().eq("user_id", v.id).eq("listing_id", id);
      throwDb(error);
    }
    return { ok: true, data: { on } };
  });
}

export async function setPostLike(postId: string, on: boolean): Promise<ActionResult<{ on: boolean }>> {
  return runAction(async () => {
    const v = await actionViewer();
    const id = mustUuid(postId);
    await limit(RULES.reactUser, v.id);
    const supabase = await createClient();
    if (on) {
      const { error } = await supabase.from("post_likes").insert({ post_id: id });
      ignoreDup(error, "いいねできませんでした。");
    } else {
      const { error } = await supabase.from("post_likes").delete().eq("user_id", v.id).eq("post_id", id);
      throwDb(error);
    }
    return { ok: true, data: { on } };
  });
}

/** ブロックすると、お互いのフォローが外れ、つぶやき・出品・メッセージが見えなくなる（DB 側） */
export async function setBlock(userId: string, on: boolean): Promise<ActionResult<{ on: boolean }>> {
  return runAction(async () => {
    const v = await actionViewer();
    const id = mustUuid(userId);
    if (id === v.id) throw new ActionError("自分はブロックできません。");
    await limit(RULES.reactUser, v.id);
    const supabase = await createClient();
    if (on) {
      const { error } = await supabase.from("blocks").insert({ blocked_id: id });
      ignoreDup(error, "ブロックできませんでした。");
    } else {
      const { error } = await supabase.from("blocks").delete().eq("blocker_id", v.id).eq("blocked_id", id);
      throwDb(error);
    }
    return {
      ok: true,
      data: { on },
      message: on ? "ブロックしました。お互いの投稿・出品・メッセージが見えなくなります。" : "ブロックを解除しました。",
    };
  });
}

const REPORT_TYPES = ["user", "listing", "post", "comment", "message"] as const;
const REPORT_REASONS = ["spam", "inappropriate", "impersonation", "fraud", "underage", "harassment", "image", "other"] as const;

export async function fileReport(input: {
  type: string;
  targetId: string;
  reason: string;
  detail: string;
}): Promise<ActionResult<{ reportNo: number }>> {
  return runAction(async () => {
    const v = await actionViewer();
    const type = REPORT_TYPES.find((t) => t === input?.type);
    const reason = REPORT_REASONS.find((r) => r === input?.reason);
    const detail = typeof input?.detail === "string" ? input.detail.trim() : "";
    if (!type || !reason) throw new ActionError("通報の理由を選んでください。");
    if (detail.length > 500) throw new ActionError("詳しい内容は500字までです。");
    if (reason === "other" && detail === "") throw new ActionError("「その他」のときは、詳しい内容を書いてください。");
    const id = mustUuid(input.targetId);
    await limit(RULES.reportUser, v.id);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("file_report", {
      p_type: type,
      p_target: id,
      p_reason: reason,
      p_detail: detail,
    });
    // 開いている間に消えた・非公開になった物（DB の unavailable は購入の文なので、通報の文に替える）
    if (dbCode(error) === "unavailable") throw new ActionError("通報する物が見つかりませんでした。消されたか、非公開になった可能性があります。");
    throwDb(error, "通報できませんでした。");
    return {
      ok: true,
      data: { reportNo: Number(data) },
      message: "通報を受け付けました。運営が確認します。ご協力ありがとうございます。",
    };
  });
}
