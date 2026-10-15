/* DB の関数が投げる「pantia:〇〇」を、画面に出す日本語に直す。
   知らないエラーは中身を出さない（28 §Q2。テーブル名・制約名を利用者に見せない）。 */
import { ActionError } from "@/lib/auth";

const MESSAGES: Record<string, string> = {
  bad_state: "今の状態ではこの操作はできません。画面を読み込み直してください。",
  not_found: "見つかりませんでした。画面を読み込み直してください。",
  unavailable: "この商品は今は購入できません。",
  not_allowed: "この操作の権限がありません。",
  bad_request: "入力の内容を確かめてください。",
  bad_reason: "理由を入力してください。",
  open_orders: "取引中の注文があるため、この操作はできません。取引が終わってからお試しください。",
  payout_open: "振込の申請中のため、この操作はできません。",
  messages_closed: "この相手にはメッセージを送れません。",
  kyc_required: "本人確認（18歳以上の確認）が済んでから使えます。",
  bad_options: "選んだオプションの組み合わせは使えません。",
  bad_message: "メッセージの内容を確かめてください。",
  bad_kyc: "本人確認の内容を確かめてください。",
  bad_items: "カートの中身を確かめてください。",
  too_many_pending: "支払い待ちの注文が多すぎます。先に支払いを済ませるか、時間をおいてください。",
  reserved: "この商品は、ほかの方が購入の手続き中です。",
  request_only: "この商品は、購入の前に出品者へのメッセージが必要です。",
  over_balance: "売上の残高を超えています。",
  not_admin: "権限がありません。",
  no_bank: "先に振込先の口座を登録してください。",
  maintenance: "ただいまメンテナンス中です。しばらくお待ちください。",
  kyc_resubmit_closed: "本人確認の再提出はできません。お問い合わせください。",
  kyc_in_progress: "本人確認の審査中です。結果をお待ちください。",
  cart_full: "カートに入れられるのは30点までです。",
  below_min: "振込申請の最低額に届いていません。",
  balance_left: "売上の残高があるため退会できません。先に振込申請をしてください。",
  bad_tracking: "追跡番号の形を確かめてください（英数字とハイフン4〜30字）。",
  bad_review: "評価（1〜5）と内容を確かめてください。",
  bad_report: "通報の内容を確かめてください。",
  bad_method: "この支払い方法は使えません。",
  bad_address: "お届け先を確かめてください。",
  already_reviewed: "この取引のレビューは投稿済みです。",
  already_requested: "すでに申請しています。結果をお待ちください。",
  already_reported: "この内容はすでに通報済みです。ご協力ありがとうございます。",
  registration_closed: "ただいま新規登録の受付を停止しています。",
};

export type DbError = { message?: string; code?: string; details?: string | null; hint?: string | null } | null | undefined;

/** DB のエラーを画面の文にする */
export function dbMessage(error: DbError, fallback = "うまくいきませんでした。時間をおいて、もう一度お試しください。"): string {
  if (!error) return fallback;
  const m = /pantia:([a-z_]+)/.exec(error.message ?? "");
  if (m && MESSAGES[m[1]!]) return MESSAGES[m[1]!]!;
  switch (error.code) {
    case "42501":
      return "この操作の権限がありません。";
    case "23505":
      return "すでに登録されています。";
    case "23514":
    case "22001":
    case "22P02":
      return "入力の内容を確かめてください。";
    case "PGRST116":
      return "見つかりませんでした。";
  }
  return fallback;
}

/** DB のエラーなら ActionError にして投げる（runAction が画面の文として返す） */
export function throwDb(error: DbError, fallback?: string): void {
  if (!error) return;
  if (!/pantia:/.test(error.message ?? "")) console.error("[db]", error.code, error.message);
  throw new ActionError(dbMessage(error, fallback));
}

/** pantia:〇〇 の名前（画面で分岐したいとき） */
export function dbCode(error: DbError): string | null {
  return /pantia:([a-z_]+)/.exec(error?.message ?? "")?.[1] ?? null;
}
