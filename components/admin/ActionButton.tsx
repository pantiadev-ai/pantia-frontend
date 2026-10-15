"use client";
/* 管理の操作のボタン（押すと確認の窓 → 理由の入力 → 実行）。
   サーバーの画面から関数は渡せないので、操作は op の名前で受け取り、ここで server action に振り分ける。
   対象の id はここでは確かめず、server action 側で zod と DB が確かめる。 */
import { useCallback, useState, useTransition } from "react";
import {
  cancelOrder,
  decideRoleChange,
  kycAllowResubmit,
  moderate,
  payPayout,
  rejectPayout,
  retryRefund,
  setListingStatus,
  setUserStatus,
  updateReport,
  warnUser,
  withdrawUser,
} from "@/lib/actions/admin";
import type { ActionResult } from "@/lib/action-result";
import { toneOf, useFlash } from "./Flash";
import { Modal } from "./Modal";

export type AdminOp =
  | "user.warn"
  | "user.suspend"
  | "user.unsuspend"
  | "user.withdraw"
  | "role.approve"
  | "role.reject"
  | "listing.hide"
  | "listing.publish"
  | "listing.private"
  | "order.cancel"
  | "order.refund"
  | "payout.pay"
  | "payout.reject"
  | "report.open"
  | "report.reviewing"
  | "report.resolved"
  | "report.dismissed"
  | "mod.approve"
  | "mod.hide"
  | "kyc.resubmit";

function call(op: AdminOp, id: string, sub: string, reason: string): Promise<ActionResult> {
  switch (op) {
    case "user.warn":
      return warnUser(id, reason);
    case "user.suspend":
      return setUserStatus(id, "suspended", reason);
    case "user.unsuspend":
      return setUserStatus(id, "active", reason);
    case "user.withdraw":
      return withdrawUser(id, reason);
    case "role.approve":
      return decideRoleChange(id, true, reason);
    case "role.reject":
      return decideRoleChange(id, false, reason);
    case "listing.hide":
      return setListingStatus(id, "hidden", reason);
    case "listing.publish":
      return setListingStatus(id, "published", reason);
    case "listing.private":
      return setListingStatus(id, "private", reason);
    case "order.cancel":
      return cancelOrder(id, reason);
    case "order.refund":
      return retryRefund(id);
    case "payout.pay":
      return payPayout(id);
    case "payout.reject":
      return rejectPayout(id, reason);
    case "report.open":
      return updateReport(id, "open", reason);
    case "report.reviewing":
      return updateReport(id, "reviewing", reason);
    case "report.resolved":
      return updateReport(id, "resolved", reason);
    case "report.dismissed":
      return updateReport(id, "dismissed", reason);
    case "mod.approve":
      return moderate(sub, id, "approve");
    case "mod.hide":
      return moderate(sub, id, "hide");
    case "kyc.resubmit":
      return kycAllowResubmit(id);
  }
}

export default function ActionButton({
  op,
  id,
  sub = "",
  label,
  className = "",
  title,
  body,
  reason = "none",
  reasonLabel = "理由",
  reasonMax = 200,
  confirmLabel = "実行する",
  danger = false,
}: {
  op: AdminOp;
  id: string;
  /** モデレーションの種類（message・post・comment・review） */
  sub?: string;
  label: string;
  /** action-btn に足す色（approve・reject・warn） */
  className?: string;
  title: string;
  body?: string;
  reason?: "none" | "optional" | "required";
  reasonLabel?: string;
  reasonMax?: number;
  confirmLabel?: string;
  danger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const flash = useFlash();

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  function submit() {
    setError(null);
    const why = text.trim();
    if (reason === "required" && why === "") {
      setError(`${reasonLabel}を入力してください。`);
      return;
    }
    start(async () => {
      try {
        const r = await call(op, id, sub, reason === "none" ? "" : why);
        if (r.ok) {
          setOpen(false);
          setText("");
          const msg = r.message ?? "済みました。";
          flash(msg, toneOf(msg));
        } else {
          setError(r.error);
        }
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e) throw e;
        setError("通信に失敗しました。もう一度お試しください。");
      }
    });
  }

  return (
    <>
      <button type="button" className={`action-btn ${className}`.trim()} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <Modal title={title} onClose={close} busy={pending}>
          {body && <p className="adm-pre">{body}</p>}
          {reason !== "none" && (
            <div>
              <label className="adm-label" htmlFor={`r-${op}-${id}`}>
                {reasonLabel}
                {reason === "required" ? "（必須）" : "（任意）"}
              </label>
              <textarea
                id={`r-${op}-${id}`}
                className="adm-textarea"
                value={text}
                maxLength={reasonMax}
                onChange={(e) => setText(e.target.value)}
                disabled={pending}
              />
              <div className="adm-hint">
                {Array.from(text).length} / {reasonMax}文字
              </div>
            </div>
          )}
          {error && (
            <p className="adm-msg error" role="alert">
              {error}
            </p>
          )}
          <div className="adm-modal-actions">
            <button type="button" className="adm-btn" onClick={close} disabled={pending}>
              やめる
            </button>
            <button type="button" className={`adm-btn ${danger ? "danger" : "primary"}`} onClick={submit} disabled={pending}>
              {pending ? "送信中…" : confirmLabel}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
