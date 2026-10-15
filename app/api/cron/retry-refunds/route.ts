/* 返金待ちのまま残った注文（決済会社の不調・記録の失敗）を、もう一度返金にかける（毎日）。
   同じ注文の返金は決済会社の側でも1回に絞ってある（idempotencyKey・merchantRefundId）ので、何度走っても二重にならない。 */
import { cronGuard, runCron } from "@/lib/cron";
import { retryRefunds } from "@/lib/order-sweep";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = cronGuard(req);
  if (denied) return denied;
  return runCron("retry-refunds", async () => {
    const r = await retryRefunds();
    if (r.failed > 0) console.error(`[cron] retry-refunds: 返金できない注文が ${r.failed} 件（/admin/orders で確認）`);
    return r;
  });
}
