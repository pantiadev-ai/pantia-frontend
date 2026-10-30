"use server";
/* 画像を1枚受け取って、作り直してから置く（28 §A8・§O7）。
   ・置いてよいかの確認（ログイン→状態→役割→本人確認→会話の当事者）を、置く前に全部ここでする
   ・置き場所は呼び手が決められない（出品・アイコン・つぶやき＝自分の id、チャット＝会話の id）
   ・置いた画像を「使う」のは別の操作（出品の保存・プロフィールの保存・送信）。DB の paths_ok が
     「自分の場所の画像か」をもう一度確かめる
   本人確認の書類はここを通さない（1回の送信でまとめて受け取る。lib/actions/kyc.ts） */
import { actionViewer, assertKyc, ActionError, runAction, type ActionResult } from "@/lib/auth";
import { ImageError, processImage, type ImageKind } from "@/lib/images";
import { RULES, takeRateLimit } from "@/lib/rate-limit";
import { isUuid } from "@/lib/search";
import { putImage, signedUrls } from "@/lib/storage-server";
import { publicImageUrl, type PublicBucket } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

export type UploadKind = "listing" | "avatar" | "cover" | "post" | "chat";

const TARGET: Record<UploadKind, { bucket: PublicBucket | "chat-images"; image: ImageKind }> = {
  listing: { bucket: "listing-images", image: "listing" },
  avatar: { bucket: "avatars", image: "avatar" },
  cover: { bucket: "avatars", image: "cover" },
  post: { bucket: "post-images", image: "post" },
  chat: { bucket: "chat-images", image: "chat" },
};

export async function uploadImage(form: FormData): Promise<ActionResult<{ path: string; url: string }>> {
  return runAction(async () => {
    const v = await actionViewer();
    const kind = String(form.get("kind") ?? "") as UploadKind;
    if (!(kind in TARGET)) throw new ActionError("画像の種類が違います。");

    let folder = v.id;
    if (kind === "listing" && v.role !== "seller") throw new ActionError("出品者のアカウントで使えます。");
    if (kind === "post") {
      if (v.role !== "seller") throw new ActionError("出品者のアカウントで使えます。");
      assertKyc(v);
    }
    if (kind === "chat") {
      assertKyc(v);
      const threadId = form.get("threadId");
      if (!isUuid(threadId)) throw new ActionError("会話が見つかりません。");
      // RLS で当事者の会話しか読めない。読めなければ置かせない
      const supabase = await createClient();
      const { data } = await supabase.from("threads").select("id").eq("id", threadId).maybeSingle();
      if (!data) throw new ActionError("会話が見つかりません。");
      folder = threadId;
    }

    const limit = await takeRateLimit([{ rule: RULES.uploadUser, kind: "user", id: v.id }], { failClosed: true });
    if (!limit.ok) throw new ActionError(limit.message);

    let data: Buffer;
    try {
      ({ data } = await processImage(form.get("file"), TARGET[kind].image));
    } catch (e) {
      if (e instanceof ImageError) throw new ActionError(e.message);
      throw e;
    }
    const { bucket } = TARGET[kind];
    const path = await putImage(bucket, folder, data);
    const url =
      bucket === "chat-images"
        ? ((await signedUrls("chat-images", [path]))[path] ?? "")
        : (publicImageUrl(bucket, path) ?? "");
    return { ok: true, data: { path, url } };
  });
}
