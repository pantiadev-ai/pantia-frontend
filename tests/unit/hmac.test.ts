/* webhook の署名の確かめ（lib/hmac.ts）。本人確認の会社からの通知で使う */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyHmacSha256Hex } from "../../lib/hmac.ts";

const SECRET = "unit-test-secret-0123456789abcdef";
const BODY = JSON.stringify({ event_id: "evt_1", ref: "ref_1", result: "approved" });
const sign = (body: string, secret = SECRET) => createHmac("sha256", secret).update(body, "utf8").digest("hex");

test("正しい署名は通る（前の sha256= ・大文字・前後の空白があってもよい）", () => {
  const hex = sign(BODY);
  assert.equal(verifyHmacSha256Hex(BODY, hex, SECRET), true);
  assert.equal(verifyHmacSha256Hex(BODY, `sha256=${hex}`, SECRET), true);
  assert.equal(verifyHmacSha256Hex(BODY, ` ${hex.toUpperCase()} `, SECRET), true);
});

test("違う鍵・書き換えた本文の署名は通らない", () => {
  assert.equal(verifyHmacSha256Hex(BODY, sign(BODY, "another-secret-0123456789abcdef"), SECRET), false);
  assert.equal(verifyHmacSha256Hex(BODY.replace("approved", "rejected"), sign(BODY), SECRET), false);
  assert.equal(verifyHmacSha256Hex(`${BODY} `, sign(BODY), SECRET), false);
});

test("署名が無い・鍵が空・形が違う物は通らない", () => {
  const hex = sign(BODY);
  assert.equal(verifyHmacSha256Hex(BODY, null, SECRET), false);
  assert.equal(verifyHmacSha256Hex(BODY, "", SECRET), false);
  assert.equal(verifyHmacSha256Hex(BODY, hex, ""), false);
  assert.equal(verifyHmacSha256Hex(BODY, hex.slice(0, 63), SECRET), false);
  assert.equal(verifyHmacSha256Hex(BODY, `${hex}00`, SECRET), false);
  assert.equal(verifyHmacSha256Hex(BODY, `${hex.slice(0, 63)}z`, SECRET), false);
  assert.equal(verifyHmacSha256Hex(BODY, Buffer.from(sign(BODY), "hex").toString("base64"), SECRET), false);
});

test("空の本文でも、その署名なら通り、ほかの本文の署名では通らない", () => {
  assert.equal(verifyHmacSha256Hex("", sign(""), SECRET), true);
  assert.equal(verifyHmacSha256Hex("", sign(BODY), SECRET), false);
});
