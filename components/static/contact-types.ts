/* お問い合わせの種類と、入力の長さ。画面と server action の両方から読むので何も import しない */

export const CONTACT_TYPES = [
  { value: "order", label: "取引・注文について" },
  { value: "kyc", label: "本人確認について" },
  { value: "payout", label: "売上・振込について" },
  { value: "account", label: "アカウント・ログインについて" },
  { value: "suspended", label: "利用停止について" },
  { value: "report", label: "違反の報告" },
  { value: "bug", label: "不具合の報告" },
  { value: "other", label: "その他" },
] as const;

export type ContactType = (typeof CONTACT_TYPES)[number]["value"];

export const CONTACT_BODY_MAX = 2000;
