/* メッセージの同意の状態（版2が今の内容。版1は同意し直しが要る。0023） */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MESSAGE_CONSENT_VERSION, consentState } from "../../lib/message-consent.ts";

test("今の版は 2", () => {
  assert.equal(MESSAGE_CONSENT_VERSION, 2);
});

test("記録が無ければ none", () => {
  assert.equal(consentState(null), "none");
  assert.equal(consentState(undefined), "none");
});

test("版2以上なら current", () => {
  assert.equal(consentState({ version: 2 }), "current");
  assert.equal(consentState({ version: 3 }), "current");
});

test("版1なら outdated（送る前に同意し直し）", () => {
  assert.equal(consentState({ version: 1 }), "outdated");
});

test("版が数でないときは outdated に倒す（送る前にもう一度聞く）", () => {
  assert.equal(consentState({ version: null }), "outdated");
  assert.equal(consentState({ version: Number.NaN }), "outdated");
});
