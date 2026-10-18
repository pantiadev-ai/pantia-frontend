"use client";
/* パスワードの変更。今のパスワードを確かめてから変える。Google・X だけでログインしている人には出さない */
import { useState } from "react";
import { changePassword } from "@/lib/actions/account";
import { FormMessage, useAction } from "@/components/useAction";
import { PASSWORD_HINT, PASSWORD_MAX, passwordOk } from "@/components/account/options";

export default function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const { pending, error, message, run, setError } = useAction();

  if (!hasPassword) {
    return (
      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-name">パスワード</div>
          <div className="setting-desc">Google・X でログインしているため、パスワードはありません。</div>
        </div>
        <div className="setting-val">―</div>
      </div>
    );
  }

  return (
    <>
      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-name">パスワード</div>
        </div>
        <div className="setting-val">••••••••</div>
        <button type="button" className="setting-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "閉じる" : "変更"}
        </button>
      </div>
      {open && (
        <form
          className="acc-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!passwordOk(next)) {
              setError(`新しいパスワードは${PASSWORD_HINT}`);
              return;
            }
            if (next !== again) {
              setError("新しいパスワードが、確認の欄と合っていません。");
              return;
            }
            run(
              () => changePassword({ current, next }),
              () => {
                setCurrent("");
                setNext("");
                setAgain("");
              },
            );
          }}
        >
          <label className="acc-field">
            <span className="acc-label">今のパスワード</span>
            <input
              className="acc-input"
              type="password"
              autoComplete="current-password"
              required
              maxLength={PASSWORD_MAX}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <div className="acc-grid">
            <label className="acc-field">
              <span className="acc-label">新しいパスワード</span>
              <input
                className="acc-input"
                type="password"
                autoComplete="new-password"
                required
                maxLength={PASSWORD_MAX}
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </label>
            <label className="acc-field">
              <span className="acc-label">新しいパスワード（確認）</span>
              <input
                className="acc-input"
                type="password"
                autoComplete="new-password"
                required
                maxLength={PASSWORD_MAX}
                value={again}
                onChange={(e) => setAgain(e.target.value)}
              />
            </label>
          </div>
          <p className="acc-note">{PASSWORD_HINT}変えると、ほかの端末ではログインし直しになります。</p>
          <FormMessage error={error} message={message} />
          <div className="acc-actions">
            <button type="submit" className="pt-btn primary" disabled={pending || !current || !next || !again}>
              {pending ? "変更中…" : "パスワードを変える"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
