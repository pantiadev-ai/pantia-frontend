/* 規約・ヘルプ・プライバシーで共通に使う「サイトの決まりごと」の文。数はなるべく設定・環境変数から取る */
import "server-only";
import { serverEnv } from "@/lib/env";
import { KYC_DOC_TYPES } from "@/lib/labels";

/** 規約などの最終更新日（変えたらここを直す） */
export const TERMS_UPDATED = "2026年9月16日";
export const TERMS_VERSION = "1.0";

export const KYC_DOCS_TEXT = KYC_DOC_TYPES.map((d) => d.label).join("・");

/** 本人確認のやり方の説明（KYC_MODE で変わる） */
export function kycMethodText(): string {
  return serverEnv.kycMode === "trustdock"
    ? "TRUSTDOCK のオンライン本人確認（スマートフォンで完結）"
    : "書類の写真をスマートフォンで撮って送り、運営が目で確かめます";
}

/** 本人確認の書類の扱い（プライバシーの説明用） */
export function kycStorageText(): string {
  return serverEnv.kycMode === "trustdock"
    ? "本人確認は TRUSTDOCK が行い、当サービスは確認の結果を受け取ります"
    : "本人確認の書類の写真は、運営が確認を終えてから7日で消し、確認の結果だけを残します";
}

export type PayMethod = { key: "card" | "paypay" | "bank"; icon: string; name: string; desc: string; limit: string };

const ALL_METHODS: PayMethod[] = [
  { key: "card", icon: "💳", name: "クレジットカード（Stripe）", desc: "Visa / Mastercard / JCB / American Express", limit: "30分" },
  { key: "paypay", icon: "📱", name: "PayPay", desc: "スマートフォンの PayPay で支払い", limit: "30分" },
  {
    key: "bank",
    icon: "🏦",
    name: "銀行振込",
    desc: "注文ごとに専用の振込先（バーチャル口座）を出します。入金を確かめてから取引が始まります",
    limit: "72時間",
  },
];

/** いま使える支払い方法（PAYMENT_METHODS で絞る） */
export function payMethods(): PayMethod[] {
  const on = new Set(serverEnv.paymentMethods);
  return ALL_METHODS.filter((m) => on.has(m.key));
}

/** 「カード・PayPay は30分、銀行振込は72時間」の形 */
export function payLimitText(): string {
  const ms = payMethods();
  const short = ms.filter((m) => m.limit === "30分").map((m) => (m.key === "card" ? "カード" : m.name));
  const parts: string[] = [];
  if (short.length) parts.push(`${short.join("・")}は30分`);
  if (ms.some((m) => m.key === "bank")) parts.push("銀行振込は72時間");
  return parts.join("、");
}
