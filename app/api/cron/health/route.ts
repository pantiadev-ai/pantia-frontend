/* cron が決めた時間の内に最後まで走っているか（外形監視が見る。合言葉なし）。
   止まっていれば 503。名前のほかは何も返さない。読めなければ全部止まっている扱いにする（fail-closed）。 */
import { NextResponse } from "next/server";
import { staleCrons } from "@/lib/cron";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function GET() {
  let rows: { name: string; last_finished_at: string | null; last_ok: boolean | null }[] = [];
  try {
    const { data, error } = await createServiceClient().from("cron_runs").select("name, last_finished_at, last_ok");
    if (!error) rows = data ?? [];
  } catch {
    rows = [];
  }
  const stale = staleCrons(rows, Date.now());
  const ok = stale.length === 0;
  return NextResponse.json(
    { ok, stale },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "public, s-maxage=300" } },
  );
}
