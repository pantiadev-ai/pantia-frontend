/* 受け取り待ち（発送済みで、まだ取引が完了していない売上）。
   売上は取引が完了したとき（購入者の受け取りの連絡か、自動完了）に、申請できる額に入る。
   自動完了は毎日 15:20 UTC（日本の 0:20。vercel.json の "20 15 * * *"）に、
   shipped_at < 今 - 日数 の注文を完了にする（supabase/migrations の auto_complete_orders）。 */

const DAY = 24 * 60 * 60 * 1000;
const RUN_MINUTE_UTC = 15 * 60 + 20;
const JST = 9 * 60 * 60 * 1000;

export type PendingSaleRow = { seller_net: number; shipped_at: string | null };

/** t より後（t ちょうどは含まない）の最初の 15:20 UTC */
function nextRunAfter(t: number): number {
  const d = new Date(t);
  const run = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + RUN_MINUTE_UTC * 60 * 1000;
  return run > t ? run : run + DAY;
}

/** 受け取り待ちの額・件数と、いちばん早く申請できる額に入る目安の時刻（受け取りの連絡が無いとき） */
export function pendingSales(
  rows: PendingSaleRow[],
  days: number,
  now: Date,
): { amount: number; count: number; earliest: Date | null } {
  let amount = 0;
  let first: number | null = null;
  for (const r of rows) {
    amount += r.seller_net;
    if (!r.shipped_at) continue;
    const t = Date.parse(r.shipped_at);
    if (Number.isNaN(t)) continue;
    if (first === null || t < first) first = t;
  }
  if (first === null) return { amount, count: rows.length, earliest: null };
  let run = nextRunAfter(first + days * DAY);
  // 目安が過ぎていても、自動完了がまだ回っていなければ残る。過去の日は出さない
  if (run <= now.getTime()) run = nextRunAfter(now.getTime());
  return { amount, count: rows.length, earliest: new Date(run) };
}

/** 受け取り待ちの注記。目安があれば日本の日付で末尾に付ける */
export function pendingSalesNote(days: number, earliest: Date | null): string {
  const base = `購入者が受け取りを連絡するとすぐ、連絡がなくても発送から${days}日で申請できる額に入ります`;
  if (!earliest) return base;
  const j = new Date(earliest.getTime() + JST);
  return `${base}（最も早いもの：${j.getUTCMonth() + 1}/${j.getUTCDate()}ごろ）`;
}
