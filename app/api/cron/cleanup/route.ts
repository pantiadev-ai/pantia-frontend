/* 保存期間を過ぎたものを消す（毎日）。
   ・DB の行（通知・回数制限の記録・期限切れの下書きなど）は cleanup_retention がまとめて消す。
   ・本人確認の書類の写真は、判定から7日で消す。先に画像を消し、消せたものだけ「消した」と記録する
     （逆にすると、記録だけ残って写真が残る）。消せなかったものは翌日にやり直す。 */
import { cronGuard, runCron } from "@/lib/cron";
import { isUuid } from "@/lib/search";
import { removeImages } from "@/lib/storage-server";
import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/database.types";

export const dynamic = "force-dynamic";

type Purge = { app_id: string; paths: string[] };

function purgeList(result: Json): Purge[] {
  if (!result || typeof result !== "object" || Array.isArray(result)) return [];
  const list = (result as Record<string, Json | undefined>).kyc_purge;
  if (!Array.isArray(list)) return [];
  const out: Purge[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const appId = item.app_id;
    const paths = Array.isArray(item.paths) ? item.paths.filter((p): p is string => typeof p === "string") : [];
    if (isUuid(appId)) out.push({ app_id: appId, paths });
  }
  return out;
}

export async function GET(req: Request) {
  const denied = cronGuard(req);
  if (denied) return denied;
  return runCron("cleanup", async () => {
    const db = createServiceClient();
    const { data, error } = await db.rpc("cleanup_retention");
    if (error) throw new Error(error.message);
    let purged = 0;
    let failed = 0;
    for (const p of purgeList(data)) {
      const removed = await removeImages("kyc-documents", p.paths);
      if (removed.error) {
        failed++;
        console.error("[cron] cleanup: 本人確認の写真を消せませんでした", p.app_id, removed.error);
        continue;
      }
      const { error: markError } = await db.rpc("kyc_mark_purged", { p_app: p.app_id });
      if (markError) {
        failed++;
        console.error("[cron] cleanup: 消した記録を書けませんでした", p.app_id, markError.message);
        continue;
      }
      purged++;
    }
    const counts = data && typeof data === "object" && !Array.isArray(data) ? { ...data, kyc_purge: null } : {};
    return { ...counts, kyc_purged: purged, kyc_failed: failed };
  });
}
