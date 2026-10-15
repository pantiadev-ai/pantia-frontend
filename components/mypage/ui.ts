/* マイページの表示で使う小さな表と関数（サーバーの画面・client の部品の両方から読む。ここには何も import しない） */

/** 注文の状態 → 見本の .order-status のクラス */
export function orderStatusClass(status: string | null | undefined): string {
  switch (status) {
    case "paid":
      return "order-status status-new";
    case "preparing":
    case "shipped":
      return "order-status status-ship";
    case "completed":
      return "order-status status-done";
    default:
      return "order-status mp-status-muted";
  }
}

/**
 * 出品者が対応できる付け物（profiles.supported_options）。
 * DB の CHECK（photo・days・same_day・anonymous・letter・request・bundle）に合わせてここで持つ。
 * lib/labels.ts の SUPPORTED_OPTIONS と同じ値（こちらは絵文字つき）。値を足すときは両方と DB の CHECK を直す。
 */
export const PROFILE_OPTIONS = [
  { value: "photo", label: "📸 着用写真" },
  { value: "days", label: "📅 着用日数の相談" },
  { value: "same_day", label: "⚡ 即日発送" },
  { value: "anonymous", label: "📦 匿名配送" },
  { value: "letter", label: "💌 手紙" },
  { value: "request", label: "🎀 リクエスト対応" },
  { value: "bundle", label: "🛍 まとめ買い" },
] as const;
export type ProfileOption = (typeof PROFILE_OPTIONS)[number]["value"];

/** 売上の推移の目盛り（seller_stats の label: 週=MM/DD・月=YYYY-MM・年=YYYY） */
export function chartLabel(label: string, period: "week" | "month" | "year"): string {
  if (period === "month") {
    const m = /^(\d{4})-(\d{2})$/.exec(label);
    return m ? `${Number(m[2])}月` : label;
  }
  if (period === "year") return /^\d{4}$/.test(label) ? `${label}年` : label;
  const m = /^(\d{2})\/(\d{2})$/.exec(label);
  return m ? `${Number(m[1])}/${Number(m[2])}` : label;
}

/** 前と比べた増減（↑ 12% など）。前が0なら出さない */
export function changeRate(now: number, prev: number): { text: string; up: boolean } | null {
  if (!prev) return null;
  const r = Math.round(((now - prev) / prev) * 100);
  return { text: `${r >= 0 ? "↑" : "↓"} ${Math.abs(r)}%`, up: r >= 0 };
}
