/* メールの設定の確かめ（lib/mail-config.ts）。設定がおかしいあいだは、お知らせをメール用に拾わない（lib/mail-dispatch.ts） */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mailConfig, mailWarning, noticeBcc } from "../../lib/mail-config.ts";
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

/* 改修リスト 行16: お知らせのメール（notice.*）に、運営の控えを BCC で付ける（宛先は MAIL_BCC） */
test("BCC: お知らせのメールで MAIL_BCC があれば、その1件を付ける（前後の空白は除く）", () => {
  assert.equal(noticeBcc("notice.order_paid", "info@pan-tia.com"), "info@pan-tia.com");
  assert.equal(noticeBcc("notice.kyc_approved", "  info@pan-tia.com "), "info@pan-tia.com");
});

test("BCC: お問い合わせなど、お知らせ以外のメールには付けない", () => {
  assert.equal(noticeBcc("contact", "info@pan-tia.com"), undefined);
  assert.equal(noticeBcc("notice", "info@pan-tia.com"), undefined);
});

test("BCC: MAIL_BCC が空・未設定なら付けない", () => {
  assert.equal(noticeBcc("notice.order_paid", undefined), undefined);
  assert.equal(noticeBcc("notice.order_paid", ""), undefined);
  assert.equal(noticeBcc("notice.order_paid", "   "), undefined);
});

test("BCC: アドレス1件の形でなければ付けない（複数・表示名つき・@ なし・改行）", () => {
  for (const v of ["a@example.test,b@example.test", "a@example.test b@example.test", "運営 <a@example.test>", "info", "a@example.test\r\nBcc: x@example.test"]) {
    assert.equal(noticeBcc("notice.order_paid", v), undefined, v);
  }
});

test("BCC: MAIL_BCC がアドレス1件の形でなければ、管理画面に警告を出す（お知らせは BCC なしで送る）", () => {
  assert.match(mailWarning({ ...LIVE, MAIL_BCC: "a@example.test,b@example.test" }, true) ?? "", /MAIL_BCC/);
  assert.deepEqual(mailConfig({ ...LIVE, MAIL_BCC: "info" }), { state: "live" });
  assert.equal(mailWarning({ ...LIVE, MAIL_BCC: "info@pan-tia.com" }, true), null);
  assert.equal(mailWarning({ ...LIVE, MAIL_BCC: "" }, true), null);
});
