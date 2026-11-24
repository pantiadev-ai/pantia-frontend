"use client";
/* キャラを最初から作るフォーム（/admin/characters）。押すと確認の窓を出してから送る。
   作れたら、パスワードを決めるリンクを窓に1回だけ出す（運営が別の窓で開いて決める）。 */
import { useState, useTransition } from "react";
import { createCharacter } from "@/lib/actions/character";
import { LinkBox } from "./CharacterLinkIssuer";
import { toneOf, useFlash } from "./Flash";
import { Modal } from "./Modal";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function CharacterCreateForm({ closed }: { closed: boolean }) {
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [age, setAge] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  /** 作れたときの結果（url が null ならリンクだけ作れなかった） */
  const [made, setMade] = useState<{ url: string | null } | null>(null);
  const [pending, start] = useTransition();
  const flash = useFlash();

  const ageText = age.trim();
  const n = Number(ageText);

  function check(): string | null {
    const e = email.trim();
    if (e === "") return "メールアドレスを入れてください。";
    if (!EMAIL.test(e) || e.length > 254) return "メールアドレスの形を確かめてください。";
    if (nickname.trim() === "") return "キャラの名前を入力してください。";
    if (nickname.trim().length > 20) return "キャラの名前は20文字以内で入力してください。";
    if (ageText !== "" && (!Number.isInteger(n) || n < 18 || n > 99)) return "年齢は18〜99で入力してください（空でもかまいません）。";
    if (note.length > 200) return "メモは200文字以内で入力してください。";
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
        const r = await createCharacter({
          email: email.trim(),
          nickname: nickname.trim(),
          age: ageText === "" ? null : n,
          note: note.trim(),
        });
        setConfirming(false);
        if (r.ok && r.data) {
          const msg = r.message ?? "キャラを作りました。";
          flash(msg, toneOf(msg));
          setMade({ url: r.data.url });
          setEmail("");
          setNickname("");
          setAge("");
          setNote("");
          setError(null);
        } else if (!r.ok) {
          setError(r.error);
        }
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e) throw e;
        setConfirming(false);
        setError("通信に失敗しました。もう一度お試しください。");
      }
    });
  }

  const busy = pending || closed;

  return (
    <div className="adm-form">
      {closed && (
        <p className="adm-msg error" role="alert">
          新規登録の受付を止めているため、キャラも作れません。サイト設定で受付を再開してから行ってください。
        </p>
      )}
      <div>
        <label className="adm-label" htmlFor="chara-email">
          メールアドレス（必須・ログインに使います）
        </label>
        <input
          id="chara-email"
          className="adm-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="例: pantia+chara1@gmail.com"
          maxLength={254}
          autoComplete="off"
          disabled={busy}
        />
      </div>
      <div>
        <label className="adm-label" htmlFor="chara-nickname">
          キャラの名前（必須・20文字まで。サイトに出ます）
        </label>
        <input
          id="chara-nickname"
          className="adm-input"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={20}
          autoComplete="off"
          disabled={busy}
        />
      </div>
      <div>
        <label className="adm-label" htmlFor="chara-age">
          年齢（任意・18〜99）
        </label>
        <input
          id="chara-age"
          className="adm-input"
          inputMode="numeric"
          value={age}
          onChange={(e) => setAge(e.target.value)}
          placeholder="例: 24"
          maxLength={2}
          autoComplete="off"
          disabled={busy}
        />
      </div>
      <div>
        <label className="adm-label" htmlFor="chara-note">
          運営のメモ（任意・200文字まで。サイトには出ません）
        </label>
        <textarea
          id="chara-note"
          className="adm-textarea"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          disabled={busy}
        />
      </div>
      {error && (
        <p className="adm-msg error" role="alert">
          {error}
        </p>
      )}
      <div>
        <button type="button" className="adm-save" onClick={open} disabled={busy}>
          キャラを作る
        </button>
      </div>
      {confirming && (
        <Modal title="キャラを作りますか？" onClose={() => setConfirming(false)} busy={pending}>
          <p>
            キャラ「<strong>{nickname.trim()}</strong>」を作ります。ログインに使うメールアドレスは <strong>{email.trim()}</strong> です。
          </p>
          <ul className="adm-hint" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
            <li>メールは運営が受け取れるアドレスにしてください（パスワードを忘れたときの再設定に使います）。</li>
            <li>本人確認は省いて「確認済み」になります。作ったことは記録に残ります。</li>
          </ul>
          <div className="adm-modal-actions">
            <button type="button" className="adm-btn" onClick={() => setConfirming(false)} disabled={pending}>
              やめる
            </button>
            <button type="button" className="adm-btn primary" onClick={submit} disabled={pending}>
              {pending ? "作成中…" : "作る"}
            </button>
          </div>
        </Modal>
      )}
      {made && (
        <Modal title="キャラを作りました" onClose={() => setMade(null)}>
          {made.url ? (
            <LinkBox url={made.url} onClose={() => setMade(null)} />
          ) : (
            <>
              <p>パスワードを決めるリンクを作れませんでした。リンクは下の一覧の「パスワードのリンク」から作り直せます。</p>
              <div className="adm-modal-actions">
                <button type="button" className="adm-btn" onClick={() => setMade(null)}>
                  閉じる
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
