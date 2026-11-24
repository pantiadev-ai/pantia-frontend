/* キャラ（運営で入れた売手）の印を付けられる相手か（lib/character.ts）。DB の admin_mark_character と同じ条件 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { canMarkCharacter, characterBlockReason, discardUnmarked } from "../../lib/character.ts";

const base = { role: "seller", status: "active", kycStatus: "unsubmitted", isProxy: false, isAdmin: false, isSelf: false, marked: false };

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

test("本人確認を出した売手（審査中・却下）には付けられない（印を付けると書類なしで確認済みになるため）", () => {
  assert.equal(canMarkCharacter({ ...base, kycStatus: "pending" }), false);
  assert.equal(canMarkCharacter({ ...base, kycStatus: "rejected" }), false);
});

test("本人確認が未提出か済みの売手には付けられる", () => {
  assert.equal(canMarkCharacter({ ...base, kycStatus: "unsubmitted" }), true);
  assert.equal(canMarkCharacter({ ...base, kycStatus: "approved" }), true);
});

test("代理登録の売手には付けられない", () => {
  assert.equal(canMarkCharacter({ ...base, isProxy: true }), false);
});

/* 「キャラにする」が出ないときに、画面へ出す理由（characterBlockReason）。並びは上から先に当たった物 */
test("付けられる人と、もう印がある人には理由を出さない", () => {
  assert.equal(characterBlockReason(base), null);
  assert.equal(characterBlockReason({ ...base, kycStatus: "approved" }), null);
  assert.equal(characterBlockReason({ ...base, marked: true }), null);
  assert.equal(characterBlockReason({ ...base, marked: true, isProxy: true }), null);
});

test("自分自身・管理者は、それぞれの理由", () => {
  assert.equal(characterBlockReason({ ...base, isSelf: true, isAdmin: true }), "自分自身はキャラにできません。");
  assert.equal(characterBlockReason({ ...base, isAdmin: true, role: "buyer" }), "管理者はキャラにできません。");
});

test("代理登録の人は、新しく作る道を案内する", () => {
  assert.equal(
    characterBlockReason({ ...base, isProxy: true, role: "buyer", status: "suspended" }),
    "代理登録の人は本人のアカウントなので、キャラにできません。キャラは「キャラ」の画面の「キャラを新しく作る」で作ってください。",
  );
});

test("購入者・止めた人・本人確認を出した売手は、それぞれの理由", () => {
  assert.equal(characterBlockReason({ ...base, role: "buyer", status: "suspended" }), "購入者はキャラにできません（キャラにできるのは売手だけです）。");
  assert.equal(characterBlockReason({ ...base, status: "suspended", kycStatus: "pending" }), "利用を止めている人はキャラにできません。");
  assert.equal(characterBlockReason({ ...base, status: "withdrawn" }), "利用を止めている人はキャラにできません。");
  assert.equal(characterBlockReason({ ...base, kycStatus: "pending" }), "本人確認を出した売手はキャラにできません。");
  assert.equal(characterBlockReason({ ...base, kycStatus: "rejected" }), "本人確認を出した売手はキャラにできません。");
});

/* 印を付けられなかったときの後始末（lib/actions/character.ts）。消せなければ、運営が探して片づけられる文を返す */
const who = { id: "11111111-2222-4333-8444-555555555555", nickname: "みゆ" };

test("作ったアカウントを消せたら、何も返さない（もとの失敗の文を出す）", async () => {
  assert.equal(await discardUnmarked(async () => ({ error: null }), who), null);
});

test("消せなかったら、ID と名前と取り戻し方を返す", async () => {
  const left = await discardUnmarked(async () => ({ error: { code: "unexpected_failure", status: 500 } }), who);
  assert.ok(left);
  assert.match(left, /11111111-2222-4333-8444-555555555555/);
  assert.match(left, /「みゆ」/);
  assert.match(left, /「キャラにする」/);
  assert.match(left, /「利用を止める」/);
});

test("消すときに例外が出ても投げ返さず、同じ文を返す", async () => {
  const left = await discardUnmarked(async () => {
    throw new Error("network");
  }, who);
  assert.ok(left);
  assert.match(left, /11111111-2222-4333-8444-555555555555/);
});
