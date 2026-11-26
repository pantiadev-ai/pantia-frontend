/* Resend へ送る中身（lib/resend.ts）。送る作り（mail_outbox・mock と live）は lib/adapters/mail.ts */
import { test } from "node:test";
import assert from "node:assert/strict";
import { RESEND_URL, fromHeader, resendRequest, retryDelayMs, resendErrorLabel } from "../../lib/resend.ts";

const OPTS = { apiKey: "test-key", from: "パンティア <info@pan-tia.com>" };

test("送り先は Resend の送信の入口", () => {
  assert.equal(RESEND_URL, "https://api.resend.com/emails");
});

test("送信元は「表示名 <アドレス>」の形にする", () => {
  assert.equal(fromHeader("パンティア", "info@pan-tia.com"), "パンティア <info@pan-tia.com>");
  assert.equal(fromHeader("パンティア", "  info@pan-tia.com "), "パンティア <info@pan-tia.com>");
});

test("MAIL_FROM に表示名まで書いてあれば、そのまま使う", () => {
  assert.equal(fromHeader("パンティア", "運営 <info@pan-tia.com>"), "運営 <info@pan-tia.com>");
});

test("表示名から、見出しを壊す文字（< > \" と改行）を除く", () => {
  assert.equal(fromHeader('パン<ティア>"\r\n', "info@pan-tia.com"), "パンティア <info@pan-tia.com>");
});

test("表示名が空ならアドレスだけ", () => {
  assert.equal(fromHeader("  ", "info@pan-tia.com"), "info@pan-tia.com");
});

test("送信元のアドレスが空なら止める（黙って送らない）", () => {
  assert.throws(() => fromHeader("パンティア", " "));
});

test("見出し: 鍵・JSON・User-Agent（無いと Resend は 403 を返す）", () => {
  const r = resendRequest({ to: "a@example.test", subject: "件名", text: "本文" }, OPTS);
  assert.equal(r.method, "POST");
  assert.equal(r.headers.Authorization, "Bearer test-key");
  assert.equal(r.headers["Content-Type"], "application/json");
  assert.match(r.headers["User-Agent"], /^pantia\/\d/);
});

test("本文: 宛先は配列・文字の本文だけ（html は送らない）", () => {
  const r = resendRequest({ to: "a@example.test", subject: "件名", text: "本文" }, OPTS);
  assert.deepEqual(JSON.parse(r.body), {
    from: "パンティア <info@pan-tia.com>",
    to: ["a@example.test"],
    subject: "件名",
    text: "本文",
  });
});

test("返信先があるときだけ reply_to を付ける", () => {
  const r = resendRequest({ to: "a@example.test", subject: "s", text: "t", replyTo: "b@example.test" }, OPTS);
  assert.equal(JSON.parse(r.body).reply_to, "b@example.test");
  const n = resendRequest({ to: "a@example.test", subject: "s", text: "t" }, OPTS);
  assert.ok(!("reply_to" in JSON.parse(n.body)));
});

test("BCC があるときだけ bcc を付ける（Resend の bcc は配列も受ける）", () => {
  const r = resendRequest({ to: "a@example.test", subject: "s", text: "t", bcc: "ops@example.test" }, OPTS);
  assert.deepEqual(JSON.parse(r.body).bcc, ["ops@example.test"]);
  assert.deepEqual(JSON.parse(r.body).to, ["a@example.test"]);
  const n = resendRequest({ to: "a@example.test", subject: "s", text: "t" }, OPTS);
  assert.ok(!("bcc" in JSON.parse(n.body)));
});

test("鍵が空なら止める", () => {
  assert.throws(() => resendRequest({ to: "a@example.test", subject: "s", text: "t" }, { ...OPTS, apiKey: " " }));
});

test("1秒の上限（429）だけ、retry-after の秒だけ待って1回送り直す。待ちは2秒まで", () => {
  const rate = JSON.stringify({ statusCode: 429, name: "rate_limit_exceeded", message: "Too many requests" });
  assert.equal(retryDelayMs(429, "1", rate), 1000);
  assert.equal(retryDelayMs(429, "30", rate), 2000);
  assert.equal(retryDelayMs(429, null, rate), 1000);
  assert.equal(retryDelayMs(429, "abc", rate), 1000);
  assert.equal(retryDelayMs(429, "1", ""), 1000, "本文が読めなくても 429 は1回だけ送り直す");
});

test("1日・1か月の上限は送り直さない（待っても通らない）", () => {
  for (const name of ["daily_quota_exceeded", "monthly_quota_exceeded"]) {
    assert.equal(retryDelayMs(429, "1", JSON.stringify({ statusCode: 429, name })), null);
  }
});

test("429 以外は送り直さない", () => {
  for (const s of [400, 401, 403, 422, 500, 503]) assert.equal(retryDelayMs(s, "1", ""), null);
});

test("控えのエラーは「Resend 状態 種類」。message はアドレスが入りうるので載せない", () => {
  const body = JSON.stringify({ statusCode: 403, name: "validation_error", message: "The a@example.test domain is not verified" });
  assert.equal(resendErrorLabel(403, body), "Resend 403 validation_error");
  assert.equal(resendErrorLabel(429, JSON.stringify({ name: "daily_quota_exceeded" })), "Resend 429 daily_quota_exceeded");
});

test("種類が読めないときは状態だけ。妙な文字は落とし、長さを切る", () => {
  assert.equal(resendErrorLabel(500, "<html>"), "Resend 500");
  assert.equal(resendErrorLabel(500, JSON.stringify({ name: 42 })), "Resend 500");
  assert.equal(resendErrorLabel(400, JSON.stringify({ name: "Bad<script>name" })), "Resend 400 adscriptname");
  assert.equal(resendErrorLabel(400, JSON.stringify({ name: "a".repeat(80) })).length, "Resend 400 ".length + 50);
});
