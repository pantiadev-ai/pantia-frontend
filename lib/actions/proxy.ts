"use server";
/* 代理登録（本人に頼まれて、運営が代わりにアカウントを作る）。管理画面の /admin/proxy から呼ぶ。

   ▼守り（28 §B1・§B6）
   ・すべて actionAdminStrict()（管理者＋二段階認証）と回数の上限から始める（lib/actions/admin.ts と同じ）。
   ・年齢の確認は省かない。作っただけでは本人確認は「未提出」で、書類を出して審査で承認されるまで、
     ふつうの登録と同じく出品も購入もできない。
   ・パスワードは運営が決めない。本人がリンクから決める。リンクは画面に1回だけ出し、DB にもログにも残さない。
     本人が決めたら（updatePassword → proxy_mark_handed_over）、運営からはリンクを作れなくなる。
   ・本人確認の代理提出は「本人の同意を得た」の印が必須。出した運営は kyc_applications.submitted_by と記録に残る。
     書類を目で見る受け方（manual）のときだけ。TRUSTDOCK で受けているときは本人の端末で出してもらう。 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActionError, runAction, type ActionResult } from "@/lib/auth";
import { assertKycReady, KycNotReadyError, type KycProvider } from "@/lib/adapters/kyc";
import { actionAdminStrict, adminLimit, adminThrowDb, ADMIN_RULES } from "@/lib/admin";
import { dbCode, type DbError } from "@/lib/db-errors";
import { publicEnv } from "@/lib/env";
import { birthDateOk, manualKycFiles, submitWithDocuments } from "@/lib/kyc-submit";
import { isUuid } from "@/lib/search";
import { getSettings } from "@/lib/settings";
import { createServiceClient } from "@/lib/supabase/service";
import { hasControlChar } from "@/components/auth/rules";

/** 管理の操作の入口（管理者＋aal2＋回数の上限） */
async function begin() {
  const v = await actionAdminStrict();
  await adminLimit(ADMIN_RULES.op, v.id);
  return v;
}

function refresh() {
  revalidatePath("/admin", "layout");
}

function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (!r.success) throw new ActionError(r.error.issues[0]?.message ?? "入力の内容を確かめてください。");
  return r.data;
}

const Id = z.string().refine((s) => isUuid(s), "対象が見つかりません。画面を読み込み直してください。");

/* ───────────── 代理で登録する ───────────── */

const RegisterInput = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254, "メールアドレスが長すぎます。")
      .pipe(z.email({ error: "メールアドレスの形を確かめてください。" })),
    nickname: z
      .string()
      .trim()
      .min(1, "呼び名を入力してください。")
      .max(20, "呼び名は20文字以内で入力してください。")
      .refine((s) => !hasControlChar(s), "呼び名に使えない文字があります。"),
    role: z.enum(["seller", "buyer"], { error: "出品者か購入者かを選んでください。" }),
    age: z.number().int().min(18, "年齢は18〜99で入力してください。").max(99, "年齢は18〜99で入力してください。").nullable(),
    note: z.string().trim().max(200, "メモは200文字以内で入力してください。"),
    consent: z.literal(true, { error: "本人から頼まれ、規約とプライバシーポリシーに同意してもらったことを確かめてください。" }),
    adult: z.literal(true, { error: "本人が18歳以上だと申告したことを確かめてください。" }),
  })
  .refine((v) => v.role !== "seller" || v.age !== null, "出品者は年齢を入力してください（本人の申告。本当の確認は本人確認で行います）。");

/** 戻り値の id は作った利用者。画面はその人の代理登録のページへ移る */
export async function proxyRegister(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const me = await begin();
    const v = parse(RegisterInput, input);
    // DB（handle_new_user）でも止まるが、先に確かめてわかる文を出す
    if (!(await getSettings()).registrationOpen) {
      throw new ActionError("新規登録の受付を止めているため登録できません。サイト設定で受付を再開してから行ってください。");
    }

    // handle_new_user が読む名前（nickname・role・age）。パスワードは付けない（本人がリンクから決める）。
    // email_confirm: true で、確認のメールは送られない
    const meta: Record<string, string> = { nickname: v.nickname, role: v.role };
    if (v.role === "seller" && v.age !== null) meta.age = String(v.age);
    const service = createServiceClient();
    const { data, error } = await service.auth.admin.createUser({ email: v.email, email_confirm: true, user_metadata: meta });
    if (error || !data.user) {
      if (error?.code === "email_exists" || error?.code === "user_already_exists") {
        throw new ActionError("このメールアドレスはもう登録されています。");
      }
      if (error?.code === "email_address_invalid") throw new ActionError("このメールアドレスは使えません。");
      console.error("[proxy] アカウントを作れませんでした", error?.code ?? error?.status);
      throw new ActionError("アカウントを作れませんでした。時間をおいて、もう一度お試しください。");
    }

    const id = data.user.id;
    const { error: markError } = await service.rpc("admin_proxy_register", { p_admin: me.id, p_user: id, p_note: v.note });
    if (markError) {
      // 台帳に載らないアカウントを残さない（作ったばかりで、まだ何も持っていない）
      const removed = await service.auth.admin.deleteUser(id);
      if (removed.error) console.error("[proxy] 作ったアカウントを消せませんでした", removed.error.code ?? removed.error.status);
      adminThrowDb(markError);
    }
    refresh();
    return { ok: true, data: { id }, message: "代理で登録しました。次に、パスワードを決めるリンクを作って本人に送ってください。" };
  });
}

/* ───────────── パスワードを決めるリンク ───────────── */

/** リンクは戻り値で1回だけ渡す（ログ・DB・URL の記録に残さない）。新しく作ると、前に作ったリンクは使えなくなる */
export async function proxyIssueLink(userId: unknown): Promise<ActionResult<{ url: string; count: number }>> {
  return runAction(async () => {
    const me = await begin();
    const id = parse(Id, userId);
    const service = createServiceClient();
    const { data: found, error: findError } = await service.auth.admin.getUserById(id);
    const email = found?.user?.email;
    if (findError || !email) throw new ActionError("この利用者が見つかりません。画面を読み込み直してください。");

    // 先に DB で「まだ渡していない・利用中」を確かめて回数を残す（ここで止まればリンクは作らない）
    const { data: count, error } = await service.rpc("admin_proxy_link_issued", { p_admin: me.id, p_user: id });
    if (error) {
      if (dbCode(error) === "bad_state") {
        throw new ActionError(
          "この人は、本人がもうパスワードを決めたか、利用を止めています。運営からはリンクを作れません（パスワードを忘れたときは、本人がログイン画面の「パスワードを忘れた方」から再設定します）。",
        );
      }
      adminThrowDb(error);
    }

    // generateLink はメールを送らない。hashed_token を入口 /auth/start に渡す。
    // /auth/callback に直接つながないのは、LINE などのリンクのプレビューが先に開いてトークンを使ってしまうため
    // （/auth/start はボタンを押したときだけ /auth/callback の verifyOtp へ送る）
    const { data: link, error: linkError } = await service.auth.admin.generateLink({ type: "recovery", email });
    const token = link?.properties?.hashed_token;
    if (linkError || !token) {
      console.error("[proxy] リンクを作れませんでした", linkError?.code ?? linkError?.status);
      throw new ActionError("リンクを作れませんでした。時間をおいて、もう一度お試しください。");
    }
    const query = new URLSearchParams({ token_hash: token });
    refresh();
    return { ok: true, data: { url: `${publicEnv.siteUrl}/auth/start?${query.toString()}`, count: count ?? 1 } };
  });
}

/* ───────────── 本人確認の代理提出 ───────────── */

const KycInput = z.object({
  userId: Id,
  docType: z.enum(["license", "mynumber", "passport"]),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  consent: z.literal("1"),
});

const KYC_MESSAGES: Record<string, string> = {
  bad_kyc: "書類の種類・写真・生年月日を確かめてください。",
  kyc_in_progress: "この人の本人確認は、審査中か、もう済んでいます。",
  kyc_resubmit_closed: "この人の本人確認は、再提出を受け付けていません（KYC審査の画面で再申請を受け付けると出せます）。",
  not_allowed: "この人は利用を止めているため、本人確認を出せません。",
  bad_state: "代理登録した人ではありません。本人確認は本人の画面から出してもらってください。",
};

function throwKyc(error: DbError): void {
  if (!error) return;
  const code = dbCode(error);
  if (code && KYC_MESSAGES[code]) throw new ActionError(KYC_MESSAGES[code]);
  adminThrowDb(error);
}

export async function proxySubmitKyc(form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const me = await begin();
    const parsed = KycInput.safeParse({
      userId: form.get("userId"),
      docType: form.get("docType"),
      birthDate: form.get("birthDate"),
      consent: form.get("consent"),
    });
    if (!parsed.success) throw new ActionError("書類の種類・生年月日・本人の同意を確かめてください。");
    const { userId, docType, birthDate } = parsed.data;
    if (!birthDateOk(birthDate)) throw new ActionError("生年月日を確かめてください。");

    // 書類を目で見る受け方のときだけ（TRUSTDOCK は本人が確認の会社の画面で撮る）
    let provider: KycProvider;
    try {
      provider = assertKycReady();
    } catch (e) {
      if (e instanceof KycNotReadyError) throw new ActionError("ただいま本人確認の受付を止めています。");
      throw e;
    }
    if (provider !== "manual") {
      throw new ActionError("本人確認を確認の会社（TRUSTDOCK）で受けているため、代理では出せません。本人の端末で出してもらってください。");
    }

    // 写真を置く前に、代理登録した人かを確かめる（DB の admin_proxy_submit_kyc でも確かめ直す）
    const service = createServiceClient();
    const { data: row, error: rowError } = await service.from("proxy_registrations").select("user_id").eq("user_id", userId).maybeSingle();
    adminThrowDb(rowError);
    if (!row) throw new ActionError(KYC_MESSAGES.bad_state!);

    const files = manualKycFiles(form, docType);
    const { underage } = await submitWithDocuments(userId, files, async (paths) => {
      const { data, error } = await service.rpc("admin_proxy_submit_kyc", {
        p_admin: me.id,
        p_user: userId,
        p_doc_type: docType,
        p_paths: paths,
        p_birth_date: birthDate,
      });
      throwKyc(error);
      return data;
    });
    refresh();
    if (underage) {
      throw new ActionError("18歳未満のため受け付けられません。この人の利用を止め、書類の写真は消しました。");
    }
    return { ok: true, message: "本人確認の書類を出しました。KYC審査の画面から、ふつうどおり審査してください。" };
  });
}
