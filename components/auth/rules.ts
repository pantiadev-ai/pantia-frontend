/* ログイン・登録の決まり。画面（クライアント）と server action の両方から読むので、
   server 専用の物は import しない。 */
import { PASSWORD_HINT, PASSWORD_MAX, PASSWORD_MIN, passwordOk } from "@/components/account/options";
import { safeNext } from "@/lib/safe-next";

/** パスワードの決まりの本体は設定の画面と同じ物（components/account/options.ts）を使う。ここでは名前を合わせて出すだけ */
export { PASSWORD_HINT, PASSWORD_MAX, PASSWORD_MIN } from "@/components/account/options";

/** 英字と数字を両方含む 8〜72 字 */
export const isStrongPassword: (pw: string) => boolean = passwordOk;

/** 入力中のパスワードの下に出す一言（見本の checkPwStrength と同じ文） */
export function passwordHint(pw: string): { text: string; ok: boolean | null } {
  if (pw.length === 0) return { text: PASSWORD_HINT, ok: null };
  if (pw.length < PASSWORD_MIN) return { text: "⚠ もう少し長くしてください", ok: false };
  if (pw.length > PASSWORD_MAX) return { text: `⚠ ${PASSWORD_MAX}文字以内にしてください`, ok: false };
  if (!passwordOk(pw)) return { text: "⚠ 英字と数字を両方含めてください", ok: false };
  return { text: "✓ 安全なパスワードです", ok: true };
}

/** 制御文字（改行・タブを含む）があるか。名前などの1行の欄に使う */
export function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x1f || c === 0x7f) return true;
  }
  return false;
}

/** ログインのあとに開くページ。サイトの外と /auth の中（ログイン画面に戻る輪）は既定のトップにする */
export function afterLoginPath(next: unknown): string {
  const p = safeNext(next, "/");
  if (p === "/auth" || p.startsWith("/auth/") || p.startsWith("/auth?")) return "/";
  return p;
}

export type SignupRole = "seller" | "buyer";
export type OAuthProvider = "google" | "x";
