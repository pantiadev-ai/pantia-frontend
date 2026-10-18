/* アカウント設定で使う選択肢と決まり。画面（client）とサーバー（lib/actions/account.ts）の両方から読む。
   ここには値だけを置く（server 専用の物を import しない）。 */
import type { User } from "@supabase/supabase-js";

export const PREFECTURES = [
  "北海道",
  "青森県",
  "岩手県",
  "宮城県",
  "秋田県",
  "山形県",
  "福島県",
  "茨城県",
  "栃木県",
  "群馬県",
  "埼玉県",
  "千葉県",
  "東京都",
  "神奈川県",
  "新潟県",
  "富山県",
  "石川県",
  "福井県",
  "山梨県",
  "長野県",
  "岐阜県",
  "静岡県",
  "愛知県",
  "三重県",
  "滋賀県",
  "京都府",
  "大阪府",
  "兵庫県",
  "奈良県",
  "和歌山県",
  "鳥取県",
  "島根県",
  "岡山県",
  "広島県",
  "山口県",
  "徳島県",
  "香川県",
  "愛媛県",
  "高知県",
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "大分県",
  "宮崎県",
  "鹿児島県",
  "沖縄県",
] as const;

export type NotifyKey = "notify_order" | "notify_message" | "notify_follow" | "notify_news" | "notify_new_post" | "notify_new_listing";

export type NotifyItem = { key: NotifyKey; name: string; desc: string };

/** 役割ごとに出す通知の設定（並び順もこのまま） */
export const NOTIFY_ITEMS: Record<"seller" | "buyer", NotifyItem[]> = {
  seller: [
    { key: "notify_order", name: "注文の通知", desc: "購入が入ったとき・取引が進んだとき" },
    { key: "notify_message", name: "メッセージの通知", desc: "新しいメッセージが届いたとき" },
    { key: "notify_follow", name: "フォローの通知", desc: "新しくフォローされたとき" },
    { key: "notify_news", name: "運営からのお知らせ", desc: "キャンペーンや大事なお知らせ" },
  ],
  buyer: [
    { key: "notify_message", name: "メッセージの通知", desc: "新しいメッセージが届いたとき" },
    { key: "notify_order", name: "注文の通知", desc: "発送されたとき・取引が進んだとき" },
    { key: "notify_new_post", name: "新しいつぶやき", desc: "フォロー中の出品者がつぶやいたとき" },
    { key: "notify_new_listing", name: "新しい出品", desc: "フォロー中の出品者が出品したとき" },
    { key: "notify_news", name: "運営からのお知らせ", desc: "キャンペーンや大事なお知らせ" },
  ],
};

/** パスワードの決まり（仮。登録の画面と合わせる） */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;
export const PASSWORD_HINT = `${PASSWORD_MIN}〜${PASSWORD_MAX}文字で、英字と数字を両方入れてください。`;

export function passwordOk(s: string): boolean {
  return s.length >= PASSWORD_MIN && s.length <= PASSWORD_MAX && /[A-Za-z]/.test(s) && /[0-9]/.test(s);
}

/** 退会の確認で打ってもらう文字 */
export const WITHDRAW_WORD = "退会する";

/** 全角の数字・ハイフンを半角に直す（郵便番号・電話番号の入力用） */
export function toHalfWidth(s: string): string {
  return s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[‐‑‒–—―ー−－]/g, "-");
}

/** 郵便番号を「123-4567」の形にそろえる。形が違えば null */
export function normalizePostal(s: string): string | null {
  const m = /^(\d{3})-?(\d{4})$/.exec(toHalfWidth(s).replace(/\s/g, ""));
  return m ? `${m[1]}-${m[2]}` : null;
}

/** 電話番号を数字だけにする（DB はハイフン無しの 0 から始まる10〜11桁）。形が違えば null */
export function normalizePhone(s: string): string | null {
  const d = toHalfWidth(s).replace(/[\s()-]/g, "");
  return /^0\d{9,10}$/.test(d) ? d : null;
}

/** 本人確認の写真の欄 */
export const KYC_PHOTO_SLOTS = [
  { key: "front", name: "書類の表", desc: "顔写真のある面。文字がはっきり読めるように", required: true },
  { key: "back", name: "書類の裏", desc: "運転免許証のときだけ（住所が変わっている方）", required: false },
  { key: "selfie", name: "本人と書類", desc: "書類を顔の横に持って、一緒に写した写真", required: true },
] as const;

export type KycPhotoKey = (typeof KYC_PHOTO_SLOTS)[number]["key"];

/** 1枚の上限（サーバーでも同じ数で止める） */
export const KYC_FILE_MAX = 4 * 1024 * 1024;
/** 1回に送る合計の上限（server action の本文の上限 4MB に収める） */
export const KYC_TOTAL_MAX = 3.8 * 1024 * 1024;

/** メールアドレスとパスワードでログインできる人か（Google・X だけの人は false） */
export function usesPassword(user: Pick<User, "app_metadata" | "identities">): boolean {
  const providers = user.app_metadata?.providers as unknown;
  if (Array.isArray(providers)) return providers.includes("email");
  if (user.app_metadata?.provider === "email") return true;
  return (user.identities ?? []).some((i) => i.provider === "email");
}
