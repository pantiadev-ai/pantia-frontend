/* 画面に出す値の書き方（金額・日付・名前の伏せ字）。サーバーでもブラウザでも使う。
   日付は必ず日本時間で出す（Vercel のサーバーは UTC で動くので、何も指定しないと9時間ずれる）。 */

const TZ = "Asia/Tokyo";

export function yen(n: number | null | undefined): string {
  return `¥${Math.round(Number(n) || 0).toLocaleString("ja-JP")}`;
}

/** 数（1,234 の形） */
export function num(n: number | null | undefined): string {
  return Math.round(Number(n) || 0).toLocaleString("ja-JP");
}

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 2026/10/15 */
export function dateJst(v: string | Date | null | undefined): string {
  const d = toDate(v);
  if (!d) return "";
  return new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** 2026/10/15 14:05 */
export function dateTimeJst(v: string | Date | null | undefined): string {
  const d = toDate(v);
  if (!d) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** 14:05 */
export function timeJst(v: string | Date | null | undefined): string {
  const d = toDate(v);
  if (!d) return "";
  return new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
}

/** 10月15日 */
export function monthDayJst(v: string | Date | null | undefined): string {
  const d = toDate(v);
  if (!d) return "";
  return new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, month: "long", day: "numeric" }).format(d);
}

/** たった今・5分前・3時間前・2日前、それより前は日付 */
export function relTime(v: string | Date | null | undefined, now: Date = new Date()): string {
  const d = toDate(v);
  if (!d) return "";
  const sec = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (sec < 60) return "たった今";
  if (sec < 3600) return `${Math.floor(sec / 60)}分前`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}時間前`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}日前`;
  return dateJst(d);
}

/** 最後に見えた時刻から「オンライン」かどうか（DB の seller_online と同じ10分） */
export function isOnline(lastSeen: string | null | undefined, now: Date = new Date()): boolean {
  const d = toDate(lastSeen);
  return !!d && now.getTime() - d.getTime() < 10 * 60 * 1000;
}

/** 最後に見えた時刻の言い方（オンライン・3時間前にログイン） */
export function presence(lastSeen: string | null | undefined, now: Date = new Date()): string {
  if (isOnline(lastSeen, now)) return "オンライン";
  const d = toDate(lastSeen);
  return d ? `${relTime(d, now)}にログイン` : "";
}

/** 呼び名に「さん」を付ける。購入者の伏せた名前（K***さん）や、もう「さん」で終わる呼び名には重ねない（DB の public.san と同じ） */
export function san(name: string | null | undefined): string {
  const s = name ?? "";
  if (!s) return "";
  return s.endsWith("さん") ? s : `${s}さん`;
}

/** 購入者の名前は伏せる（仕様書 §8: K***さん）。先頭の1字だけ見せる */
export function maskName(name: string | null | undefined): string {
  const s = (name ?? "").trim();
  if (!s) return "***さん";
  const first = Array.from(s)[0]!;
  return `${first.toUpperCase()}***さん`;
}

/** 退会・停止で名前が読めないときの言い方 */
export function displayName(name: string | null | undefined): string {
  const s = (name ?? "").trim();
  return s || "退会したユーザー";
}

/** 評価の平均（3.95 → "4.0"）。件数0なら "-" */
export function ratingAvg(sum: number | null | undefined, count: number | null | undefined): string {
  const c = Number(count) || 0;
  if (c === 0) return "-";
  return ((Number(sum) || 0) / c).toFixed(1);
}

/** 1〜5 の星（★★★★☆） */
export function stars(rating: number): string {
  const r = Math.max(0, Math.min(5, Math.round(rating)));
  return "★".repeat(r) + "☆".repeat(5 - r);
}

/** 注文番号 #1001 */
export function orderNo(n: number | string | null | undefined): string {
  return `#${n ?? ""}`;
}

/** 口座番号などの下4桁 */
export function last4(s: string | null | undefined): string {
  const v = (s ?? "").replace(/\D/g, "");
  return v ? `****${v.slice(-4)}` : "";
}

/** 改行を含む文の先頭の短い抜き出し */
export function excerpt(s: string | null | undefined, max = 60): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  const chars = Array.from(t);
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : t;
}
