"use server";
/* ログイン・会員登録・パスワードの再設定。
   ログインの前なので actionViewer は使わない（パスワードの変更だけはログイン中の本人）。
   パスワード・トークン・メールアドレスは console にも URL にも出さない。 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ActionError, actionViewer, runAction, type ActionResult } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { publicEnv, serverEnv } from "@/lib/env";
import { RECOVERY_COOKIE, RECOVERY_COOKIE_PATH, hasRecoveryGrant } from "@/lib/recovery-grant";
import { RULES, requestIp, takeRateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { KEEP_COOKIE } from "@/lib/session-cookie";
import { PASSWORD_HINT, PASSWORD_MAX, afterLoginPath, hasControlChar, isStrongPassword } from "@/components/auth/rules";

/** ログインの失敗は理由を分けない（アカウントがあるかを外から当てさせない） */
const BAD_LOGIN = "メールアドレスかパスワードが違います。";
const BUSY = "ただいま混み合っています。少し時間をおいて、もう一度お試しください。";
const REGISTRATION_CLOSED = "ただいま新規登録を止めています。";
const WEAK_PASSWORD = `パスワードは${PASSWORD_HINT}`;

const Email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const Next = z.string().max(2048).optional();

/** 「ログインしたままにする」の印。外したときだけ pt_keep=0（ブラウザを閉じると消える）を置く。
    Supabase のクッキーを書く前に置くこと（lib/supabase/server.ts がこの印を見て期限を外す） */
async function setKeep(keep: boolean) {
  const store = await cookies();
  if (keep) {
    store.delete(KEEP_COOKIE);
  } else {
    store.set(KEEP_COOKIE, "0", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  }
}

function callbackUrl(next: string): string {
  return `${publicEnv.siteUrl}/auth/callback?next=${encodeURIComponent(next)}`;
}

/* ───────── ログイン ───────── */

const LoginSchema = z.object({
  email: Email,
  password: z.string().min(1).max(PASSWORD_MAX),
  keep: z.boolean(),
  next: Next,
});

export async function login(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = LoginSchema.safeParse(input);
    if (!parsed.success) throw new ActionError(BAD_LOGIN);
    const { email, password, keep, next } = parsed.data;

    const limit = await takeRateLimit(
      [
        { rule: RULES.loginEmail, kind: "email", id: email },
        { rule: RULES.loginIp, kind: "ip", id: await requestIp() },
      ],
      { failClosed: false },
    );
    if (!limit.ok) throw new ActionError(limit.message);

    await setKeep(keep);
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // パスワードが合った後にだけ返る理由。アカウントの有無は漏れない
      if (error.code === "email_not_confirmed") {
        throw new ActionError("メールアドレスの確認が済んでいません。登録のときに届いたメールのリンクを開いてください。");
      }
      if (error.code === "over_request_rate_limit" || error.status === 429) throw new ActionError(BUSY);
      // user_banned（退会・停止）も含めて、ほかは全部同じ文
      throw new ActionError(BAD_LOGIN);
    }

    const { data } = await supabase.rpc("viewer_context");
    const row = (Array.isArray(data) ? data[0] : data) as { status?: string } | null | undefined;
    // 停止中・退会済みは案内のページへ（読めなかったときは行き先のページ側の requireViewer が止める）
    if (row && row.status !== "active") redirect("/auth/suspended");
    redirect(afterLoginPath(next));
  });
}

/* ───────── 会員登録 ───────── */

const SignupSchema = z
  .object({
    role: z.enum(["seller", "buyer"]),
    nickname: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .refine((s) => !hasControlChar(s)),
    email: Email,
    password: z.string().max(PASSWORD_MAX).refine(isStrongPassword),
    age: z.number().int().min(18).max(99).nullable(),
    occupation: z.string().trim().max(20).nullable(),
    agreeTerms: z.literal(true),
    agreePrivacy: z.literal(true),
    adult: z.literal(true),
  })
  .refine((v) => v.role !== "seller" || v.age !== null);

/** signedIn = Supabase の「メールの確認」が切ってあり、登録したその場でログインできた（確認メールは送られない） */
export async function signup(input: unknown): Promise<ActionResult<{ role: "seller" | "buyer"; signedIn: boolean }>> {
  return runAction(async () => {
    const parsed = SignupSchema.safeParse(input);
    if (!parsed.success) throw new ActionError("入力の内容を確かめてください。");
    const v = parsed.data;

    const limit = await takeRateLimit([{ rule: RULES.signupIp, kind: "ip", id: await requestIp() }], { failClosed: false });
    if (!limit.ok) throw new ActionError(limit.message);

    const settings = await getSettings();
    if (!settings.registrationOpen) throw new ActionError(REGISTRATION_CLOSED);

    // handle_new_user が読む名前（nickname・role・age・occupation）。年齢と職業は出品者だけ
    const meta: Record<string, string> = { nickname: v.nickname, role: v.role };
    if (v.role === "seller") {
      if (v.age !== null) meta.age = String(v.age);
      if (v.occupation) meta.occupation = v.occupation;
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email: v.email,
      password: v.password,
      options: { data: meta, emailRedirectTo: callbackUrl("/kyc") },
    });
    if (error) {
      // 登録済みのアドレスでも、初めての人と同じ「確認メールを送りました」を出す（有無を当てさせない）
      if (error.code === "user_already_exists" || error.code === "email_exists") {
        return { ok: true, data: { role: v.role, signedIn: false } };
      }
      if (error.code === "weak_password") throw new ActionError(WEAK_PASSWORD);
      if (error.code === "signup_disabled") throw new ActionError(REGISTRATION_CLOSED);
      if (error.code === "email_address_invalid") throw new ActionError("このメールアドレスは使えません。別のアドレスでお試しください。");
      if (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit" || error.status === 429) {
        throw new ActionError(BUSY);
      }
      // DB の登録の関数（handle_new_user）が止めたとき。Auth は中身を返さないので、受付の状態だけ見直す
      if (/database error/i.test(error.message ?? "")) {
        if (!(await getSettings()).registrationOpen) throw new ActionError(REGISTRATION_CLOSED);
      }
      console.error("[signup]", error.code ?? error.status);
      throw new ActionError("登録できませんでした。時間をおいて、もう一度お試しください。");
    }
    return { ok: true, data: { role: v.role, signedIn: Boolean(data.session) } };
  });
}

/* ───────── 外部アカウント（Google・X） ───────── */

const OAuthSchema = z.object({
  provider: z.enum(["google", "x"]),
  keep: z.boolean(),
  next: Next,
});

export async function startOAuth(input: unknown): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    const parsed = OAuthSchema.safeParse(input);
    if (!parsed.success) throw new ActionError("入力の内容を確かめてください。");
    const { provider, keep, next } = parsed.data;
    if (!publicEnv.oauthProviders.includes(provider)) throw new ActionError("この方法では今はログインできません。");

    const limit = await takeRateLimit([{ rule: RULES.loginIp, kind: "ip", id: await requestIp() }], { failClosed: false });
    if (!limit.ok) throw new ActionError(limit.message);

    await setKeep(keep);
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl(afterLoginPath(next)) },
    });
    // 行き先は Supabase Auth の入口だけ（それ以外の URL は開かせない）
    if (error || !data.url || !data.url.startsWith(`${publicEnv.supabaseUrl.replace(/\/+$/, "")}/`)) {
      throw new ActionError("外部アカウントでのログインを始められませんでした。時間をおいて、もう一度お試しください。");
    }
    return { ok: true, data: { url: data.url } };
  });
}

/* ───────── パスワードを忘れたとき ───────── */

const ResetSchema = z.object({ email: Email });

const RESET_SENT = "入力したメールアドレスが登録されていれば、再設定のメールを送りました。メール内のリンクから新しいパスワードを決めてください。";

export async function requestPasswordReset(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = ResetSchema.safeParse(input);
    if (!parsed.success) throw new ActionError("メールアドレスを確かめてください。");
    const { email } = parsed.data;

    // 他人のメール箱を埋める嫌がらせを止めるため、数えられないときも止める
    const limit = await takeRateLimit(
      [
        { rule: RULES.resetEmail, kind: "email", id: email },
        { rule: RULES.resetIp, kind: "ip", id: await requestIp() },
      ],
      { failClosed: true },
    );
    if (!limit.ok) throw new ActionError(limit.message);

    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callbackUrl("/auth/update-password") });
    // 失敗しても同じ文（「1分おいて」などの返事はアカウントがある時だけ出るので、そのまま見せない）
    if (error) console.error("[reset]", error.code ?? error.status);
    return { ok: true, message: RESET_SENT };
  });
}

/* ───────── 新しいパスワードを決める（再設定のメールのリンクから来た人だけ） ───────── */

const RECOVERY_EXPIRED = "安全のため、もう一度パスワードの再設定のメールからやり直してください。";

const UpdatePasswordSchema = z.object({
  password: z.string().max(PASSWORD_MAX),
  confirm: z.string().max(PASSWORD_MAX),
});

export async function updatePassword(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const viewer = await actionViewer();
    // ログイン中というだけでは変えさせない（端末を借りた人が、今のパスワードなしに乗っ取れてしまう）。
    // 再設定のメールのリンクを通った時に /auth/callback が置く、署名つきの札があって、期限内の時だけ
    const store = await cookies();
    const grant = store.get(RECOVERY_COOKIE)?.value;
    if (!hasRecoveryGrant(grant, viewer.id, serverEnv.supabaseServiceRoleKey)) {
      throw new ActionError(RECOVERY_EXPIRED);
    }
    const parsed = UpdatePasswordSchema.safeParse(input);
    if (!parsed.success) throw new ActionError("入力の内容を確かめてください。");
    const { password, confirm } = parsed.data;
    if (!isStrongPassword(password)) throw new ActionError(WEAK_PASSWORD);
    if (password !== confirm) throw new ActionError("確認のパスワードが一致しません。");
    const limit = await takeRateLimit([{ rule: RULES.passwordUser, kind: "user", id: viewer.id }], { failClosed: true });
    if (!limit.ok) throw new ActionError(limit.message);

    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      if (error.code === "same_password") throw new ActionError("今と同じパスワードは使えません。別のパスワードにしてください。");
      if (error.code === "weak_password") throw new ActionError(WEAK_PASSWORD);
      if (error.code === "reauthentication_needed" || error.code === "session_not_found") {
        throw new ActionError(RECOVERY_EXPIRED);
      }
      console.error("[update-password]", error.code ?? error.status);
      throw new ActionError("パスワードを変更できませんでした。時間をおいて、もう一度お試しください。");
    }
    // ほかの端末のログインは切る（盗まれた時の再設定を想定）。この端末はそのまま
    await supabase.auth.signOut({ scope: "others" });
    // 札は一度きり（消すと画面が描き直され、フォームは「期限切れ」の案内になるが、変えた旨の表示が先に出る）
    store.delete({ name: RECOVERY_COOKIE, path: RECOVERY_COOKIE_PATH });
    return { ok: true, message: "パスワードを変更しました。ほかの端末からはログアウトしています。" };
  });
}
