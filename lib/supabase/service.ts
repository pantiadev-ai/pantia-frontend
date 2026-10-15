/* service_role の Supabase（RLS を通り抜ける）。使ってよいのは次だけ（28 §B2）:
     ・webhook（Stripe・KYC）と cron … 秘密・署名を照合したあと
     ・回数の上限（rate_limit_take）
     ・管理画面の server action … requireAdmin() のあと
   引数の id は、使う前に必ず呼び手の権限で絞る。クライアント部品から import しない（server-only で止まる）。 */
import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { publicEnv, serverEnv } from "@/lib/env";

export function createServiceClient() {
  return createSupabaseClient<Database>(publicEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
