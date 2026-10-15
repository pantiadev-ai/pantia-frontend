"use client";
/* 二段階認証（認証アプリ・TOTP）。
   ・まだ登録していない人: 「登録を始める」→ QR を読み取る → 6桁を入れる。
   ・登録済みの人: 6桁を入れる。
   済むとサーバー側で /admin へ移る。 */
import { useState, useTransition, type FormEvent } from "react";
import { mfaEnroll, mfaVerify } from "@/lib/actions/admin";

export default function MfaForm({ mode, factorId }: { mode: "enroll" | "verify"; factorId?: string }) {
  const [enrolled, setEnrolled] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const targetId = mode === "verify" ? factorId : enrolled?.factorId;

  function begin() {
    setError(null);
    start(async () => {
      try {
        const r = await mfaEnroll();
        if (r.ok && r.data) setEnrolled(r.data);
        else setError(r.ok ? "登録を始められませんでした。" : r.error);
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e) throw e;
        setError("通信に失敗しました。もう一度お試しください。");
      }
    });
  }

  function verify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!targetId) return;
    const c = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(c)) {
      setError("認証アプリに出ている6桁の数字を入れてください。");
      return;
    }
    setError(null);
    start(async () => {
      try {
        const r = await mfaVerify(targetId, c);
        // 成功したときはサーバー側で /admin へ移るので、ここに来るのは失敗のときだけ
        if (!r.ok) {
          setError(r.error);
          setCode("");
        }
      } catch (err) {
        if (err && typeof err === "object" && "digest" in err) throw err;
        setError("通信に失敗しました。もう一度お試しください。");
      }
    });
  }

  if (mode === "enroll" && !enrolled) {
    return (
      <div className="adm-form">
        <p>管理画面に入るには、二段階認証の登録が要ります。スマホの認証アプリ（Google Authenticator・1Password など）を用意してください。</p>
        {error && (
          <p className="adm-msg error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="adm-save" onClick={begin} disabled={pending}>
          {pending ? "準備中…" : "登録を始める"}
        </button>
      </div>
    );
  }

  return (
    <form className="adm-form" onSubmit={verify}>
      {enrolled && (
        <>
          <p>認証アプリで、この QR コードを読み取ってください。</p>
          {/* QR は Supabase が作った SVG（data URL）。外の URL は読みに行かない */}
          <img className="adm-qr" src={enrolled.qr} alt="二段階認証の QR コード" width={200} height={200} />
          <div>
            <div className="adm-label">読み取れないときは、このキーを手で入れてください</div>
            <code className="adm-code">{enrolled.secret}</code>
          </div>
        </>
      )}
      <div>
        <label className="adm-label" htmlFor="mfa-code">
          認証アプリに出ている6桁のコード
        </label>
        <input
          id="mfa-code"
          className="adm-input adm-mono"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={pending}
          autoFocus
        />
      </div>
      {error && (
        <p className="adm-msg error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="adm-save" disabled={pending || !targetId}>
        {pending ? "確認中…" : "確認する"}
      </button>
    </form>
  );
}
