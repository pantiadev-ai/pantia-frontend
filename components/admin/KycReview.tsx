"use client";
/* 本人確認の審査（書類を見る → 承認・却下）。
   ・書類は「書類を見る」を押したときだけ、期限つきの URL をもらって出す（押したことは記録に残り、申請は「審査中」になる）。
   ・却下は理由が必須。18歳未満なら却下＋利用停止（再申請は受け付けない）。
   ・決めると書類はすぐに消える（server action 側）。 */
import { useState, useTransition } from "react";
import { kycDecide, kycStartReview } from "@/lib/actions/admin";
import { toneOf, useFlash } from "./Flash";
import { Modal } from "./Modal";

export default function KycReview({ appId, canDecide, purged }: { appId: string; canDecide: boolean; purged: boolean }) {
  const [urls, setUrls] = useState<string[] | null>(null);
  const [viewError, setViewError] = useState<string | null>(null);
  const [approve, setApprove] = useState<boolean | null>(null);
  const [reason, setReason] = useState("");
  const [underage, setUnderage] = useState(false);
  const [resubmit, setResubmit] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [loading, startView] = useTransition();
  const [pending, start] = useTransition();
  const flash = useFlash();

  function view() {
    setViewError(null);
    startView(async () => {
      try {
        const r = await kycStartReview(appId);
        if (r.ok && r.data) setUrls(r.data.urls);
        else setViewError(r.ok ? "書類を開けませんでした。" : r.error);
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e) throw e;
        setViewError("通信に失敗しました。もう一度お試しください。");
      }
    });
  }

  function open() {
    if (approve === null) {
      setError("承認か却下かを選んでください。");
      return;
    }
    if (!approve && reason.trim() === "") {
      setError("却下の理由を入力してください（本人に届きます）。");
      return;
    }
    setError(null);
    setConfirming(true);
  }

  function submit() {
    if (approve === null) return;
    start(async () => {
      try {
        const r = await kycDecide(appId, approve, reason, !approve && underage, !approve && !underage && resubmit);
        setConfirming(false);
        if (r.ok) {
          setUrls(null);
          const msg = r.message ?? "審査を記録しました。";
          flash(msg, toneOf(msg));
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

  const summary =
    approve === true
      ? "この申請を承認します。本人確認済みになり、本人に通知が届きます。"
      : underage
        ? "18歳未満として却下し、この利用者の利用を停止します。再申請は受け付けません。"
        : `この申請を却下します。${resubmit ? "本人は書類を出し直せます。" : "再申請は受け付けません。"}`;

  return (
    <div className="adm-form">
      {/* 書類 */}
      {purged ? (
        <p className="adm-muted">書類は消してあります（審査が済んだ申請は書類を残しません）。</p>
      ) : urls ? (
        <>
          <p className="adm-hint">書類の URL は5分で切れます。見終わったら、この画面を閉じてください。</p>
          <div className="adm-docs">
            {urls.map((u, i) => (
              <a key={u} href={u} target="_blank" rel="noopener noreferrer" aria-label={`書類 ${i + 1} を新しいタブで開く`}>
                <img src={u} alt={`本人確認の書類 ${i + 1}`} referrerPolicy="no-referrer" />
              </a>
            ))}
          </div>
        </>
      ) : (
        <div>
          <button type="button" className="adm-save" onClick={view} disabled={loading}>
            {loading ? "読み込み中…" : "書類を見る（見たことは記録に残ります）"}
          </button>
          {viewError && (
            <p className="adm-msg error" role="alert">
              {viewError}
            </p>
          )}
        </div>
      )}

      {/* 判定 */}
      {canDecide && (
        <fieldset className="adm-form" disabled={pending} style={{ border: "none" }}>
          <legend className="adm-label">判定</legend>
          <label className="adm-check">
            <input type="radio" name="kyc-decision" checked={approve === true} onChange={() => setApprove(true)} />
            承認する
          </label>
          <label className="adm-check">
            <input type="radio" name="kyc-decision" checked={approve === false} onChange={() => setApprove(false)} />
            却下する
          </label>
          {approve === false && (
            <>
              <div>
                <label className="adm-label" htmlFor="kyc-reason">
                  却下の理由（必須・本人に届きます）
                </label>
                <textarea
                  id="kyc-reason"
                  className="adm-textarea"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={200}
                  placeholder="例: 書類の文字が読み取れませんでした。明るい場所で撮り直してください。"
                />
              </div>
              <label className="adm-check">
                <input type="checkbox" checked={underage} onChange={(e) => setUnderage(e.target.checked)} />
                18歳未満（却下し、利用を停止します）
              </label>
              <label className="adm-check">
                <input type="checkbox" checked={resubmit && !underage} disabled={underage} onChange={(e) => setResubmit(e.target.checked)} />
                書類の出し直しを受け付ける
              </label>
            </>
          )}
          {error && (
            <p className="adm-msg error" role="alert">
              {error}
            </p>
          )}
          <div>
            <button type="button" className="adm-save" onClick={open}>
              判定を記録する
            </button>
          </div>
        </fieldset>
      )}

      {confirming && (
        <Modal title={approve ? "承認しますか？" : "却下しますか？"} onClose={() => setConfirming(false)} busy={pending}>
          <p>{summary}</p>
          {!approve && reason.trim() !== "" && <p className="adm-pre">理由: {reason.trim()}</p>}
          <p className="adm-hint">記録すると、書類はすぐに消えます。</p>
          <div className="adm-modal-actions">
            <button type="button" className="adm-btn" onClick={() => setConfirming(false)} disabled={pending}>
              やめる
            </button>
            <button type="button" className={`adm-btn ${approve ? "primary" : "danger"}`} onClick={submit} disabled={pending}>
              {pending ? "送信中…" : approve ? "承認する" : "却下する"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
