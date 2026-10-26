"use client";
/* 代理登録のフォーム（/admin/proxy）。本人に頼まれたときだけ使う。押すと確認の窓を出してから送る。
   パスワードはここでは決めない（登録のあと、詳細ページでリンクを作って本人に送る）。 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { proxyRegister } from "@/lib/actions/proxy";
import { toneOf, useFlash } from "./Flash";
import { Modal } from "./Modal";
import { san } from "@/lib/format";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ProxyRegisterForm({ closed }: { closed: boolean }) {
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [role, setRole] = useState<"seller" | "buyer" | "">("");
  const [age, setAge] = useState("");
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [adult, setAdult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const flash = useFlash();
  const router = useRouter();

  const n = Number(age.trim());

  function check(): string | null {
    if (!EMAIL.test(email.trim()) || email.trim().length > 254) return "本人のメールアドレスを入れてください。";
    if (nickname.trim() === "") return "呼び名を入力してください。";
    if (nickname.trim().length > 20) return "呼び名は20文字以内で入力してください。";
    if (role === "") return "出品者か購入者かを選んでください。";
    if (role === "seller" && (!Number.isInteger(n) || n < 18 || n > 99)) return "出品者は年齢を18〜99で入力してください（本人の申告）。";
    if (note.length > 200) return "メモは200文字以内で入力してください。";
    if (!consent) return "本人から頼まれ、規約とプライバシーポリシーに同意してもらったことを確かめてください。";
    if (!adult) return "本人が18歳以上だと申告したことを確かめてください。";
    return null;
  }

  function open() {
    const e = check();
    setError(e);
    if (!e) setConfirming(true);
  }

  function submit() {
    start(async () => {
      try {
        const r = await proxyRegister({
          email: email.trim(),
          nickname: nickname.trim(),
          role,
          age: role === "seller" ? n : null,
          note: note.trim(),
          consent,
          adult,
        });
        setConfirming(false);
        if (r.ok) {
          const msg = r.message ?? "代理で登録しました。";
          flash(msg, toneOf(msg));
          if (r.data && UUID.test(r.data.id)) router.push(`/admin/proxy/${r.data.id}`);
          else router.refresh();
        } else {
          setError(r.error);
        }
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e) throw e;
        setConfirming(false);
        setError("通信に失敗しました。もう一度お試しください。");
      }
    });
  }

  return (
    <div className="adm-form">
      {closed && (
        <p className="adm-msg error" role="alert">
          新規登録の受付を止めているため、代理登録もできません。サイト設定で受付を再開してから行ってください。
        </p>
      )}
      <div>
        <label className="adm-label" htmlFor="proxy-email">
          本人のメールアドレス（必須・ログインに使います）
        </label>
        <input
          id="proxy-email"
          className="adm-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="例: hanako@example.com"
          maxLength={254}
          autoComplete="off"
          disabled={pending || closed}
        />
      </div>
      <div>
        <label className="adm-label" htmlFor="proxy-nickname">
          呼び名（必須・20文字まで。サイトに出ます）
        </label>
        <input
          id="proxy-nickname"
          className="adm-input"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={20}
          autoComplete="off"
          disabled={pending || closed}
        />
      </div>
      <div>
        <label className="adm-label" htmlFor="proxy-role">
          使い方（必須）
        </label>
        <select
          id="proxy-role"
          className="adm-select"
          value={role}
          onChange={(e) => setRole(e.target.value as "seller" | "buyer" | "")}
          disabled={pending || closed}
        >
          <option value="">選んでください</option>
          <option value="seller">出品者（売る）</option>
          <option value="buyer">購入者（買う）</option>
        </select>
      </div>
      {role === "seller" && (
        <div>
          <label className="adm-label" htmlFor="proxy-age">
            年齢（出品者は必須・本人の申告。本当の確認は本人確認で行います）
          </label>
          <input
            id="proxy-age"
            className="adm-input"
            inputMode="numeric"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="例: 24"
            maxLength={2}
            autoComplete="off"
            disabled={pending || closed}
          />
        </div>
      )}
      <div>
        <label className="adm-label" htmlFor="proxy-note">
          運営のメモ（任意・200文字まで。本人には見えません）
        </label>
        <textarea
          id="proxy-note"
          className="adm-textarea"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="例: LINE で依頼あり。スマホの操作が苦手なため"
          maxLength={200}
          disabled={pending || closed}
        />
      </div>
      <label className="adm-check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={pending || closed} />
        本人から登録を頼まれ、利用規約とプライバシーポリシーに同意してもらいました
      </label>
      <label className="adm-check">
        <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} disabled={pending || closed} />
        本人が18歳以上だと申告しました（このあと本人確認の書類で確かめます）
      </label>
      {error && (
        <p className="adm-msg error" role="alert">
          {error}
        </p>
      )}
      <div>
        <button type="button" className="adm-save" onClick={open} disabled={pending || closed}>
          代理で登録する
        </button>
      </div>
      {confirming && (
        <Modal title="代理で登録しますか？" onClose={() => setConfirming(false)} busy={pending}>
          <p>
            <strong>{san(nickname.trim())}</strong>（{role === "seller" ? `出品者・${n}歳` : "購入者"}）のアカウントを作ります。
            ログインに使うメールアドレスは <strong>{email.trim()}</strong> です。
          </p>
          <p className="adm-hint">
            作っただけでは出品も購入もできません。本人確認の書類を出して、審査で承認されてから使えます。登録したことは記録に残ります。
          </p>
          <div className="adm-modal-actions">
            <button type="button" className="adm-btn" onClick={() => setConfirming(false)} disabled={pending}>
              やめる
            </button>
            <button type="button" className="adm-btn primary" onClick={submit} disabled={pending}>
              {pending ? "登録中…" : "登録する"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
