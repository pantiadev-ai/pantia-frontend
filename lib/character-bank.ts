/* キャラの振込先の口座（admin_character_bank の戻り値）を画面用の形に直す。
   全桁の番号が出るのは、管理画面のユーザーの詳細で、キャラのときだけ（SECURITY.md）。 */

export type BankView = {
  bankName: string;
  branchName: string;
  accountType: "ordinary" | "current";
  accountNumber: string;
  holderKana: string;
  updatedAt: string;
};

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** 口座が無い（null）・形が違うときは null */
export function parseBankView(data: unknown): BankView | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const r = data as Record<string, unknown>;
  const bankName = str(r.bank_name);
  const branchName = str(r.branch_name);
  const accountNumber = str(r.account_number);
  const holderKana = str(r.holder_kana);
  if (bankName === null || branchName === null || accountNumber === null || holderKana === null) return null;
  return {
    bankName,
    branchName,
    accountType: r.account_type === "current" ? "current" : "ordinary",
    accountNumber,
    holderKana,
    updatedAt: str(r.updated_at) ?? "",
  };
}

export function accountTypeLabel(t: BankView["accountType"]): string {
  return t === "current" ? "当座" : "普通";
}
