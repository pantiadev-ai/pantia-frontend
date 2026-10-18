/* DB の値（英字）と、画面に出す日本語の対応。値の一覧は supabase/migrations の check 制約と同じにする。 */

export const CATEGORIES = [
  { value: "panty", label: "パンティ", icon: "🩲" },
  { value: "bra", label: "ブラジャー", icon: "👙" },
  { value: "set", label: "B&Pセット", icon: "💞" },
  { value: "fluid", label: "体液系", icon: "🧴" },
  { value: "clothes", label: "衣類系", icon: "👗" },
  { value: "other", label: "その他", icon: "✨" },
] as const;
export type Category = (typeof CATEGORIES)[number]["value"];

export const MATERIALS = [
  { value: "cotton", label: "コットン" },
  { value: "lace", label: "レース" },
  { value: "silk", label: "シルク" },
  { value: "nylon", label: "ナイロン" },
  { value: "other", label: "その他" },
] as const;

export const COLORS = [
  { value: "white", label: "ホワイト" },
  { value: "black", label: "ブラック" },
  { value: "pink", label: "ピンク" },
  { value: "beige", label: "ベージュ" },
  { value: "blue", label: "ブルー" },
  { value: "other", label: "その他" },
] as const;

export const SIZES = [
  { value: "S", label: "S" },
  { value: "M", label: "M" },
  { value: "L", label: "L" },
  { value: "LL", label: "LL" },
  { value: "free", label: "フリー" },
] as const;

export const SHIP_ESTIMATES = [
  { value: "same_next", label: "即日〜翌日" },
  { value: "d1_2", label: "1〜2日" },
  { value: "d2_3", label: "2〜3日" },
  { value: "d3_5", label: "3〜5日" },
] as const;

export const BODY_TYPES = [
  { value: "slim", label: "スレンダー" },
  { value: "normal", label: "普通" },
  { value: "glamour", label: "グラマー" },
  { value: "chubby", label: "ぽっちゃり" },
] as const;

/** 出品者が対応できる付け物（profiles.supported_options） */
export const SUPPORTED_OPTIONS = [
  { value: "photo", label: "着用写真" },
  { value: "days", label: "着用日数の相談" },
  { value: "same_day", label: "即日発送" },
  { value: "anonymous", label: "匿名配送" },
  { value: "letter", label: "手紙" },
  { value: "request", label: "リクエスト対応" },
  { value: "bundle", label: "まとめ買い" },
] as const;

export const CARRIERS = [
  { value: "yamato", label: "ヤマト運輸" },
  { value: "sagawa", label: "佐川急便" },
  { value: "japanpost", label: "日本郵便" },
  { value: "other", label: "その他" },
] as const;

export const PAYMENT_METHODS = [
  { value: "card", label: "クレジットカード" },
  { value: "paypay", label: "PayPay" },
  { value: "bank", label: "銀行振込" },
  { value: "mock", label: "テスト決済" },
] as const;

export const ORDER_STATUS: Record<string, { label: string; tone: "pending" | "new" | "prep" | "shipped" | "done" | "cancel" }> = {
  pending: { label: "支払い待ち", tone: "pending" },
  paid: { label: "新規注文", tone: "new" },
  preparing: { label: "発送準備中", tone: "prep" },
  shipped: { label: "発送済み", tone: "shipped" },
  completed: { label: "取引完了", tone: "done" },
  cancelled: { label: "キャンセル", tone: "cancel" },
};

export const LISTING_STATUS: Record<string, string> = {
  draft: "下書き",
  published: "公開中",
  private: "非公開",
  sold: "売り切れ",
  hidden: "運営により非公開",
  deleted: "削除済み",
};

export const KYC_STATUS: Record<string, string> = {
  unsubmitted: "未提出",
  pending: "審査中",
  approved: "確認済み",
  rejected: "再提出が必要",
};

export const KYC_DOC_TYPES = [
  { value: "license", label: "運転免許証" },
  { value: "mynumber", label: "マイナンバーカード（顔写真の面だけ）" },
  { value: "passport", label: "パスポート" },
] as const;

export const REPORT_REASONS = [
  { value: "spam", label: "スパム・宣伝" },
  { value: "inappropriate", label: "不適切な内容" },
  { value: "impersonation", label: "なりすまし" },
  { value: "fraud", label: "詐欺・取引のトラブル" },
  { value: "underage", label: "18歳未満の疑い" },
  { value: "harassment", label: "嫌がらせ" },
  { value: "image", label: "画像の問題（顔・個人情報など）" },
  { value: "other", label: "その他" },
] as const;

export const REPORT_TYPES: Record<string, string> = {
  user: "ユーザー",
  listing: "出品",
  post: "つぶやき",
  comment: "コメント",
  message: "メッセージ",
};

export const LEDGER_KINDS: Record<string, string> = {
  sale: "売上",
  payout: "振込申請",
  payout_reversal: "振込の差し戻し",
  refund_clawback: "返金による取り消し",
  adjustment: "運営による調整",
};

export const PAYOUT_STATUS: Record<string, string> = {
  requested: "申請中",
  paid: "振込済み",
  rejected: "差し戻し",
};

export const WORN_FILTERS = [
  { value: "1", label: "1日" },
  { value: "2", label: "2日" },
  { value: "3", label: "3日" },
  { value: "4-5", label: "4〜5日" },
  { value: "6+", label: "6日以上" },
] as const;

export const SORTS = [
  { value: "new", label: "新着順" },
  { value: "pop", label: "人気順" },
  { value: "price_asc", label: "価格の安い順" },
  { value: "price_desc", label: "価格の高い順" },
  { value: "review", label: "評価の高い順" },
] as const;

export function labelOf<T extends { value: string; label: string }>(list: readonly T[], value: string | null | undefined): string {
  return list.find((x) => x.value === value)?.label ?? "";
}

export function categoryLabel(value: string | null | undefined, withIcon = false): string {
  const c = CATEGORIES.find((x) => x.value === value);
  if (!c) return "";
  return withIcon ? `${c.icon} ${c.label}` : c.label;
}
