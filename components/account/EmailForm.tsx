"use client";
/* メールアドレスの変更。新しいアドレスに確認のメールが届き、リンクを開くと変わる */
import { useState } from "react";
import { changeEmail } from "@/lib/actions/account";
import { FormMessage, useAction } from "@/components/useAction";

export default function EmailForm({ current }: { current: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const { pending, error, message, run } = useAction();

  return (
    <>
      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-name">メールアドレス</div>
        </div>
        <div className="setting-val">{current || "未登録"}</div>
        <button type="button" className="setting-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "閉じる" : "変更"}
        </button>
      </div>
      {open && (
        <form
          className="acc-form"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => changeEmail({ email }), () => setEmail(""));
          }}
        >
          <label className="acc-field">
            <span className="acc-label">新しいメールアドレス</span>
            <input
              className="acc-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <p className="acc-note">
            新しいアドレスに確認のメールが届きます。メールのリンクを開くまでは、今のアドレスのままです。
          </p>
          <FormMessage error={error} message={message} />
          <div className="acc-actions">
            <button type="submit" className="pt-btn primary" disabled={pending || email.trim() === ""}>
              {pending ? "送信中…" : "確認のメールを送る"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
