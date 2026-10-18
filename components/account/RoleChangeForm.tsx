"use client";
/* 役割（出品者・購入者）の変更の申請。運営が確かめてから変わる */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestRoleChange } from "@/lib/actions/account";
import { FormMessage, useAction } from "@/components/useAction";

export default function RoleChangeForm({ toLabel }: { toLabel: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { pending, error, message, run } = useAction();
  const router = useRouter();

  return (
    <>
      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-name">{toLabel}に変える</div>
          <div className="setting-desc">申請すると、運営が内容を確かめてから切り替えます。</div>
        </div>
        <button type="button" className="setting-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "閉じる" : "申請する"}
        </button>
      </div>
      {!open && message && <FormMessage message={message} />}
      {open && (
        <form
          className="acc-form"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => requestRoleChange({ reason }),
              () => {
                setReason("");
                setOpen(false);
                router.refresh();
              },
            );
          }}
        >
          <label className="acc-field">
            <span className="acc-label">
              変えたい理由<span className="acc-req">必須</span>
            </span>
            <textarea
              className="acc-input"
              required
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <p className="acc-note">200文字まで。取引中の注文や、残っている売上があると切り替えられないことがあります。</p>
          <FormMessage error={error} message={message} />
          <div className="acc-actions">
            <button type="submit" className="pt-btn primary" disabled={pending || reason.trim() === ""}>
              {pending ? "送信中…" : "申請を送る"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
