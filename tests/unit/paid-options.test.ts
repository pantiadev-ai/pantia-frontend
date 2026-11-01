/* 出品者が決める有料オプション（lib/paid-options.ts）。DB の paid_options_ok と同じ決まりか */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PAID_OPTION_MAX,
  PAID_OPTION_SUGGESTIONS,
  newPaidOptionId,
  paidOptionsError,
  toPaidOptions,
} from "../../lib/paid-options.ts";

const ok = (id: string, name = "着用写真集", price = 1500) => ({ id, name, price });

test("決まりどおりの並びは通る（空も通る）", () => {
  assert.equal(paidOptionsError([]), null);
  assert.equal(paidOptionsError([ok("a1"), ok("b2", "おな動画", 50_000), ok("c3", "綿棒のセット", 100)]), null);
});

test("11件以上は断る", () => {
  const list = Array.from({ length: PAID_OPTION_MAX + 1 }, (_, i) => ok(`x${i}`, `オプション${i}`));
  assert.match(paidOptionsError(list) ?? "", /10件/);
});

test("名前：空・31字・前後の空白・改行は断る", () => {
  assert.ok(paidOptionsError([ok("a", "")]));
  assert.ok(paidOptionsError([ok("a", "あ".repeat(31))]));
  assert.equal(paidOptionsError([ok("a", "あ".repeat(30))]), null);
  assert.ok(paidOptionsError([ok("a", " 前に空白")]));
  assert.ok(paidOptionsError([ok("a", "改行\nあり")]));
  assert.ok(paidOptionsError([ok("a", "制御\u0085")]));
});

test("名前が重なるのは断る", () => {
  assert.match(paidOptionsError([ok("a"), ok("b")]) ?? "", /同じ名前/);
});

test("料金：100円未満・50,000円超・100円単位でない・小数は断る", () => {
  for (const price of [0, 99, 50_100, 1550, 100.5, Number.NaN]) {
    assert.ok(paidOptionsError([ok("a", "動画", price)]), String(price));
  }
});

test("id：形が違う・重なるのは断る", () => {
  assert.ok(paidOptionsError([ok("A1")]));
  assert.ok(paidOptionsError([ok("")]));
  assert.ok(paidOptionsError([ok("a".repeat(13))]));
  assert.ok(paidOptionsError([ok("a", "一つ目"), ok("a", "二つ目")]));
});

test("toPaidOptions は形の合う物だけ残す（DB の jsonb を読むとき）", () => {
  assert.deepEqual(toPaidOptions(null), []);
  assert.deepEqual(toPaidOptions("x"), []);
  assert.deepEqual(toPaidOptions([ok("a"), { id: "b", name: 1, price: 100 }, { id: "c" }, ok("d", "動画", 300)]), [
    ok("a"),
    ok("d", "動画", 300),
  ]);
});

test("newPaidOptionId は決まりの形で、使っている id と重ならない", () => {
  const taken = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const id = newPaidOptionId(taken);
    assert.match(id, /^[a-z0-9]{1,12}$/);
    assert.ok(!taken.has(id));
    taken.add(id);
  }
});

test("候補の名前は、どれも決まりに合う", () => {
  assert.ok(PAID_OPTION_SUGGESTIONS.length >= 7);
  const list = PAID_OPTION_SUGGESTIONS.slice(0, PAID_OPTION_MAX).map((name, i) => ok(`s${i}`, name));
  assert.equal(paidOptionsError(list), null);
});
