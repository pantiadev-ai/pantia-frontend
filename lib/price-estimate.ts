/* 出品のフォームの「価格設定」の見込み。式は DB の listing_quote と place_order と同じ:
   小計 = 販売価格 ＋ 延長（日数 × 1日の料金）＋ 動画 ＋ 選ばれた有料オプション、手数料 = round(小計 × 率)。
   どのオプションを選ぶかは購入者が決めるので、「何も選ばれない」〜「全部選ばれた」の幅で出す。
   匿名配送の料金は運営に入るので、出品者の受け取り額には入れない。 */
import { yen } from "./format.ts";

export type EstimateInput = {
  price: number;
  feeRate: number;
  /** 着用動画をつけたときの料金（つけないなら null） */
  videoFee: number | null;
  /** 着用日数延長をつけたとき。days は「最大の日数 − 着用日数」 */
  extend: { feePerDay: number; days: number } | null;
  /** 自分で決めた有料オプション（決まりに合う物だけ） */
  extras: { name: string; price: number }[];
};
export type EstimateLine = { label: string; amount: number; note: string };
export type Range = { min: number; max: number };
export type Estimate = { lines: EstimateLine[]; subtotal: Range; fee: Range; net: Range };

/** 手数料。率は 0.1% 刻み（管理画面の設定）なので千分率の整数で掛け、小数の誤差で .5 を落とさない */
function feeOf(subtotal: number, feeRate: number): number {
  return Math.round((subtotal * Math.round(feeRate * 1000)) / 1000);
}

export function priceEstimate(input: EstimateInput): Estimate {
  const lines: EstimateLine[] = [];
  if (input.videoFee !== null) lines.push({ label: "🎬 着用動画", amount: input.videoFee, note: "" });
  if (input.extend && input.extend.days > 0) {
    const { feePerDay, days } = input.extend;
    lines.push({ label: "📅 着用日数延長", amount: feePerDay * days, note: `${yen(feePerDay)} × 最大${days}日` });
  }
  for (const x of input.extras) lines.push({ label: x.name, amount: x.price, note: "" });

  const subtotal = { min: input.price, max: input.price + lines.reduce((sum, l) => sum + l.amount, 0) };
  const fee = { min: feeOf(subtotal.min, input.feeRate), max: feeOf(subtotal.max, input.feeRate) };
  return { lines, subtotal, fee, net: { min: subtotal.min - fee.min, max: subtotal.max - fee.max } };
}

/** 幅の書き方（同じなら1つ、違えば「〜」でつなぐ） */
export function rangeText(r: Range): string {
  return r.min === r.max ? yen(r.min) : `${yen(r.min)} 〜 ${yen(r.max)}`;
}
