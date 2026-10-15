"use server";
/* お知らせ（/notifications）の既読・削除。利用者の権限で動かし、RLS（本人の行だけ）に任せる。
   update できる列は read_at だけ（GRANT）。念のため user_id でも絞る。 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionViewer, ActionError, runAction, type ActionResult } from "@/lib/auth";
import { throwDb } from "@/lib/db-errors";
import { RULES, takeRateLimit } from "@/lib/rate-limit";
import { isUuid } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";

const Ids = z.array(z.string().refine(isUuid)).min(1).max(50);

async function limitOrThrow(userId: string) {
  const limit = await takeRateLimit([{ rule: RULES.reactUser, kind: "user", id: userId }], { failClosed: true });
  if (!limit.ok) throw new ActionError(limit.message);
}

/** 画面に出した未読を既読にする（開いた画面の未読の印はその場に残すため、ここでは画面を読み直さない） */
export async function markRead(ids: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const v = await actionViewer();
    const parsed = Ids.safeParse(ids);
    if (!parsed.success) throw new ActionError("お知らせが見つかりません。");
    await limitOrThrow(v.id);
    const supabase = await createClient();
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", v.id)
      .in("id", parsed.data)
      .is("read_at", null);
    throwDb(error);
    return { ok: true };
  });
}

export async function markAllRead(): Promise<ActionResult> {
  return runAction(async () => {
    const v = await actionViewer();
    await limitOrThrow(v.id);
    const supabase = await createClient();
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", v.id)
      .is("read_at", null);
    throwDb(error);
    revalidatePath("/notifications");
    return { ok: true, message: "すべて既読にしました。" };
  });
}

export async function removeNotification(id: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const v = await actionViewer();
    if (!isUuid(id)) throw new ActionError("お知らせが見つかりません。");
    await limitOrThrow(v.id);
    const supabase = await createClient();
    const { error } = await supabase.from("notifications").delete().eq("user_id", v.id).eq("id", id);
    throwDb(error);
    revalidatePath("/notifications");
    return { ok: true };
  });
}
