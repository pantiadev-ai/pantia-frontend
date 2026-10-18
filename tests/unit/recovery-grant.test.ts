/* パスワードの再設定の許可札（lib/recovery-grant.ts）。ログイン中というだけで、今のパスワードなしに変えられないための札 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { RECOVERY_TTL_SEC, checkRecoveryGrant, makeRecoveryGrant } from "../../lib/recovery-grant.ts";

const SECRET = "unit-test-secret-0123456789abcdef";
const UID = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-2222-4333-8444-555555555555";
const NOW = 1_800_000_000;

test("作った札は、同じ人・期限内なら通る", () => {
  const g = makeRecoveryGrant(UID, NOW, SECRET);
  assert.equal(checkRecoveryGrant(g, UID, NOW, SECRET), true);
  assert.equal(checkRecoveryGrant(g, UID, NOW + RECOVERY_TTL_SEC - 1, SECRET), true);
});

test("期限が過ぎた札・ほかの人の札・違う鍵の札は通らない", () => {
  const g = makeRecoveryGrant(UID, NOW, SECRET);
  assert.equal(checkRecoveryGrant(g, UID, NOW + RECOVERY_TTL_SEC, SECRET), false);
  assert.equal(checkRecoveryGrant(g, OTHER, NOW, SECRET), false);
  assert.equal(checkRecoveryGrant(g, UID, NOW, "another-secret-0123456789abcdef"), false);
});

test("手で書き換えた札（人・期限・署名）は通らない", () => {
  const g = makeRecoveryGrant(UID, NOW, SECRET);
  const [, exp, sig] = g.split(".") as [string, string, string];
  assert.equal(checkRecoveryGrant(`${OTHER}.${exp}.${sig}`, OTHER, NOW, SECRET), false);
  assert.equal(checkRecoveryGrant(`${UID}.${Number(exp) + 60}.${sig}`, UID, NOW, SECRET), false);
  const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
  assert.equal(checkRecoveryGrant(`${UID}.${exp}.${flipped}`, UID, NOW, SECRET), false);
});

test("期限が先すぎる札（長く使える札）は、署名が合っても通らない", () => {
  const g = makeRecoveryGrant(UID, NOW + 3600, SECRET);
  assert.equal(checkRecoveryGrant(g, UID, NOW, SECRET), false);
});

test("空・形の違う値・空の鍵は通らない", () => {
  assert.equal(checkRecoveryGrant(undefined, UID, NOW, SECRET), false);
  assert.equal(checkRecoveryGrant("", UID, NOW, SECRET), false);
  assert.equal(checkRecoveryGrant("1", UID, NOW, SECRET), false);
  assert.equal(checkRecoveryGrant(`${UID}.${NOW + 60}`, UID, NOW, SECRET), false);
  assert.equal(checkRecoveryGrant(makeRecoveryGrant(UID, NOW, ""), UID, NOW, ""), false);
});
