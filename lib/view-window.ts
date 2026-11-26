/* 運営が利用者同士の会話を見られる時間（券）。開いてから30分（DB の admin_view_any_thread と同じ。0023）。
   画像の期限つき URL も、券の残りより長くしない（券が切れたあとに画像だけ見られる、を作らない） */
export const VIEW_MINUTES = 30;

/** 見られる期限（ISO）。開いた時刻が読めなければ空 */
export function viewUntil(openedAt: string): string {
  const t = Date.parse(openedAt);
  return Number.isNaN(t) ? "" : new Date(t + VIEW_MINUTES * 60_000).toISOString();
}

/** 券の残りの秒（切り捨て）。切れている・読めないときは0 */
export function viewSecondsLeft(openedAt: string, nowMs: number): number {
  const t = Date.parse(openedAt);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((t + VIEW_MINUTES * 60_000 - nowMs) / 1000));
}
