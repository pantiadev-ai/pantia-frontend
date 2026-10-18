"use client";
/* 新しいパスワードを決める（再設定メールのリンクから来た人だけ）。
   expired = メールのリンクを通った札が無い・期限切れ。変えた直後も札を消すので expired になるが、変えた旨の表示を先に出す */
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { FormMessage, useAction } from "@/components/useAction";
import { updatePassword } from "@/lib/actions/auth";
import { PASSWORD_MAX, isStrongPassword, passwordHint } from "./rules";

export default function UpdatePasswordForm({ expired }: { expired: boolean }) {
  const { pending, error, message, run } = useAction();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [touched, setTouched] = useState(false);
  const hint = passwordHint(password);
  const pwBad = touched && !isStrongPassword(password);
  const confirmBad = touched && confirm !== password;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    if (!isStrongPassword(password) || confirm !== password) return;
    run(
      () => updatePassword({ password, confirm }),
      () => {
        // 変えたあとは入力欄から消す
        setPassword("");
        setConfirm("");
        setTouched(false);
      },
    );
  }

  if (message) {
    return (
      <>
        <FormMessage message={message} />
        <div className="pt-auth-actions">
          <Link href="/mypage" className="btn-go seller">
            マイページへ →
          </Link>
        </div>
      </>
    );
  }

  if (expired) {
    return (
      <>
        <div className="pt-auth-text" role="status">
          <p>このページは、パスワードの再設定のメールのリンクから開いてください。リンクを開いてから15分たつと使えなくなります。</p>
        </div>
        <div className="pt-auth-actions">
          <Link href="/auth/reset" className="btn-go seller">
            再設定のメールを送る →
          </Link>
        </div>
      </>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <FormMessage error={error} />
      {/* パスワード管理ソフトのための見えない欄は置かない（メールアドレスを画面に出さないため） */}
      <div className="form-group">
        <label className="form-label" htmlFor="newPw">
          新しいパスワード <span className="required">*</span>
        </label>
        <div className="pw-wrap">
          <input
            id="newPw"
            className={`form-input${pwBad ? " error" : ""}`}
            type={visible ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="8〜72文字（英字と数字）"
            autoComplete="new-password"
            maxLength={PASSWORD_MAX}
            aria-invalid={pwBad || undefined}
            aria-describedby="newPwHint"
            style={{ paddingRight: 44 }}
            required
          />
          <button
            className="pw-toggle"
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "パスワードを隠す" : "パスワードを表示する"}
            aria-pressed={visible}
          >
            {visible ? "🙈" : "👁"}
          </button>
        </div>
        <div className={`form-hint${hint.ok === true ? " ok" : hint.ok === false ? " ng" : ""}`} id="newPwHint" aria-live="polite">
          {hint.text}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="newPwConf">
          新しいパスワード（確認） <span className="required">*</span>
        </label>
        <input
          id="newPwConf"
          className={`form-input${confirmBad ? " error" : ""}`}
          type={visible ? "text" : "password"}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="もう一度入力"
          autoComplete="new-password"
          maxLength={PASSWORD_MAX}
          aria-invalid={confirmBad || undefined}
          aria-describedby="newPwConfErr"
          required
        />
        <div className={`form-error${confirmBad ? " show" : ""}`} id="newPwConfErr">
          パスワードが一致しません
        </div>
      </div>

      <button className="btn-submit seller-mode" type="submit" disabled={pending}>
        {pending ? "変更しています…" : "🔒 パスワードを変更する"}
      </button>
    </form>
  );
}
