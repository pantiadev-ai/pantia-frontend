"use server";
/* アカウント設定の操作（/settings）。
   ・本人の id は actionViewer() からだけ取る。受け取った値は1つずつ形を確かめ、列を選んで書く
   ・パスワードを確かめる所（パスワードの変更・退会）は、ログインと同じ回数の上限（loginEmail）をかける
   ・service role を使うのは退会（withdraw_account と、Auth の利用者を止める所）だけ。本人とパスワードを確かめた後 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import { actionViewer, ActionError, runAction, type ActionResult, type Viewer } from "@/lib/auth";
import { throwDb } from "@/lib/db-errors";
import { publicEnv } from "@/lib/env";
import { RULES, takeRateLimit } from "@/lib/rate-limit";
import { removeImages, type Bucket } from "@/lib/storage-server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database, Json } from "@/lib/database.types";
import {
  NOTIFY_ITEMS,
  PASSWORD_HINT,
  PASSWORD_MAX,
  PREFECTURES,
  WITHDRAW_WORD,
  normalizePhone,
  normalizePostal,
  passwordOk,
  usesPassword,
  type NotifyKey,
} from "@/components/account/options";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/** Google・X だけでログインしている人が、パスワードの代わりに求める「最近ログインした」の幅 */
const RECENT_LOGIN_MS = 15 * 60 * 1000;

async function limitOrThrow(checks: Parameters<typeof takeRateLimit>[0]) {
  const limit = await takeRateLimit(checks, { failClosed: true });
  if (!limit.ok) throw new ActionError(limit.message);
}

/** ログイン中の Auth の利用者（Viewer と同じ人か確かめる） */
async function authUser(supabase: ServerClient, v: Viewer): Promise<User> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== v.id) throw new ActionError("ログインし直してください。");
  return user;
}

/** 今のパスワードを確かめる。回数の上限はログインと同じ枠で数える（総当たりの抜け道にしない） */
async function verifyPassword(supabase: ServerClient, v: Viewer, password: string) {
  if (!v.email) throw new ActionError("メールアドレスが登録されていません。");
  await limitOrThrow([{ rule: RULES.loginEmail, kind: "email", id: v.email }]);
  const { data, error } = await supabase.auth.signInWithPassword({ email: v.email, password });
  if (error || data.user?.id !== v.id) throw new ActionError("今のパスワードが違います。");
}

/* ---------------------------------------------------------------------------
   メールアドレスの変更
--------------------------------------------------------------------------- */
const EmailInput = z.object({ email: z.email().max(254) });

export async function changeEmail(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const v = await actionViewer();
    const raw = input && typeof input === "object" ? (input as { email?: unknown }).email : undefined;
    const parsed = EmailInput.safeParse({ email: String(raw ?? "").trim().toLowerCase() });
    if (!parsed.success) throw new ActionError("メールアドレスの形を確かめてください。");
    const email = parsed.data.email;
    if (v.email && email === v.email.toLowerCase()) throw new ActionError("今と同じメールアドレスです。");

    // 確認のメールを何通も送らせない（新しいアドレスと本人の両方で数える）
    await limitOrThrow([
      { rule: RULES.resetEmail, kind: "email", id: email },
      { rule: RULES.resetEmail, kind: "user", id: v.id },
    ]);

    const supabase = await createClient();
    await authUser(supabase, v);
    const { error } = await supabase.auth.updateUser(
      { email },
      { emailRedirectTo: `${publicEnv.siteUrl}/auth/callback?next=/settings` },
    );
    if (error) {
      if (error.code === "email_exists" || error.code === "user_already_exists") {
        throw new ActionError("このメールアドレスには変更できません。別のアドレスをお試しください。");
      }
      if (error.code === "over_email_send_rate_limit") {
        throw new ActionError("確認のメールを送りすぎています。しばらくしてからお試しください。");
      }
      console.error("[account] メールアドレスを変えられませんでした", error.code);
      throw new ActionError("メールアドレスを変更できませんでした。時間をおいて、もう一度お試しください。");
    }
    return {
      ok: true,
      message: "新しいメールアドレスに確認のメールを送りました。メールのリンクを開くと変更が終わります（今のアドレスにも確認のメールが届くことがあります）。",
    };
  });
}

/* ---------------------------------------------------------------------------
   パスワードの変更
--------------------------------------------------------------------------- */
const PasswordInput = z.object({
  current: z.string().min(1).max(PASSWORD_MAX),
  next: z.string().max(PASSWORD_MAX),
});

export async function changePassword(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const v = await actionViewer();
    const parsed = PasswordInput.safeParse(input);
    if (!parsed.success) throw new ActionError("今のパスワードと新しいパスワードを入れてください。");
    const { current, next } = parsed.data;
    if (!passwordOk(next)) throw new ActionError(`新しいパスワードは${PASSWORD_HINT}`);
    if (current === next) throw new ActionError("今と同じパスワードです。");
    await limitOrThrow([{ rule: RULES.passwordUser, kind: "user", id: v.id }]);

    const supabase = await createClient();
    const user = await authUser(supabase, v);
    if (!usesPassword(user)) throw new ActionError("Google・X でログインしているため、パスワードはありません。");
    await verifyPassword(supabase, v, current);

    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) {
      if (error.code === "same_password") throw new ActionError("今と同じパスワードです。");
      if (error.code === "weak_password") throw new ActionError("もっと推測されにくいパスワードにしてください。");
      if (error.code === "reauthentication_needed") throw new ActionError("安全のため、ログインし直してからお試しください。");
      console.error("[account] パスワードを変えられませんでした", error.code);
      throw new ActionError("パスワードを変更できませんでした。時間をおいて、もう一度お試しください。");
    }
    // ほかの端末のログインを切る（この端末はそのまま）。切れなくても変更は済んでいる
    const { error: outError } = await supabase.auth.signOut({ scope: "others" });
    if (outError) console.error("[account] ほかの端末のログインを切れませんでした", outError.code);
    return { ok: true, message: "パスワードを変更しました。ほかの端末ではログインし直しになります。" };
  });
}

/* ---------------------------------------------------------------------------
   お届け先（購入の手続きで初期値に使う。1人1件）
--------------------------------------------------------------------------- */
const AddressInput = z.object({
  name: z.string().trim().min(1).max(30),
  postal: z.string().max(20),
  prefecture: z.enum(PREFECTURES),
  address1: z.string().trim().min(1).max(100),
  address2: z.string().trim().max(100).optional().default(""),
  phone: z.string().max(30),
});

export async function saveAddress(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const v = await actionViewer();
    const parsed = AddressInput.safeParse(input);
    if (!parsed.success) throw new ActionError("お届け先の入力を確かめてください（氏名30字・住所100字まで）。");
    const postal = normalizePostal(parsed.data.postal);
    if (!postal) throw new ActionError("郵便番号は7桁の数字で入れてください。");
    const phone = normalizePhone(parsed.data.phone);
    if (!phone) throw new ActionError("電話番号は 0 から始まる10〜11桁で入れてください。");
    await limitOrThrow([{ rule: RULES.reactUser, kind: "user", id: v.id }]);

    // 書く列はここで1つずつ選ぶ（user_id は DB の既定値 auth.uid() に任せる）
    const row = {
      name: parsed.data.name,
      postal,
      prefecture: parsed.data.prefecture,
      address1: parsed.data.address1,
      address2: parsed.data.address2,
      phone,
    };
    const supabase = await createClient();
    const { data: current, error: readError } = await supabase
      .from("saved_addresses")
      .select("user_id")
      .eq("user_id", v.id)
      .maybeSingle();
    throwDb(readError);
    const { error } = current
      ? await supabase.from("saved_addresses").update(row).eq("user_id", v.id)
      : await supabase.from("saved_addresses").insert(row);
    throwDb(error, "お届け先を保存できませんでした。入力を確かめてください。");
    revalidatePath("/settings");
    return { ok: true, message: "お届け先を保存しました。" };
  });
}

export async function deleteAddress(): Promise<ActionResult> {
  return runAction(async () => {
    const v = await actionViewer();
    await limitOrThrow([{ rule: RULES.reactUser, kind: "user", id: v.id }]);
    const supabase = await createClient();
    const { error } = await supabase.from("saved_addresses").delete().eq("user_id", v.id);
    throwDb(error);
    revalidatePath("/settings");
    return { ok: true, message: "お届け先を消しました。" };
  });
}

/* ---------------------------------------------------------------------------
   通知の設定（役割ごとに変えられる項目を絞る）
--------------------------------------------------------------------------- */
export async function setNotify(key: unknown, on: unknown): Promise<ActionResult<{ on: boolean }>> {
  return runAction(async () => {
    const v = await actionViewer();
    const allowed = NOTIFY_ITEMS[v.role].map((i) => i.key);
    const parsed = z
      .object({ key: z.enum(allowed as [NotifyKey, ...NotifyKey[]]), on: z.boolean() })
      .safeParse({ key, on });
    if (!parsed.success) throw new ActionError("この通知の設定は変えられません。");
    await limitOrThrow([{ rule: RULES.reactUser, kind: "user", id: v.id }]);

    const patch: Database["public"]["Tables"]["profiles"]["Update"] = {};
    patch[parsed.data.key] = parsed.data.on;
    const supabase = await createClient();
    const { data, error } = await supabase.from("profiles").update(patch).eq("id", v.id).select("id");
    throwDb(error);
    if (!data || data.length === 0) throw new ActionError("保存できませんでした。画面を読み込み直してください。");
    revalidatePath("/settings");
    return { ok: true, data: { on: parsed.data.on } };
  });
}

/* ---------------------------------------------------------------------------
   役割の変更の申請（出品者⇔購入者。運営が確かめて切り替える）
--------------------------------------------------------------------------- */
const RoleInput = z.object({ reason: z.string().trim().min(1).max(200) });

export async function requestRoleChange(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const v = await actionViewer();
    const parsed = RoleInput.safeParse(input);
    if (!parsed.success) throw new ActionError("申請の理由を200字までで入れてください。");
    await limitOrThrow([{ rule: RULES.reportUser, kind: "user", id: v.id }]);
    const supabase = await createClient();
    const { error } = await supabase.rpc("request_role_change", { p_reason: parsed.data.reason });
    throwDb(error);
    revalidatePath("/settings");
    return { ok: true, message: "役割の変更を申請しました。運営の確認をお待ちください。" };
  });
}

/* ---------------------------------------------------------------------------
   退会
   ① 確認の文字と、今のパスワード（Google・X だけの人は「15分以内にログインした」）を確かめる
   ② service role で withdraw_account（取引中の注文・振込の申請中・残高があれば DB が断る）
   ③ 返ってきた画像・書類を箱ごとに消す
   ④ Auth の利用者を止める（ban。消さない理由は報告書の「仮」を参照: 注文が profiles を参照していて消せない）
   ⑤ この端末をログアウトする（画面は / へ移る）
--------------------------------------------------------------------------- */
const WithdrawInput = z.object({
  confirm: z.string().max(20),
  password: z.string().max(PASSWORD_MAX).optional().default(""),
  reason: z.string().trim().max(200).optional().default(""),
});

const PURGE_BUCKETS: Bucket[] = ["avatars", "listing-images", "post-images", "kyc-documents"];

export async function withdraw(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const v = await actionViewer();
    if (v.isAdmin) throw new ActionError("運営者のアカウントは、ここでは退会できません。");
    const parsed = WithdrawInput.safeParse(input);
    if (!parsed.success) throw new ActionError("入力の内容を確かめてください。");
    if (parsed.data.confirm.trim() !== WITHDRAW_WORD) throw new ActionError(`確認のため「${WITHDRAW_WORD}」と入れてください。`);

    const supabase = await createClient();
    const user = await authUser(supabase, v);
    if (usesPassword(user)) {
      if (!parsed.data.password) throw new ActionError("今のパスワードを入れてください。");
      await verifyPassword(supabase, v, parsed.data.password);
    } else {
      await limitOrThrow([{ rule: RULES.loginEmail, kind: "user", id: v.id }]);
      const last = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : 0;
      if (!last || Date.now() - last > RECENT_LOGIN_MS) {
        throw new ActionError("安全のため、いったんログアウトしてログインし直し、15分以内に退会の手続きをしてください。");
      }
    }

    // ② ここから service role（本人・確認の文字・パスワードを確かめた後）
    const service = createServiceClient();
    const { data, error } = await service.rpc("withdraw_account", { p_user: v.id, p_reason: parsed.data.reason });
    throwDb(error, "退会の手続きができませんでした。時間をおいて、もう一度お試しください。");

    // ③ 画像・書類を消す。消せなかった物はログに残す（中身のパスは出さない）
    const purge = purgePaths(data);
    for (const bucket of PURGE_BUCKETS) {
      const paths = purge[bucket] ?? [];
      if (paths.length === 0) continue;
      const removed = await removeImages(bucket, paths);
      if (removed.error) console.error("[account] 退会の画像を消せませんでした", bucket, paths.length, removed.error);
    }

    // ④ Auth の利用者を止める（登録の時の名前なども消す）。止められなくても profiles が退会済みなので、次の操作から入れない
    const { error: banError } = await service.auth.admin.updateUserById(v.id, {
      ban_duration: "876000h",
      user_metadata: { nickname: null, age: null, occupation: null },
    });
    if (banError) console.error("[account] 退会した利用者を止められませんでした", banError.code);

    // ⑤ この端末のログアウト
    await supabase.auth.signOut({ scope: "local" });
    revalidatePath("/", "layout");
    return { ok: true, message: "退会しました。ご利用ありがとうございました。" };
  });
}

function purgePaths(v: Json | null): Partial<Record<Bucket, string[]>> {
  const root = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, Json | undefined>).purge_paths : undefined;
  if (!root || typeof root !== "object" || Array.isArray(root)) return {};
  const out: Partial<Record<Bucket, string[]>> = {};
  for (const bucket of PURGE_BUCKETS) {
    const list = (root as Record<string, Json | undefined>)[bucket];
    out[bucket] = Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  }
  return out;
}
