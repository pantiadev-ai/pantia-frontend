"use client";
/* 振込の申請。金額を入れる → 確かめる → 申請済み の3段。
   申請は1回だけ（押している間・申請の後は押せない）。最終の確かめは DB の request_payout が行う。 */
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction, FormMessage } from "@/components/useAction";
import { requestPayout } from "@/lib/actions/payout";
import { yen } from "@/lib/format";

type Props = {
  balance: number;
  minPayout: number;
  payoutFee: number;
  /** 伏せた口座の表示（例「みずほ銀行 渋谷支店 普通 ****1234」）。口座が無ければ null */
  bankLabel: string | null;
  kycOk: boolean;
  /** 申請中の振込があるか */
  hasOpen: boolean;
};

type Step = "input" | "confirm" | "done";

function toHalfDigits(s: string): string {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

export default function PayoutRequestForm({ balance, minPayout, payoutFee, bankLabel, kycOk, hasOpen }: Props) {
  const router = useRouter();
  const { pending, error, run, setError } = useAction();
  const [step, setStep] = useState<Step>("input");
  const [amountText, setAmountText] = useState(String(Math.max(0, balance)));
  const [amount, setAmount] = useState(0);
  const sent = useRef(false);

  // 申請できない理由（上から順に1つだけ出す）
  let blocked: ReactNode = null;
  if (!kycOk) {
    blocked = (
      <>
        振込の申請には本人確認が必要です。<Link href="/kyc">本人確認へ →</Link>
      </>
    );
  } else if (!bankLabel) {
    blocked = "先に、下の「振込口座」で振込先の口座を登録してください。";
  } else if (hasOpen) {
    blocked = "申請中の振込があります。振込が終わってから、次の申請ができます。";
  } else if (balance < minPayout) {
    blocked = `残高が最低振込額（${yen(minPayout)}）に届いていません。`;
  } else if (balance <= payoutFee) {
    blocked = "残高が振込手数料より少ないため、申請できません。";
  }

  function toConfirm(e: FormEvent) {
    e.preventDefault();
    const n = Number(toHalfDigits(amountText).replace(/[,\s円¥]/g, ""));
    if (!Number.isInteger(n) || n <= 0) return setError("申請する金額を数字で入れてください。");
    if (n < minPayout) return setError(`${yen(minPayout)}から申請できます。`);
    if (n <= payoutFee) return setError("振込手数料より多い金額を入れてください。");
    if (n > balance) return setError("残高より多い金額は申請できません。");
    setError(null);
    setAmount(n);
    setStep("confirm");
  }

  function submit() {
    if (sent.current || pending) return;
    sent.current = true;
    run(
      async () => {
        try {
          return await requestPayout(amount);
        } finally {
          // 失敗したときは、もう一度押せるように戻す（成功したら「申請済み」の表示に替わる）
          sent.current = false;
        }
      },
      () => {
        setStep("done");
        router.refresh();
      },
    );
  }

  if (step === "done") {
    return (
      <div className="mp-confirm" role="status">
        <strong>振込を申請しました。</strong>
        <br />
        {yen(amount - payoutFee)} を、登録の口座へ振り込みます。申請後3〜5営業日でご指定口座に振込されます。
      </div>
    );
  }

  if (blocked) {
    return (
      <>
        <button type="button" className="btn-payout" disabled>
          🏦 振込申請する
        </button>
        <p className="mp-hint" style={{ marginTop: 8 }}>
          {blocked}
        </p>
      </>
    );
  }

  if (step === "confirm") {
    // 失敗したとき（残高が変わった等）は、金額を直せるように戻れる
    return (
      <div className="mp-form">
        <div className="mp-confirm">
          <div className="mp-sum-row">
            <span>申請額</span>
            <strong>{yen(amount)}</strong>
          </div>
          <div className="mp-sum-row">
            <span>振込手数料</span>
            <strong>- {yen(payoutFee)}</strong>
          </div>
          <div className="mp-sum-row">
            <span>振り込まれる額</span>
            <strong>{yen(amount - payoutFee)}</strong>
          </div>
          <div className="mp-sum-row">
            <span>振込先</span>
            <span>{bankLabel}</span>
          </div>
        </div>
        <FormMessage error={error} />
        <div className="mp-actions">
          <button type="button" className="btn-payout" onClick={submit} disabled={pending}>
            {pending ? "申請しています…" : "🏦 この内容で申請する"}
          </button>
          <button
            type="button"
            className="mp-btn"
            disabled={pending}
            onClick={() => {
              setError(null);
              setStep("input");
            }}
          >
            金額を直す
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="mp-form" onSubmit={toConfirm} noValidate>
      <div className="mp-field">
        <label className="mp-label" htmlFor="po-amount">
          申請する金額（円）
        </label>
        <input
          id="po-amount"
          className="mp-input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          style={{ maxWidth: 220 }}
        />
        <span className="mp-hint">
          {yen(minPayout)}から、残高 {yen(balance)} まで申請できます。振込手数料 {yen(payoutFee)} を引いた額を振り込みます。
        </span>
      </div>
      <div className="balance-note" style={{ fontSize: 12, color: "var(--text-sub)", fontWeight: 500 }}>
        登録口座：{bankLabel}
      </div>
      <FormMessage error={error} />
      <div className="mp-actions">
        <button type="submit" className="btn-payout">
          🏦 振込申請する
        </button>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
        ※ 申請後3〜5営業日でご指定口座に振込されます
      </div>
    </form>
  );
}
