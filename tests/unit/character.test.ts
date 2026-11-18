/* キャラ（運営で入れた売手）の印を付けられる相手か（lib/character.ts）。DB の admin_mark_character と同じ条件 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { canMarkCharacter } from "../../lib/character.ts";

const base = { role: "seller", status: "active", isAdmin: false, isSelf: false, marked: false };

test("利用中の売手で、管理者でも自分でもなく、まだ印が無い人だけ付けられる", () => {
  assert.equal(canMarkCharacter(base), true);
});

test("購入者には付けられない", () => {
  assert.equal(canMarkCharacter({ ...base, role: "buyer" }), false);
});

test("停止中・退会済みの売手には付けられない", () => {
  assert.equal(canMarkCharacter({ ...base, status: "suspended" }), false);
  assert.equal(canMarkCharacter({ ...base, status: "withdrawn" }), false);
});

test("管理者・自分・もう印がある人には付けられない", () => {
  assert.equal(canMarkCharacter({ ...base, isAdmin: true }), false);
  assert.equal(canMarkCharacter({ ...base, isSelf: true }), false);
  assert.equal(canMarkCharacter({ ...base, marked: true }), false);
});
