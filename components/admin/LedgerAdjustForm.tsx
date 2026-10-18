"use client";
/* 台帳の手動の調整（＋で足す・−で引く）。理由は必須。押すと確認の窓を出してから送る。
   利用者の詳細ページでは userId を受け取り、売上・振込管理のページでは利用者 ID を入れてもらう。 */
import { useState, useTransition } from "react";
import { adjustLedger } from "@/lib/actions/admin";
import { toneOf, useFlash } from "./Flash";
import { Modal } from "./Modal";
import { san } from "@/lib/format";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function LedgerAdjustForm({ userId, userName }: { userId?: string; userName?: string }) {
  const [who, setWho] = useState(userId ?? "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [orderNo, setOrderNo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const flash = useFlash();

  const n = Number(amount.replace(/[,，\s]/g, "").replace(/^＋/, "+").replace(/^[−ー－]/, "-"));

  function check(): string | null {
    if (!UUID.test(who.trim())) return "利用者 ID を入れてください（ユーザー管理の詳細ページに出ている ID）。";
    if (amount.trim() === "" || !Number.isInteger(n) || n === 0) return "金額を0以外の整数で入れてください（引くときは −1000 のように）。";
    if (Math.abs(n) > 1_000_000) return "1回の調整は100万円までです。";
    if (note.trim() === "") return "調整の理由を入力してください。";
    if (orderNo.trim() !== "" && !/^#?\d{1,12}$/.test(orderNo.trim())) return "注文番号は数字で入れてください。";
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
        const r = await adjustLedger(who.trim(), n, note, orderNo);
        if (r.ok) {
          setConfirming(false);
          setAmount("");
          setNote("");
          setOrderNo("");
          if (!userId) setWho("");
          const msg = r.message ?? "調整を記録しました。";
          flash(msg, toneOf(msg));
        } else {
          setConfirming(false);
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
      {!userId && (
        <div>
          <label className="adm-label" htmlFor="ledger-user">
            利用者 ID
          </label>
          <input
            id="ledger-user"
            className="adm-input adm-mono"
            value={who}
            onChange={(e) => setWho(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            maxLength={36}
            autoComplete="off"
            disabled={pending}
          />
        </div>
      )}
      <div>
        <label className="adm-label" htmlFor="ledger-amount">
          金額（円。引くときは −）
        </label>
        <input
          id="ledger-amount"
          className="adm-input"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="例: -1200"
          maxLength={9}
          autoComplete="off"
          disabled={pending}
        />
      </div>
      <div>
        <label className="adm-label" htmlFor="ledger-note">
          理由（必須・本人の売上履歴にも出ます）
        </label>
        <input
          id="ledger-note"
          className="adm-input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="例: 返金に伴う差し引き"
          maxLength={100}
          disabled={pending}
        />
      </div>
      <div>
        <label className="adm-label" htmlFor="ledger-order">
          注文番号（任意）
        </label>
        <input
          id="ledger-order"
          className="adm-input"
          inputMode="numeric"
          value={orderNo}
          onChange={(e) => setOrderNo(e.target.value)}
          placeholder="例: 10234"
          maxLength={13}
          autoComplete="off"
          disabled={pending}
        />
      </div>
      {error && (
        <p className="adm-msg error" role="alert">
          {error}
        </p>
      )}
      <div>
        <button type="button" className="adm-save" onClick={open} disabled={pending}>
          調整を記録する
        </button>
      </div>
      {confirming && (
        <Modal title="台帳を調整しますか？" onClose={() => setConfirming(false)} busy={pending}>
          <p>
            {userName ? san(userName) : "この利用者"}の台帳に <strong>{n > 0 ? "+" : ""}{n.toLocaleString("ja-JP")}円</strong> を記録します。
            記録は消せません（間違えたときは、逆の金額で調整し直します）。
          </p>
          <p className="adm-pre">理由: {note.trim()}</p>
          <div className="adm-modal-actions">
            <button type="button" className="adm-btn" onClick={() => setConfirming(false)} disabled={pending}>
              やめる
            </button>
            <button type="button" className="adm-btn primary" onClick={submit} disabled={pending}>
              {pending ? "送信中…" : "記録する"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
