/* キャラの振込先の口座（admin_character_bank の戻り値）を画面用の形に直す（lib/character-bank.ts） */
import { test } from "node:test";
import assert from "node:assert/strict";
import { accountTypeLabel, parseBankView } from "../../lib/character-bank.ts";

const ROW = {
  bank_name: "テスト銀行",
  branch_name: "本店",
  account_type: "ordinary",
  account_number: "1234567",
  holder_kana: "テスト タロウ",
  updated_at: "2026-11-20T03:00:00Z",
};

test("口座があれば全部の欄を画面用の名前に直す（番号は7桁のまま）", () => {
  assert.deepEqual(parseBankView(ROW), {
    bankName: "テスト銀行",
    branchName: "本店",
    accountType: "ordinary",
    accountNumber: "1234567",
    holderKana: "テスト タロウ",
    updatedAt: "2026-11-20T03:00:00Z",
  });
});

test("口座が無い（null）・形が違うときは null", () => {
  assert.equal(parseBankView(null), null);
  assert.equal(parseBankView(undefined), null);
  assert.equal(parseBankView("1234567"), null);
  assert.equal(parseBankView([ROW]), null);
  assert.equal(parseBankView({ ...ROW, account_number: 1234567 }), null);
  assert.equal(parseBankView({ ...ROW, bank_name: null }), null);
});

test("種別は current だけ当座、それ以外は普通", () => {
  assert.equal(parseBankView({ ...ROW, account_type: "current" })?.accountType, "current");
  assert.equal(parseBankView({ ...ROW, account_type: "savings" })?.accountType, "ordinary");
  assert.equal(accountTypeLabel("current"), "当座");
  assert.equal(accountTypeLabel("ordinary"), "普通");
});

test("更新日が無くても口座は出す（更新日は空）", () => {
  assert.equal(parseBankView({ ...ROW, updated_at: null })?.updatedAt, "");
});
