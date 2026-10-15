"use server";
/* 本人確認（18歳以上の確認）の提出（/kyc）。
   順番（どれかで止まったら、それより後には進まない）:
     ① ログイン・有効（actionViewer）
     ② 今の状態で出せるか（未提出／却下で再提出できる）
     ③ 回数の上限（kycUser。数えられなければ止める）
     ④ 入力の形（zod）
     ⑤ 写真の形と大きさ（JPEG・PNG・WebP、1枚 4MB まで）
     ⑥ 写真を作り直して非公開の箱に置く（service role。ここだけ）
     ⑦ service role で submit_kyc（DB でも状態・形・年齢を確かめ直す）
   途中で失敗したら、置いた写真を消す。書類の写真は本人の画面にも出さない（運営者だけが期限つき URL で見る）。 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionViewer, ActionError, runAction, type ActionResult } from "@/lib/auth";
import { assertKycReady, KycNotReadyError, startVerification, type KycProvider } from "@/lib/adapters/kyc";
import { throwDb } from "@/lib/db-errors";
import { ImageError, processImage } from "@/lib/images";
import { RULES, takeRateLimit } from "@/lib/rate-limit";
import { putImage, removeImages } from "@/lib/storage-server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/database.types";
import { KYC_FILE_MAX } from "@/components/account/options";

const Input = z.object({
  docType: z.enum(["license", "mynumber", "passport"]),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  agree: z.literal("1"),
});

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

/** formData の1枚を取り出す。無ければ null。形が違えば ActionError */
function pickFile(form: FormData, key: string): File | null {
  const f = form.get(key);
  if (f === null) return null;
  if (!(f instanceof File) || f.size === 0) return null;
  if (!IMAGE_TYPES.test(f.type)) throw new ActionError("写真は JPEG・PNG・WebP で送ってください。");
  if (f.size > KYC_FILE_MAX) throw new ActionError("写真が大きすぎます（1枚 4MB まで）。");
  return f;
}

function jsonObject(v: Json | null): Record<string, Json | undefined> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, Json | undefined>) : {};
}

function stringList(v: Json | undefined): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export async function submitKyc(form: FormData): Promise<ActionResult<{ nextUrl: string | null }>> {
  return runAction(async () => {
    // ① ログイン・有効
    const v = await actionViewer();

    // ② 今の状態で出せるか（DB の submit_kyc でも同じ確認をする）
    if (v.kycStatus === "approved") throw new ActionError("本人確認は済んでいます。");
    if (v.kycStatus === "pending") throw new ActionError("本人確認の審査中です。結果をお待ちください。");
    if (v.kycStatus === "rejected") {
      const supabase = await createClient();
      const { data: last, error } = await supabase
        .from("kyc_applications")
        .select("status, resubmit_allowed")
        .eq("user_id", v.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      throwDb(error);
      if (last && last.status === "rejected" && !last.resubmit_allowed) {
        throw new ActionError("本人確認の再提出はできません。お問い合わせください。");
      }
    }

    // ③ 回数の上限
    const limit = await takeRateLimit([{ rule: RULES.kycUser, kind: "user", id: v.id }], { failClosed: true });
    if (!limit.ok) throw new ActionError(limit.message);

    // ④ 入力の形
    const parsed = Input.safeParse({ docType: form.get("docType"), birthDate: form.get("birthDate"), agree: form.get("agree") });
    if (!parsed.success) throw new ActionError("書類の種類・生年月日・同意を確かめてください。");
    const { docType, birthDate } = parsed.data;
    if (!realDate(birthDate) || birthDate > todayJst() || birthDate < "1900-01-01") {
      throw new ActionError("生年月日を確かめてください。");
    }

    // 受け方（manual・trustdock）。trustdock なのに準備ができていなければ、写真を置く前に止める
    let provider: KycProvider;
    try {
      provider = assertKycReady();
    } catch (e) {
      if (e instanceof KycNotReadyError) {
        console.error("[kyc] 受付を止めています:", e.message);
        throw new ActionError("ただいま本人確認の受付を止めています。しばらくしてからお試しください。");
      }
      throw e;
    }

    // ⑤ 写真の形と大きさ（trustdock では写真を受け取らない。書類は TRUSTDOCK の画面で撮る）
    const files: File[] = [];
    if (provider === "manual") {
      const front = pickFile(form, "front");
      const back = pickFile(form, "back");
      const selfie = pickFile(form, "selfie");
      if (!front) throw new ActionError("書類の表の写真を選んでください。");
      if (!selfie) throw new ActionError("本人と書類を一緒に写した写真を選んでください。");
      if (back && docType !== "license") {
        throw new ActionError("裏の写真は運転免許証のときだけ送れます。マイナンバーカードの裏は撮らないでください。");
      }
      files.push(front);
      if (back) files.push(back);
      files.push(selfie);
    } else if (form.get("front") || form.get("back") || form.get("selfie")) {
      throw new ActionError("写真は次の画面（確認の会社の画面）で撮ります。");
    }

    // ⑥ 作り直して置く → ⑦ 申請を作る。失敗したら置いた写真を消す
    const uploaded: string[] = [];
    let result: Record<string, Json | undefined>;
    try {
      for (const f of files) {
        const { data } = await processImage(f, "kyc");
        uploaded.push(await putImage("kyc-documents", v.id, data));
      }
      const { data, error } = await createServiceClient().rpc("submit_kyc", {
        p_user: v.id,
        p_provider: provider,
        p_doc_type: docType,
        p_paths: uploaded,
        p_birth_date: birthDate,
      });
      throwDb(error);
      result = jsonObject(data);
    } catch (e) {
      if (uploaded.length > 0) {
        const removed = await removeImages("kyc-documents", uploaded);
        if (removed.error) console.error("[kyc] 置いた写真を消せませんでした", removed.error);
      }
      if (e instanceof ImageError) throw new ActionError(e.message);
      throw e;
    }

    const appId = typeof result.app_id === "string" ? result.app_id : null;
    revalidatePath("/kyc");
    revalidatePath("/settings");

    // 18歳未満: DB が申請を却下・利用停止にした。写真はすぐ消す
    if (result.status === "rejected_underage") {
      const purge = stringList(result.purge_paths);
      const removed = await removeImages("kyc-documents", purge);
      if (removed.error) {
        console.error("[kyc] 18歳未満の申請の写真を消せませんでした（cron の掃除でやり直す）", removed.error);
      } else if (appId) {
        const { error } = await createServiceClient().rpc("kyc_mark_purged", { p_app: appId });
        if (error) console.error("[kyc] 消した記録を書けませんでした", error.code);
      }
      throw new ActionError("18歳未満の方はご利用いただけません。");
    }

    // trustdock: 確認の会社に回す。失敗しても申請は残り、運営が手で判定できる
    let nextUrl: string | null = null;
    if (provider === "trustdock" && appId) {
      try {
        ({ nextUrl } = await startVerification(appId));
      } catch (e) {
        console.error("[kyc] TRUSTDOCK に回せませんでした", e instanceof Error ? e.message : "");
      }
    }

    return {
      ok: true,
      data: { nextUrl },
      message: "本人確認の書類を受け付けました。確認には数日かかることがあります。結果はお知らせでお伝えします。",
    };
  });
}
