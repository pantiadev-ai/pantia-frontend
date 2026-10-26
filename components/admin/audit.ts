/* 操作の記録（audit_logs）を、管理画面で読める1行の文にする。ダッシュボードとログの画面で使う。
   detail は DB が決まった形で入れる jsonb。形が違っても落ちないよう、1つずつ型を確かめて読む。 */
import { REPORT_TYPES } from "@/lib/labels";
import { san, yen } from "@/lib/format";
import { REPORT_STATUS_LABEL } from "./badges";

export type AuditRow = {
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail: unknown;
};

export type AuditView = {
  icon: string;
  tone: "pk" | "green" | "yellow" | "red" | "blue";
  tag: string;
  text: string;
  href: string | null;
};

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function str(v: unknown): string {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}
function int(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 対象へのリンク（管理画面の中だけ） */
function linkOf(type: string | null, id: string | null): string | null {
  if (!type || !id || !UUID.test(id)) return null;
  switch (type) {
    case "user":
      return `/admin/users/${id}`;
    case "order":
      return `/admin/orders/${id}`;
    case "kyc":
      return `/admin/kyc/${id}`;
    case "listing":
      return `/admin/items?q=${id}`;
    case "payout":
      return "/admin/sales?status=all";
    case "post":
    case "comment":
    case "message":
      return "/admin/moderation";
    default:
      return null;
  }
}

/** 記録の種類の絞り込み（ログの画面の選択肢）。value は action の頭 */
export const AUDIT_KINDS = [
  { value: "", label: "全種別" },
  { value: "user.", label: "ユーザー" },
  { value: "kyc.", label: "本人確認" },
  { value: "listing.", label: "商品" },
  { value: "order.", label: "取引" },
  { value: "payment.", label: "決済" },
  { value: "payout.", label: "振込" },
  { value: "ledger.", label: "台帳" },
  { value: "report.", label: "通報" },
  { value: "moderation.", label: "モデレーション" },
  { value: "review.", label: "レビュー" },
  { value: "settings.", label: "設定" },
] as const;

/** who は操作した人の名前（自動の処理なら null） */
export function describeAudit(row: AuditRow, who: string | null): AuditView {
  const d = obj(row.detail);
  const by = who ? `${san(who)}が` : "";
  const no = int(d.order_no);
  const orderLabel = no != null ? `注文 #${no}` : "注文";
  const href = linkOf(row.target_type, row.target_id);
  const reason = str(d.reason);
  const why = reason ? `（理由: ${reason}）` : "";
  const v = (icon: string, tone: AuditView["tone"], tag: string, text: string): AuditView => ({ icon, tone, tag, text, href });

  switch (row.action) {
    case "user.register":
      return v("👥", "green", "登録", `新しい${d.role === "seller" ? "出品者" : "購入者"}が登録しました`);
    case "user.warn":
      return v("⚠️", "yellow", "警告", `${by}利用者に警告しました${why}`);
    case "user.suspend":
      return v("🚫", "red", "停止", `${by || "自動の処理で"}利用者を停止しました${why}`);
    case "user.unsuspend":
      return v("✅", "green", "停止解除", `${by}利用者の停止を解除しました`);
    case "user.withdraw":
      return d.by_admin === true
        ? v("🚪", "red", "退会", `${by}利用者を強制退会にしました${why}`)
        : v("🚪", "yellow", "退会", `${by}退会しました`);
    case "user.role_request":
      return v("🔄", "blue", "ロール", `${by}${d.to === "seller" ? "出品者" : "購入者"}への変更を申請しました`);
    case "user.role_approve":
      return v("🔄", "green", "ロール", `${by}ロールの変更を承認しました`);
    case "user.role_reject":
      return v("🔄", "red", "ロール", `${by}ロールの変更を却下しました`);
    case "user.proxy_register":
      return v("🤝", "blue", "代理登録", `${by}${d.role === "seller" ? "出品者" : "購入者"}を代理で登録しました`);
    case "user.proxy_link":
      return v("🔗", "blue", "代理登録", `${by}パスワードを決めるリンクを作りました（${int(d.count) ?? 1}回目）`);
    case "user.proxy_handover":
      return v("🤝", "green", "代理登録", `${by}パスワードを決めました（本人に渡りました）`);
    case "listing.publish":
      return v("📦", "pk", "出品", `${by}「${str(d.title)}」を出品しました`);
    case "listing.hidden":
      return v("🙈", "red", "商品", `${by}「${str(d.title)}」を非表示にしました${why}`);
    case "listing.deleted":
      return v("🗑", "red", "商品", `${by}「${str(d.title)}」を削除しました${why}`);
    case "listing.published":
      return v("📦", "green", "商品", `${by}「${str(d.title)}」を公開に戻しました`);
    case "listing.private":
      return v("📦", "blue", "商品", `${by}「${str(d.title)}」を非公開に戻しました`);
    case "order.paid":
      return v("💳", "yellow", "購入", `${by}${yen(int(d.total))}の支払いを済ませました（${orderLabel}）`);
    case "order.complete":
      return v("🤝", "green", "取引", `${orderLabel}が取引完了になりました${d.auto === true ? "（自動）" : ""}`);
    case "order.cancel":
      return v("❌", "red", "注文", `${by}${orderLabel}をキャンセルしました${d.refund === true ? "（返金あり）" : ""}${why}`);
    case "order.seller_cancel":
      return v("❌", "yellow", "注文", `${by}${orderLabel}をキャンセルしました（出品者）${why}`);
    case "order.buyer_cancel_pending":
      return v("❌", "yellow", "注文", `${by}支払い前の注文を${int(d.count) ?? ""}件取り消しました`);
    case "payment.amount_mismatch":
      return v("⚠️", "red", "決済", `決済の金額が合いません（請求 ${yen(int(d.expected))}・受け取り ${yen(int(d.received))}）`);
    case "payment.late_refund_needed":
      return v("⚠️", "red", "決済", `期限が切れた後に支払いが届きました。返金が要ります（${orderLabel}）`);
    case "payout.request":
      return v("💰", "green", "振込", `${by}${yen(int(d.amount))}の振込を申請しました`);
    case "payout.pay":
      return v("✅", "green", "振込", `${by}${yen(int(d.amount))}を振込済みにしました`);
    case "payout.reject":
      return v("❌", "red", "振込", `${by}${yen(int(d.amount))}の振込申請を却下しました${why}`);
    case "ledger.adjust": {
      const amount = int(d.amount) ?? 0;
      return v("🧾", "blue", "台帳", `${by}台帳を ${amount > 0 ? "+" : ""}${amount.toLocaleString("ja-JP")}円 調整しました（${str(d.note)}）`);
    }
    case "kyc.submit":
      return v("🪪", "pk", "KYC", `${by}本人確認を申請しました`);
    case "kyc.proxy_submit":
      return v("🪪", "blue", "KYC", `${by}本人確認を代理で提出しました${d.status === "rejected_underage" ? "（18歳未満のため否認・停止）" : ""}`);
    case "kyc.view_documents":
      return v("👁", "blue", "KYC", `${by}本人確認の書類を見ました`);
    case "kyc.approve":
      return v("✅", "green", "KYC", `${by}本人確認を承認しました`);
    case "kyc.reject":
      return v("❌", "red", "KYC", `${by}本人確認を否認しました${d.underage === true ? "（18歳未満）" : ""}`);
    case "kyc.underage":
      return v("🚫", "red", "KYC", "18歳未満のため、自動で否認・停止しました");
    case "kyc.allow_resubmit":
      return v("🔁", "blue", "KYC", `${by}本人確認の再申請を受け付けました`);
    case "report.file":
      return v("🚩", "red", "通報", `${by}${REPORT_TYPES[row.target_type ?? ""] ?? ""}を通報しました（#R${str(d.report_no)}）`);
    case "review.post":
      return v("⭐", "blue", "レビュー", `${by}★${int(d.rating) ?? ""}のレビューを投稿しました（${orderLabel}）`);
    case "settings.update":
      return v("⚙️", "pk", "設定", `${by}サイト設定を変えました`);
    case "moderation.held":
      return v("🛡", "yellow", "モデレ", `${REPORT_TYPES[row.target_type ?? ""] ?? "投稿"}を自動で保留にしました`);
    case "moderation.approve":
      return v("✅", "green", "モデレ", `${by}保留の${REPORT_TYPES[row.target_type ?? ""] ?? "投稿"}を公開しました`);
    case "moderation.hide":
      return v("🙈", "red", "モデレ", `${by}${REPORT_TYPES[row.target_type ?? ""] ?? "投稿"}を非表示にしました`);
    default:
      if (row.action.startsWith("report.")) {
        const s = row.action.slice("report.".length);
        return v("🚩", "blue", "通報", `${by}通報 #R${str(d.report_no)} を「${REPORT_STATUS_LABEL[s] ?? s}」にしました`);
      }
      return v("📋", "blue", "記録", `${by}${row.action}`);
  }
}
