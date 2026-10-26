"use server";
/* 本人確認（18歳以上の確認）の提出（/kyc）。
   順番（どれかで止まったら、それより後には進まない）:
     ① ログイン・有効（actionViewer）
     ② 今の状態で出せるか（未提出／却下で再提出できる）
     ③ 回数の上限（kycUser。数えられなければ止める）
     ④ 入力の形（zod）
     ⑤ 写真の形と大きさ（JPEG・PNG・WebP、1枚 4MB まで）
     ⑥ 写真を作り直して非公開の箱に置く（service role。lib/kyc-submit.ts だけ）
     ⑦ service role で submit_kyc（DB でも状態・形・年齢を確かめ直す）
   途中で失敗したら、置いた写真を消す。書類の写真は本人の画面にも出さない（運営者だけが期限つき URL で見る）。
   運営が代わりに出す道は lib/actions/proxy.ts（⑤〜⑦ は同じ部品を使う）。 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionViewer, ActionError, runAction, type ActionResult } from "@/lib/auth";
import { assertKycReady, KycNotReadyError, startVerification, type KycProvider } from "@/lib/adapters/kyc";
import { throwDb } from "@/lib/db-errors";
import { birthDateOk, hasKycFiles, manualKycFiles, submitWithDocuments } from "@/lib/kyc-submit";
import { RULES, takeRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const Input = z.object({
  docType: z.enum(["license", "mynumber", "passport"]),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  agree: z.literal("1"),
});

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
    if (!birthDateOk(birthDate)) throw new ActionError("生年月日を確かめてください。");

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
    let files: File[] = [];
    if (provider === "manual") {
      files = manualKycFiles(form, docType);
    } else if (hasKycFiles(form)) {
      throw new ActionError("写真は次の画面（確認の会社の画面）で撮ります。");
    }

    // ⑥ 作り直して置く → ⑦ 申請を作る。失敗したら置いた写真を消す
    const { appId, underage } = await submitWithDocuments(v.id, files, async (paths) => {
      const { data, error } = await createServiceClient().rpc("submit_kyc", {
        p_user: v.id,
        p_provider: provider,
        p_doc_type: docType,
        p_paths: paths,
        p_birth_date: birthDate,
      });
      throwDb(error);
      return data;
    });
    revalidatePath("/kyc");
    revalidatePath("/settings");

    // 18歳未満: DB が申請を却下・利用停止にした。写真は消してある
    if (underage) throw new ActionError("18歳未満の方はご利用いただけません。");

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
