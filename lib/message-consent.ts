/* メッセージの同意の状態。版2（0023）から、運営が理由を記録して会話を確かめることも同意の中身に入った。
   版1だけの人は、次に送る前に同意し直す（DB の send_message も version >= 2 を見る） */
export const MESSAGE_CONSENT_VERSION = 2;

export type ConsentState = "current" | "outdated" | "none";

export function consentState(row: { version: number | null } | null | undefined): ConsentState {
  if (!row) return "none";
  return typeof row.version === "number" && row.version >= MESSAGE_CONSENT_VERSION ? "current" : "outdated";
}
