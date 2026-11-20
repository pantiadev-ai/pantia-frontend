/* メールの設定の確かめ（lib/mail-config.ts）。設定がおかしいあいだは、お知らせをメール用に拾わない（lib/mail-dispatch.ts） */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mailConfig, mailWarning } from "../../lib/mail-config.ts";
import { serverEnv } from "../../lib/env.ts";

const LIVE = { MAIL_MODE: "live", RESEND_API_KEY: "test-key", MAIL_FROM: "info@example.test" };

test("MAIL_MODE が無ければ mock（鍵も送り元も要らない）", () => {
  assert.deepEqual(mailConfig({}), { state: "mock" });
  assert.deepEqual(mailConfig({ MAIL_MODE: "mock" }), { state: "mock" });
});

test("live で鍵と送り元があれば live（前後の空白は除く）", () => {
  assert.deepEqual(mailConfig(LIVE), { state: "live" });
  assert.deepEqual(mailConfig({ ...LIVE, MAIL_MODE: " live " }), { state: "live" });
  assert.deepEqual(mailConfig({ ...LIVE, MAIL_FROM: "パンティア <info@example.test>" }), { state: "live" });
});

test("MAIL_MODE にアドレスなど live・mock 以外が入っていたら、おかしい", () => {
  for (const v of ["info@example.test", "", " ", "Live", "MOCK", "true"]) {
    assert.deepEqual(mailConfig({ ...LIVE, MAIL_MODE: v }), { state: "broken", reason: "MAIL_MODE の値が正しくありません（live か mock のどちらか）" }, JSON.stringify(v));
  }
});

test("live なのに RESEND_API_KEY が無ければ、おかしい", () => {
  for (const v of [undefined, "", "  "]) {
    assert.deepEqual(mailConfig({ ...LIVE, RESEND_API_KEY: v }), { state: "broken", reason: "MAIL_MODE が live なのに RESEND_API_KEY が入っていません" });
  }
});

test("live なのに MAIL_FROM が無い・アドレスの形でなければ、おかしい", () => {
  for (const v of [undefined, "", "  "]) {
    assert.deepEqual(mailConfig({ ...LIVE, MAIL_FROM: v }), { state: "broken", reason: "MAIL_MODE が live なのに MAIL_FROM が入っていません" });
  }
  // MAIL_MODE と MAIL_FROM を取り違えたとき
  assert.deepEqual(mailConfig({ ...LIVE, MAIL_FROM: "live" }), { state: "broken", reason: "MAIL_FROM がメールアドレスの形ではありません" });
});

test("mock のときは、鍵や送り元がおかしくても見ない（送らないので）", () => {
  assert.deepEqual(mailConfig({ MAIL_MODE: "mock", MAIL_FROM: "live" }), { state: "mock" });
});

test("MAIL_MODE の判定は、送るとき（lib/env.ts の serverEnv.mailMode）と食い違わない", () => {
  const saved = process.env.MAIL_MODE;
  try {
    for (const v of [undefined, "mock", "live", " live ", "", " ", "Live", "info@example.test"]) {
      if (v === undefined) delete process.env.MAIL_MODE;
      else process.env.MAIL_MODE = v;
      let throws = false;
      try {
        void serverEnv.mailMode;
      } catch {
        throws = true;
      }
      const bad = mailConfig({ ...LIVE, MAIL_MODE: v }).state === "broken";
      assert.equal(bad, throws, JSON.stringify(v));
    }
  } finally {
    if (saved === undefined) delete process.env.MAIL_MODE;
    else process.env.MAIL_MODE = saved;
  }
});

/* ---- 管理画面の警告 ---- */

test("値がおかしいときは、その理由と「メールを待たせている」ことを出す（本番でなくても）", () => {
  for (const production of [true, false]) {
    const w = mailWarning({ ...LIVE, MAIL_MODE: "info@example.test" }, production);
    assert.ok(w?.includes("MAIL_MODE の値が正しくありません（live か mock のどちらか）"), String(w));
    assert.ok(w?.includes("送らずに待たせています"), String(w));
    assert.ok(!w?.includes("mock（送らずに控えだけ）"), "mock の警告とは分ける");
  }
});

test("本番で mock のときは、今までの mock の警告", () => {
  assert.equal(mailWarning({ MAIL_MODE: "mock" }, true), "本番なのにメールが mock（送らずに控えだけ）になっています。環境変数 MAIL_MODE を live にしてください。");
  assert.equal(mailWarning({}, true), "本番なのにメールが mock（送らずに控えだけ）になっています。環境変数 MAIL_MODE を live にしてください。");
});

test("本番でない mock・正しい live では警告を出さない", () => {
  assert.equal(mailWarning({ MAIL_MODE: "mock" }, false), null);
  assert.equal(mailWarning(LIVE, true), null);
  assert.equal(mailWarning(LIVE, false), null);
});
