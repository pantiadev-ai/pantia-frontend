// 支払い期限の切れた注文を取り消す（毎日。Vercel Pro なら10分おきにできる。vercel.json の schedule を変える）。
// 購入の手続きでも、売り場が押さえられたときに同じ処理を呼ぶ（lib/order-sweep.ts）。
import { cronGuard, runCron } from "@/lib/cron";
import { expireStaleOrders } from "@/lib/order-sweep";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = cronGuard(req);
  if (denied) return denied;
  return runCron("expire-orders", async () => {
    const r = await expireStaleOrders();
    if (r.errors > 0) console.error(`[cron] expire-orders: 決済会社の取り消しに失敗 ${r.errors} 件（翌日にやり直し）`);
    return r;
  });
}
