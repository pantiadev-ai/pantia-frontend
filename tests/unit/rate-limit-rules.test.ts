/* 回数の上限の表と、IP の読み方（28 §B7） */
import { test } from "node:test";
import assert from "node:assert/strict";
import { RULES, bucketKey, clientIp, tooManyMessage } from "../../lib/rate-limit-rules.ts";

const h = (m: Record<string, string>) => ({ get: (k: string) => m[k.toLowerCase()] ?? null });

test("枠の名前は重ならない・数は正", () => {
  const names = Object.values(RULES).map((r) => r.name);
  assert.equal(new Set(names).size, names.length);
  for (const r of Object.values(RULES)) {
    assert.ok(r.max > 0 && r.windowSec > 0, r.name);
  }
});

test("台帳の名前に IP・メールアドレスをそのまま入れない", () => {
  const k = bucketKey({ rule: RULES.loginEmail, kind: "email", id: "Taro@Example.com " });
  assert.ok(!k.includes("taro"));
  assert.match(k, /^login\.email:email:[0-9a-f]{32}$/);
  // 大文字・前後の空白は同じ人として数える
  assert.equal(k, bucketKey({ rule: RULES.loginEmail, kind: "email", id: "taro@example.com" }));
});

test("IP は Vercel の見出しを先に見る・空の見出しは飛ばす", () => {
  assert.equal(clientIp(h({ "x-vercel-forwarded-for": "1.2.3.4", "x-forwarded-for": "9.9.9.9" })), "1.2.3.4");
  assert.equal(clientIp(h({ "x-vercel-forwarded-for": "", "x-real-ip": "5.6.7.8" })), "5.6.7.8");
  assert.equal(clientIp(h({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" })), "9.9.9.9");
  assert.equal(clientIp(h({})), "");
});

test("IPv6 は /64 にまとめる・形の違う値は捨てる", () => {
  assert.equal(clientIp(h({ "x-real-ip": "2001:db8:1:2:aaaa::1" })), "2001:db8:1:2::/64");
  assert.equal(clientIp(h({ "x-real-ip": "2001:db8:1:2:bbbb::9" })), "2001:db8:1:2::/64");
  assert.equal(clientIp(h({ "x-real-ip": "::ffff:1.2.3.4" })), "1.2.3.4");
  assert.equal(clientIp(h({ "x-real-ip": "<script>" })), "");
  assert.equal(clientIp(h({ "x-real-ip": "1:2:3" })), "");
});

test("待ち時間の言い方", () => {
  assert.match(tooManyMessage(30), /30秒/);
  assert.match(tooManyMessage(61), /2分/);
  assert.match(tooManyMessage(3601), /2時間/);
});
