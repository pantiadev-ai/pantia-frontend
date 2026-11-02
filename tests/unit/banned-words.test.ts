/* メッセージの禁止ワード（lib/banned-words.ts）。DB の banned_words_ok・banned_word_key と同じ決まりか */
import { test } from "node:test";
import assert from "node:assert/strict";
import { BANNED_WORD_MAX, BANNED_WORDS_MAX, bannedWordKey, bannedWordsError, parseBannedWords } from "../../lib/banned-words.ts";

test("1行に1語。前後の空白と空の行は消す（\\r\\n も1行）", () => {
  assert.deepEqual(parseBannedWords("  LINE \n\n電話番号\r\n   \n"), ["LINE", "電話番号"]);
});

test("同じ語（全角半角・大文字小文字・空白の違いだけ）は最初の1つだけ残す", () => {
  assert.deepEqual(parseBannedWords("line\nＬＩＮＥ\nカカオ\nL I N E\nカカオ"), ["line", "カカオ"]);
});

test("比べる鍵は DB と同じ（NFKC・小文字・空白をすべて消す）", () => {
  assert.equal(bannedWordKey("ＬＩＮＥ　ＩＤ"), "lineid");
  assert.equal(bannedWordKey("ｶｶｵ"), "カカオ");
});

test("決まりどおりなら通る（空も通る）", () => {
  assert.equal(bannedWordsError([]), null);
  assert.equal(bannedWordsError(["LINE", "x".repeat(BANNED_WORD_MAX)]), null);
});

test(`1語は${BANNED_WORD_MAX}字まで`, () => {
  assert.match(bannedWordsError(["x".repeat(BANNED_WORD_MAX + 1)]) ?? "", /30字/);
});

test(`${BANNED_WORDS_MAX}語まで`, () => {
  const list = Array.from({ length: BANNED_WORDS_MAX + 1 }, (_, i) => `語${i}`);
  assert.match(bannedWordsError(list) ?? "", /200語/);
});

test("制御文字・空白だけの語は断る", () => {
  assert.notEqual(bannedWordsError(["a\u0000b"]), null);
  assert.notEqual(bannedWordsError(["　"]), null);
});
