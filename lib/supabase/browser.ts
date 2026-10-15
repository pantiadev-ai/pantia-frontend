/* ブラウザ用の Supabase。ログイン中の人の権限（RLS）でしか読めない・書けない。
   チャットの Realtime と、画面の中の小さな読み込みにだけ使う。書き込みは server action を通す。 */
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

export function createClient() {
  return createBrowserClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

/** Realtime に今のログインの鍵を渡す。購読はこのあとに始める。
    渡す前に参加すると anon 扱いになり、RLS の表（threads・messages）の変化が届かない（参加が 401 や絞り込みの誤りで落ちる）。
    鍵の更新のあとは supabase-js が自分で渡し直す。 */
export async function realtimeReady(supabase: ReturnType<typeof createClient>): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) await supabase.realtime.setAuth(token);
}
