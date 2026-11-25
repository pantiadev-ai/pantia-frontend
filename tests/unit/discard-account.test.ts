/* 代理登録の台帳に載せられなかったときの後始末（lib/actions/proxy.ts）。消せなければ、運営が探して片づけられる文を返す */
import { test } from "node:test";
import assert from "node:assert/strict";
import { discardUnregistered } from "../../lib/discard-account.ts";

const who = { id: "11111111-2222-4333-8444-555555555555", nickname: "さくら" };

test("代理登録: 作ったアカウントを消せたら、何も返さない（もとの失敗の文を出す）", async () => {
  assert.equal(await discardUnregistered(async () => ({ error: null }), who), null);
});

test("代理登録: 消せなかったら、ID と名前と、利用を停止する片づけ方を返す", async () => {
  const left = await discardUnregistered(async () => ({ error: { code: "unexpected_failure", status: 500 } }), who);
  assert.ok(left);
  assert.match(left, /11111111-2222-4333-8444-555555555555/);
  assert.match(left, /「さくら」/);
  assert.match(left, /「利用を停止」/);
  // 同じメールでやり直すと「もう登録されています」で断られるので、その先も書く
  assert.match(left, /同じメールアドレス/);
});

test("代理登録: 消すときに例外が出ても投げ返さず、同じ文を返す", async () => {
  const left = await discardUnregistered(async () => {
    throw new Error("network");
  }, who);
  assert.ok(left);
  assert.match(left, /11111111-2222-4333-8444-555555555555/);
});
