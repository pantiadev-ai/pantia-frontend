"use client";
/* キャラの振込先の口座（ユーザーの詳細の画面・キャラのときだけ）。
   ・番号は「口座を表示」を押すまで出さない。押すと全桁を出し、見たことが記録に残る（bank_account.view）。
   ・一般の売手の口座はここでは出せない（DB が断る。画面では下4桁のまま）。 */
import { useState, useTransition } from "react";
import { viewCharacterBank } from "@/lib/actions/admin";
import { accountTypeLabel, type BankView } from "@/lib/character-bank";
import { dateTimeJst } from "@/lib/format";
import { Dl } from "./parts";

export default function CharacterBank({ userId }: { userId: string }) {
  // undefined＝まだ押していない、null＝口座が登録されていない
  const [bank, setBank] = useState<BankView | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, start] = useTransition();

  function view() {
    setError(null);
    start(async () => {
      try {
        const r = await viewCharacterBank(userId);
        if (r.ok) setBank(r.data ?? null);
        else setError(r.error);
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e) throw e;
        setError("通信に失敗しました。もう一度お試しください。");
      }
    });
  }

  return (
    <div className="adm-form">
      {bank === undefined ? (
        <div>
          <button type="button" className="adm-save" onClick={view} disabled={loading}>
            {loading ? "読み込み中…" : "口座を表示"}
          </button>
          {error && (
            <p className="adm-msg error" role="alert">
              {error}
            </p>
          )}
        </div>
      ) : bank === null ? (
        <p className="adm-muted">まだ登録されていません</p>
      ) : (
        // 長い支店名・名義でも狭い幅で折り返す
        <div style={{ overflowWrap: "anywhere" }}>
          <Dl
            rows={[
              ["銀行名", bank.bankName],
              ["支店名", bank.branchName],
              ["種別", accountTypeLabel(bank.accountType)],
              ["口座番号", <span key="no" style={{ fontVariantNumeric: "tabular-nums", letterSpacing: "0.05em" }}>{bank.accountNumber}</span>],
              ["名義（カナ）", bank.holderKana],
              ["更新日", bank.updatedAt ? dateTimeJst(bank.updatedAt) : ""],
            ]}
          />
        </div>
      )}
      <p className="adm-hint">表示した記録が残ります（誰がいつ見たか）。</p>
    </div>
  );
}
