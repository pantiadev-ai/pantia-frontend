/* 発送から決めた日数（運営の設定 autoCompleteDays）が過ぎても受け取り連絡の無い注文を、取引完了にする（毎日） */
import { cronGuard, runCron } from "@/lib/cron";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = cronGuard(req);
  if (denied) return denied;
  return runCron("auto-complete", async () => {
    const { data, error } = await createServiceClient().rpc("auto_complete_orders");
    if (error) throw new Error(error.message);
    return { completed: data ?? 0 };
  });
}
