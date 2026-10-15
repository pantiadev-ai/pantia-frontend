"use client";
/* パスワードを忘れたとき。登録があってもなくても、同じ文を出す（登録の有無を知らせない） */
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { FormMessage, useAction } from "@/components/useAction";
import { requestPasswordReset } from "@/lib/actions/auth";

export default function ResetForm() {
  const { pending, error, message, run } = useAction();
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const bad = touched && !(email.trim().length > 2 && email.includes("@"));

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    if (!(email.trim().length > 2 && email.includes("@"))) return;
    run(() => requestPasswordReset({ email: email.trim() }));
  }

  return (
    <>
      <FormMessage error={error} message={message} />
      {message ? (
        <div className="pt-auth-actions">
          <Link href="/auth" className="btn-go seller">
            ログイン画面へ戻る
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="resetEmail">
              登録したメールアドレス <span className="required">*</span>
            </label>
            <input
              id="resetEmail"
              className={`form-input${bad ? " error" : ""}`}
              type="email"
              placeholder="example@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              maxLength={254}
              aria-invalid={bad || undefined}
              aria-describedby="resetEmailErr"
              required
            />
            <div className={`form-error${bad ? " show" : ""}`} id="resetEmailErr">
              メールアドレスを入力してください
            </div>
          </div>
          <button className="btn-submit seller-mode" type="submit" disabled={pending}>
            {pending ? "送っています…" : "📩 再設定のメールを送る"}
          </button>
        </form>
      )}
      <div className="switch-link">
        <Link href="/auth">ログイン画面へ戻る</Link>
      </div>
    </>
  );
}
