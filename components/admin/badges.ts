/* 管理画面の状態の札（.badge の色と文字）。見本の色の使い方に合わせる。
   サーバーでもブラウザでも使える（server-only の物は import しない）。 */
import { KYC_STATUS, LISTING_STATUS, ORDER_STATUS, PAYOUT_STATUS, REPORT_TYPES } from "@/lib/labels";

export type BadgeInfo = { cls: string; label: string };

const unknown = (v: string | null | undefined): BadgeInfo => ({ cls: "badge-muted", label: v || "不明" });

export function roleBadge(role: string | null | undefined): BadgeInfo {
  if (role === "seller") return { cls: "badge-new", label: "出品者" };
  if (role === "buyer") return { cls: "badge-ship", label: "購入者" };
  return unknown(role);
}

export function userStatusBadge(status: string | null | undefined): BadgeInfo {
  if (status === "active") return { cls: "badge-active", label: "アクティブ" };
  if (status === "suspended") return { cls: "badge-suspend", label: "停止中" };
  if (status === "withdrawn") return { cls: "badge-muted", label: "退会済み" };
  return unknown(status);
}

/** 利用者の本人確認の状態（profiles.kyc_status） */
export function kycBadge(status: string | null | undefined): BadgeInfo {
  const label = KYC_STATUS[status ?? ""] ?? "";
  if (status === "approved") return { cls: "badge-active", label };
  if (status === "pending") return { cls: "badge-pending", label };
  if (status === "rejected") return { cls: "badge-reject", label };
  if (status === "unsubmitted") return { cls: "badge-muted", label };
  return unknown(status);
}

/** 本人確認の申請の状態（kyc_applications.status） */
export function kycAppBadge(status: string | null | undefined): BadgeInfo {
  if (status === "pending") return { cls: "badge-new", label: "未審査" };
  if (status === "reviewing") return { cls: "badge-pending", label: "審査中" };
  if (status === "approved") return { cls: "badge-active", label: "承認済み" };
  if (status === "rejected") return { cls: "badge-reject", label: "否認" };
  return unknown(status);
}

export function listingBadge(status: string | null | undefined): BadgeInfo {
  const label = LISTING_STATUS[status ?? ""] ?? "";
  switch (status) {
    case "published":
      return { cls: "badge-active", label };
    case "private":
      return { cls: "badge-new", label };
    case "sold":
      return { cls: "badge-done", label };
    case "hidden":
      return { cls: "badge-warn", label };
    case "draft":
    case "deleted":
      return { cls: "badge-muted", label };
    default:
      return unknown(status);
  }
}

export function orderBadge(status: string | null | undefined): BadgeInfo {
  const s = ORDER_STATUS[status ?? ""];
  if (!s) return unknown(status);
  const cls = { pending: "badge-pending", new: "badge-new", prep: "badge-ship", shipped: "badge-blue", done: "badge-done", cancel: "badge-reject" }[s.tone];
  return { cls, label: s.label };
}

export function payoutBadge(status: string | null | undefined): BadgeInfo {
  const label = PAYOUT_STATUS[status ?? ""] ?? "";
  if (status === "requested") return { cls: "badge-pending", label };
  if (status === "paid") return { cls: "badge-done", label };
  if (status === "rejected") return { cls: "badge-reject", label };
  return unknown(status);
}

export const REPORT_STATUS_LABEL: Record<string, string> = {
  open: "未対応",
  reviewing: "対応中",
  resolved: "解決済み",
  dismissed: "問題なし",
};

export function reportBadge(status: string | null | undefined): BadgeInfo {
  const label = REPORT_STATUS_LABEL[status ?? ""] ?? "";
  if (status === "open") return { cls: "badge-open", label };
  if (status === "reviewing") return { cls: "badge-pending", label };
  if (status === "resolved") return { cls: "badge-resolved", label };
  if (status === "dismissed") return { cls: "badge-muted", label };
  return unknown(status);
}

export function reportTypeBadge(type: string | null | undefined): BadgeInfo {
  const label = REPORT_TYPES[type ?? ""] ?? "";
  if (type === "listing") return { cls: "badge-new", label: "商品" };
  if (type === "user") return { cls: "badge-ship", label };
  if (type === "post" || type === "comment") return { cls: "badge-blue", label };
  if (type === "message") return { cls: "badge-muted", label };
  return unknown(type);
}
