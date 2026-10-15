/* 「ログインを保持する」を外したときの扱い。
   印のクッキー（pt_keep=0）があれば、Supabase のセッションのクッキーから有効期限を外して
   「ブラウザを閉じたら消える」クッキーにする。proxy.ts と lib/supabase/server.ts の両方から使う。
   ※ 検査から直接読めるよう、ここには何も import しない。 */

export const KEEP_COOKIE = "pt_keep";

type Opts = { maxAge?: number; expires?: Date } & Record<string, unknown>;

/** 印があれば期限を外す。消すためのクッキー（maxAge 0 以下）はそのまま通す */
export function sessionCookieOptions<T extends Opts>(options: T, ephemeral: boolean): T {
  if (!ephemeral) return options;
  if (typeof options.maxAge === "number" && options.maxAge <= 0) return options;
  const rest = { ...options };
  delete rest.maxAge;
  delete rest.expires;
  return rest;
}
