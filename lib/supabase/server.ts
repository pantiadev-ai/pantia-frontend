/* サーバー（Server Component・server action・route handler）用の Supabase。
   ログイン中の人のクッキーで動くので、RLS がそのまま効く。迷ったらこれを使う。 */
import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { publicEnv } from "@/lib/env";
import { KEEP_COOKIE, sessionCookieOptions } from "@/lib/session-cookie";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        const ephemeral = cookieStore.get(KEEP_COOKIE)?.value === "0";
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, sessionCookieOptions(options, ephemeral)));
        } catch {
          // Server Component からは書けない。セッションの更新は proxy.ts が受け持つ
        }
      },
    },
  });
}
