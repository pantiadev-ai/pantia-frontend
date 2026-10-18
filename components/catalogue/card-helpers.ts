/* カードの小さな判断（サーバーとブラウザの両方で使う。DB には触らない） */
import { CATEGORIES } from "@/lib/labels";
import type { ListingCard } from "./types";

const DAY = 24 * 60 * 60 * 1000;

/** 日付が今から days 日以内か（NEW の札・新着の出品者） */
export function isRecent(v: string | null | undefined, days: number): boolean {
  if (!v) return false;
  const t = new Date(v).getTime();
  return Number.isFinite(t) && Date.now() - t < days * DAY;
}

/** カードの右下の札は1つだけ。即日 → 写真付 → 相談可 → 匿名可 → 手紙 の順で最初に当たった物 */
export function itemBadge(c: Pick<ListingCard, "sameDay" | "optPhoto" | "preMessageOk" | "anonymousOk" | "optLetter" | "coolShipping">): string | null {
  if (c.sameDay) return "即日";
  if (c.optPhoto) return "写真付";
  if (c.preMessageOk) return "相談可";
  if (c.anonymousOk) return "匿名可";
  if (c.optLetter) return "手紙";
  if (c.coolShipping) return "冷凍便";
  return null;
}

/** 写真が無いときにアイコンの丸に出す1字 */
export function initialOf(name: string | null | undefined): string {
  const s = (name ?? "").trim();
  return s ? Array.from(s)[0]! : "♡";
}

/** 「大学生 ・ 19歳」のような短い肩書き（空の物は出さない） */
export function metaLine(occupation: string | null | undefined, age: number | null | undefined, sep = " ・ "): string {
  return [occupation?.trim() || "", age ? `${age}歳` : ""].filter(Boolean).join(sep);
}

/** カテゴリの絵文字（写真が無いときの代わり）。知らない値は ✨ */
export function categoryIcon(v: string | null | undefined): string {
  return CATEGORIES.find((c) => c.value === v)?.icon ?? "✨";
}
