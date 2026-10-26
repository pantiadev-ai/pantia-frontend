/* 本人確認の提出の共通部分（本人が出す lib/actions/kyc.ts と、運営が代わりに出す lib/actions/proxy.ts）。
   入力の形・写真の形と大きさを確かめ、写真を作り直して「本人の id/」の下に置き、申請を作る。
   途中で失敗したら置いた写真を消す。18歳未満で却下されたら、写真をすぐ消す。 */
import "server-only";
import { ActionError } from "@/lib/auth";
import type { Json } from "@/lib/database.types";
import { ImageError, processImage } from "@/lib/images";
import { putImage, removeImages } from "@/lib/storage-server";
import { createServiceClient } from "@/lib/supabase/service";
import { KYC_FILE_MAX } from "@/components/account/options";

const IMAGE_TYPES = /^image\/(jpeg|png|webp)$/;

/** 「YYYY-MM-DD」が本当にある日か（2月30日などを断る） */
function realDate(s: string): boolean {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** 日本時間の今日（YYYY-MM-DD） */
function todayJst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 生年月日として使えるか（本当にある日・今日まで・1900年から） */
export function birthDateOk(s: string): boolean {
  return realDate(s) && s <= todayJst() && s >= "1900-01-01";
}

/** formData の1枚を取り出す。無ければ null。形が違えば ActionError */
function pickFile(form: FormData, key: string): File | null {
  const f = form.get(key);
  if (f === null) return null;
  if (!(f instanceof File) || f.size === 0) return null;
  if (!IMAGE_TYPES.test(f.type)) throw new ActionError("写真は JPEG・PNG・WebP で送ってください。");
  if (f.size > KYC_FILE_MAX) throw new ActionError("写真が大きすぎます（1枚 4MB まで）。");
  return f;
}

/** 書類を目で見る受け方（manual）の写真を取り出す。表と「本人と書類を一緒に写した写真」は必須、裏は運転免許証だけ */
export function manualKycFiles(form: FormData, docType: string): File[] {
  const front = pickFile(form, "front");
  const back = pickFile(form, "back");
  const selfie = pickFile(form, "selfie");
  if (!front) throw new ActionError("書類の表の写真を選んでください。");
  if (!selfie) throw new ActionError("本人と書類を一緒に写した写真を選んでください。");
  if (back && docType !== "license") {
    throw new ActionError("裏の写真は運転免許証のときだけ送れます。マイナンバーカードの裏は撮らないでください。");
  }
  return back ? [front, back, selfie] : [front, selfie];
}

/** 写真の無い提出（trustdock）に写真が付いていないか */
export function hasKycFiles(form: FormData): boolean {
  return !!(form.get("front") || form.get("back") || form.get("selfie"));
}

function jsonObject(v: Json | null): Record<string, Json | undefined> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, Json | undefined>) : {};
}

function stringList(v: Json | undefined): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** 写真を作り直して置き、submit(置いた場所) で申請を作る（submit はエラーなら投げること）。
    18歳未満で却下されたら写真をすぐ消して underage: true を返す（呼び手が画面の文を出す） */
export async function submitWithDocuments(
  userId: string,
  files: File[],
  submit: (paths: string[]) => Promise<Json | null>,
): Promise<{ appId: string | null; underage: boolean }> {
  const uploaded: string[] = [];
  let result: Record<string, Json | undefined>;
  try {
    for (const f of files) {
      const { data } = await processImage(f, "kyc");
      uploaded.push(await putImage("kyc-documents", userId, data));
    }
    result = jsonObject(await submit(uploaded));
  } catch (e) {
    if (uploaded.length > 0) {
      const removed = await removeImages("kyc-documents", uploaded);
      if (removed.error) console.error("[kyc] 置いた写真を消せませんでした", removed.error);
    }
    if (e instanceof ImageError) throw new ActionError(e.message);
    throw e;
  }

  const appId = typeof result.app_id === "string" ? result.app_id : null;
  if (result.status !== "rejected_underage") return { appId, underage: false };

  // 18歳未満: DB が申請を却下・利用停止にした。写真はすぐ消す
  const removed = await removeImages("kyc-documents", stringList(result.purge_paths));
  if (removed.error) {
    console.error("[kyc] 18歳未満の申請の写真を消せませんでした（cron の掃除でやり直す）", removed.error);
  } else if (appId) {
    const { error } = await createServiceClient().rpc("kyc_mark_purged", { p_app: appId });
    if (error) console.error("[kyc] 消した記録を書けませんでした", error.code);
  }
  return { appId, underage: true };
}
