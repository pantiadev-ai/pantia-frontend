"use server";
/* プロフィールの保存。列は1つずつ選んで update する（受け取った object をそのまま渡さない）。
   画像の置き場所は本人の id で始まる物だけ受け付ける（DB の CHECK でも止まる）。
   出品者だけの項目（カバー・年齢・職業・身長・体型・発送目安・対応オプション・NG・メッセージの受け付け）は、
   購入者からは受け取っても書かない。 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionViewer, ActionError, runAction, type ActionResult } from "@/lib/auth";
import { throwDb } from "@/lib/db-errors";
import { RULES, takeRateLimit } from "@/lib/rate-limit";
import { removeImages } from "@/lib/storage-server";
import { createClient } from "@/lib/supabase/server";

/** プロフィールの保存の連打を止める（共通の表に無いので、ここで持つ） */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const IMAGE_PATH = new RegExp(`^${UUID}/${UUID}\\.webp$`);

function hasCtrl(s: string): boolean {
  for (const ch of s) {
    const n = ch.codePointAt(0) ?? 0;
    if (n < 0x20 || (n >= 0x7f && n <= 0x9f)) return true;
  }
  return false;
}

/* DB の CHECK（supabase/migrations/20261015000002_core.sql の profiles）を写したもの */
const ProfileSchema = z
  .object({
    nickname: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .refine((s) => !hasCtrl(s)),
    bio: z.string().trim().max(1000),
    avatar_path: z.string().regex(IMAGE_PATH).nullable(),
    // ここから下は出品者だけ
    cover_path: z.string().regex(IMAGE_PATH).nullable().optional(),
    age: z.number().int().min(18).max(99).nullable().optional(),
    occupation: z
      .string()
      .trim()
      .max(20)
      .refine((s) => !hasCtrl(s))
      .nullable()
      .optional(),
    height_cm: z.number().int().min(120).max(200).nullable().optional(),
    body_type: z.enum(["slim", "normal", "glamour", "chubby"]).nullable().optional(),
    ship_estimate: z.enum(["same_next", "d1_2", "d2_3", "d3_5"]).nullable().optional(),
    supported_options: z
      .array(z.enum(["photo", "days", "same_day", "anonymous", "letter", "request", "bundle"]))
      .max(7)
      .optional(),
    ng_note: z.string().trim().max(200).optional(),
    accept_messages: z.boolean().optional(),
  })
  .strict();

export type ProfileInput = z.infer<typeof ProfileSchema>;

export async function updateProfile(input: ProfileInput): Promise<ActionResult> {
  return runAction(async () => {
    const v = await actionViewer();
    const parsed = ProfileSchema.safeParse(input);
    if (!parsed.success) throw new ActionError("入力の内容を確かめてください。");
    const d = parsed.data;

    // 画像は本人が上げた物だけ
    const own = (p: string | null | undefined) => p == null || p.startsWith(`${v.id}/`);
    if (!own(d.avatar_path) || !own(d.cover_path)) throw new ActionError("画像をもう一度選び直してください。");

    const limit = await takeRateLimit([{ rule: RULES.profileUser, kind: "user", id: v.id }], { failClosed: true });
    if (!limit.ok) throw new ActionError(limit.message);

    const supabase = await createClient();
    // 替える前の画像（保存のあとで、使わなくなった物を置き場から消す）
    const { data: before } = await supabase.from("profiles").select("avatar_path, cover_path").eq("id", v.id).maybeSingle();
    const { error } =
      v.role === "seller"
        ? await supabase
            .from("profiles")
            .update({
              nickname: d.nickname,
              bio: d.bio,
              avatar_path: d.avatar_path,
              cover_path: d.cover_path ?? null,
              age: d.age ?? null,
              occupation: d.occupation ? d.occupation : null,
              height_cm: d.height_cm ?? null,
              body_type: d.body_type ?? null,
              ship_estimate: d.ship_estimate ?? null,
              supported_options: Array.from(new Set(d.supported_options ?? [])),
              ng_note: d.ng_note ?? "",
              accept_messages: d.accept_messages ?? true,
            })
            .eq("id", v.id)
        : await supabase
            .from("profiles")
            .update({ nickname: d.nickname, bio: d.bio, avatar_path: d.avatar_path })
            .eq("id", v.id);
    throwDb(error, "保存できませんでした。入力の内容を確かめてください。");

    const unused = [
      before?.avatar_path !== d.avatar_path ? before?.avatar_path : null,
      v.role === "seller" && before?.cover_path !== (d.cover_path ?? null) ? before?.cover_path : null,
    ].filter((p): p is string => !!p && own(p));
    if (unused.length) {
      // 消せなくても保存は済んでいるので、記録だけ残す（残った物は容量の問題だけ）
      const r = await removeImages("avatars", unused);
      if (r.error) console.error("[profile] old image", r.error);
    }

    revalidatePath("/mypage", "layout");
    if (v.role === "seller") revalidatePath(`/sellers/${v.id}`);
    return { ok: true, message: "プロフィールを保存しました。" };
  });
}
