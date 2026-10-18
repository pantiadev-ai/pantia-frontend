"use client";
/* 振込先の口座。登録済みなら下4桁だけ見せ、「変更する」で入れ直す（口座番号は画面に戻さない） */
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAction, FormMessage } from "@/components/useAction";
import { saveBankAccount } from "@/lib/actions/payout";

export type BankView = {
  bankName: string;
  branchName: string;
  accountType: "ordinary" | "current";
  last4: string;
  holderKana: string;
};

const TYPE_LABEL = { ordinary: "普通", current: "当座" } as const;

function toHalfDigits(s: string): string {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}
function toKatakana(s: string): string {
  return s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

export default function BankAccountForm({ current }: { current: BankView | null }) {
  const router = useRouter();
  const { pending, error, message, run, setError } = useAction();
  const [editing, setEditing] = useState(current === null);
  const [bankName, setBankName] = useState(current?.bankName ?? "");
  const [branchName, setBranchName] = useState(current?.branchName ?? "");
  const [accountType, setAccountType] = useState<"ordinary" | "current">(current?.accountType ?? "ordinary");
  const [accountNumber, setAccountNumber] = useState("");
  const [holderKana, setHolderKana] = useState(current?.holderKana ?? "");

  function submit(e: FormEvent) {
    e.preventDefault();
    const num = toHalfDigits(accountNumber).replace(/[\s-]/g, "");
    const kana = toKatakana(holderKana).trim();
    if (!bankName.trim() || !branchName.trim()) return setError("銀行名と支店名を入れてください。");
    if (!/^[0-9]{7}$/.test(num)) return setError("口座番号は7桁の数字で入れてください。");
    if (!/^[ァ-ヶー　 ]{1,30}$/.test(kana)) return setError("口座名義はカタカナで入れてください（30字まで）。");
    run(
      () =>
        saveBankAccount({
          bank_name: bankName,
          branch_name: branchName,
          account_type: accountType,
          account_number: num,
          holder_kana: kana,
        }),
      () => {
        setAccountNumber("");
        setEditing(false);
        router.refresh();
      },
    );
  }

  if (!editing && current) {
    return (
      <div>
        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-name">登録口座</div>
            <div className="setting-desc">
              {current.bankName} {current.branchName} {TYPE_LABEL[current.accountType]} {current.last4}
              <br />
              名義：{current.holderKana}
            </div>
          </div>
          <button type="button" className="setting-btn" onClick={() => setEditing(true)}>
            変更
          </button>
        </div>
        <FormMessage message={message} />
      </div>
    );
  }

  return (
    <form className="mp-form" onSubmit={submit} noValidate>
      <div className="mp-row">
        <div className="mp-field">
          <label className="mp-label" htmlFor="bk-bank">
            銀行名<span className="mp-req">必須</span>
          </label>
          <input
            id="bk-bank"
            className="mp-input"
            type="text"
            maxLength={30}
            placeholder="例：みずほ銀行"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
          />
        </div>
        <div className="mp-field">
          <label className="mp-label" htmlFor="bk-branch">
            支店名<span className="mp-req">必須</span>
          </label>
          <input
            id="bk-branch"
            className="mp-input"
            type="text"
            maxLength={30}
            placeholder="例：渋谷支店"
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
          />
        </div>
        <div className="mp-field">
          <label className="mp-label" htmlFor="bk-type">
            口座の種類<span className="mp-req">必須</span>
          </label>
          <select
            id="bk-type"
            className="mp-select"
            value={accountType}
            onChange={(e) => setAccountType(e.target.value === "current" ? "current" : "ordinary")}
          >
            <option value="ordinary">普通</option>
            <option value="current">当座</option>
          </select>
        </div>
        <div className="mp-field">
          <label className="mp-label" htmlFor="bk-number">
            口座番号（7桁）<span className="mp-req">必須</span>
          </label>
          <input
            id="bk-number"
            className="mp-input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={9}
            placeholder={current ? `今の口座 ${current.last4}` : "例：1234567"}
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
          />
          {current && <span className="mp-hint">変更するときも、口座番号7桁をもう一度入れてください。</span>}
        </div>
      </div>
      <div className="mp-field">
        <label className="mp-label" htmlFor="bk-holder">
          口座名義（カタカナ）<span className="mp-req">必須</span>
        </label>
        <input
          id="bk-holder"
          className="mp-input"
          type="text"
          maxLength={30}
          placeholder="例：ヤマダ ハナコ"
          value={holderKana}
          onChange={(e) => setHolderKana(e.target.value)}
        />
        <span className="mp-hint">通帳に書かれた名義と同じにしてください。ひらがなで入れても、カタカナに直して保存します。</span>
      </div>
      <FormMessage error={error} />
      <div className="mp-actions">
        <button type="submit" className="mp-btn primary" disabled={pending}>
          {pending ? "保存しています…" : "口座を保存する"}
        </button>
        {current && (
          <button
            type="button"
            className="mp-btn"
            disabled={pending}
            onClick={() => {
              setError(null);
              setAccountNumber("");
              setEditing(false);
            }}
          >
            やめる
          </button>
        )}
      </div>
    </form>
  );
}
