/* 支払い方法の名前を、画面の短い文の形にまとめる（トップ・商品ページで使う） */

/** 「クレジットカード・銀行振込」の形（決済会社の名前は省き、同じ名前は1つに）。1つも無ければ空の文字 */
export function payNamesText(names: string[]): string {
  return [...new Set(names.map((n) => n.replace(/（Stripe）$/, "")))].join("・");
}
