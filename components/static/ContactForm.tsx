"use client";
/* お問い合わせのフォーム。送れたら入力欄を空にして、受け付けた旨を出す */
import { useState, type FormEvent } from "react";
import { FormMessage, useAction } from "@/components/useAction";
import { sendContact } from "@/lib/actions/contact";
import { CONTACT_BODY_MAX, CONTACT_TYPES, type ContactType } from "./contact-types";

export default function ContactForm({ defaultEmail, enabled }: { defaultEmail: string; enabled: boolean }) {
  const { pending, error, message, run } = useAction();
  const [type, setType] = useState<ContactType | "">("");
  const [email, setEmail] = useState(defaultEmail);
  const [body, setBody] = useState("");
  const [website, setWebsite] = useState("");
  const [touched, setTouched] = useState(false);

  const len = body.length; // サーバーの数え方（zod の max）に合わせる
  const bad = {
    type: touched && type === "",
    email: touched && !(email.trim().length > 2 && email.includes("@")),
    body: touched && (body.trim() === "" || len > CONTACT_BODY_MAX),
  };

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    if (type === "" || !(email.trim().length > 2 && email.includes("@")) || body.trim() === "" || len > CONTACT_BODY_MAX) return;
    run(
      () => sendContact({ type, email: email.trim(), body, website }),
      () => {
        setBody("");
        setType("");
        setTouched(false);
      },
    );
  }

  const off = !enabled || pending;

  return (
    <form className="pt-cform" onSubmit={submit} noValidate>
      <FormMessage error={error} message={message} />

      <div className="pt-field">
        <label htmlFor="cType">
          お問い合わせの種類<span className="pt-req">*</span>
        </label>
        <select id="cType" value={type} onChange={(e) => setType(e.target.value as ContactType | "")} disabled={off} aria-invalid={bad.type || undefined} required>
          <option value="">選んでください</option>
          {CONTACT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        {bad.type ? <div className="pt-hint ng">種類を選んでください</div> : null}
      </div>

      <div className="pt-field">
        <label htmlFor="cEmail">
          返信先のメールアドレス<span className="pt-req">*</span>
        </label>
        <input
          id="cEmail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          maxLength={254}
          placeholder="example@email.com"
          disabled={off}
          aria-invalid={bad.email || undefined}
          aria-describedby="cEmailHint"
          required
        />
        <div className={`pt-hint${bad.email ? " ng" : ""}`} id="cEmailHint">
          {bad.email ? "メールアドレスを入力してください" : "このアドレスへ運営から返信します"}
        </div>
      </div>

      <div className="pt-field">
        <label htmlFor="cBody">
          内容<span className="pt-req">*</span>
        </label>
        <textarea
          id="cBody"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="注文番号や、起きたことをできるだけ詳しくお書きください（パスワードやカード番号は書かないでください）"
          disabled={off}
          aria-invalid={bad.body || undefined}
          aria-describedby="cBodyCount"
          required
        />
        <div className={`pt-count${len > CONTACT_BODY_MAX ? " ng" : ""}`} id="cBodyCount" aria-live="polite">
          {len} / {CONTACT_BODY_MAX}文字
        </div>
        {bad.body && body.trim() === "" ? <div className="pt-hint ng">内容を入力してください</div> : null}
      </div>

      {/* 人には見えない欄（機械よけ）。読み上げとキーボードからも外す */}
      <div className="pt-hp" aria-hidden="true">
        <label htmlFor="cWebsite">ウェブサイト</label>
        <input id="cWebsite" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>

      <button className="pt-submit" type="submit" disabled={off}>
        {pending ? "送っています…" : "📩 送信する"}
      </button>
    </form>
  );
}
