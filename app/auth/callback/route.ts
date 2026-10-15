/* メールのリンク・外部アカウントのログインから戻ってくる所。
   ?code=（PKCE）か ?token_hash=&type=（メールの文面を token_hash 型にした時）を受けて、ログインの状態を作る。
   code やトークンはログに出さない。失敗したら /auth?error=link へ。
   パスワードの再設定のリンクから来た時だけ、新しいパスワードを決めるための署名つきの札を置く（lib/recovery-grant.ts）。 */
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { RECOVERY_COOKIE, RECOVERY_COOKIE_PATH, RECOVERY_TTL_SEC, makeRecoveryGrant } from "@/lib/recovery-grant";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: readonly EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

function isOtpType(v: string | null): v is EmailOtpType {
  return v !== null && (OTP_TYPES as readonly string[]).includes(v);
}

function go(req: NextRequest, path: string) {
  const res = NextResponse.redirect(new URL(path, req.url), 303);
  res.headers.set("Cache-Control", "no-store");
  // 戻り先の URL（code 入り）を、次のページの Referer に載せない
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  // 自分のサイトの中の道だけ（外へは飛ばさない）
  const next = safeNext(params.get("next"), "/");

  const supabase = await createClient();
  let userId: string | null = null;
  if (code && code.length <= 512) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) userId = data.user?.id ?? null;
  } else if (tokenHash && tokenHash.length <= 512 && isOtpType(type)) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) userId = data.user?.id ?? null;
  }
  if (!userId) return go(req, "/auth?error=link");

  // 停止中・退会済みは案内へ
  const { data } = await supabase.rpc("viewer_context");
  const row = (Array.isArray(data) ? data[0] : data) as { status?: string } | null | undefined;
  if (row && row.status !== "active") return go(req, "/auth/suspended");

  const res = go(req, next);
  // 再設定のメール（resetPasswordForEmail の戻り先は next=/auth/update-password）から来た時だけ。
  // code はメールか外部アカウントのログインでしか手に入らないので、ここを通れた人はアカウントの持ち主
  if (type === "recovery" || next === "/auth/update-password") {
    res.cookies.set(RECOVERY_COOKIE, makeRecoveryGrant(userId, Math.floor(Date.now() / 1000), serverEnv.supabaseServiceRoleKey), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: RECOVERY_COOKIE_PATH,
      maxAge: RECOVERY_TTL_SEC,
    });
  }
  return res;
}
