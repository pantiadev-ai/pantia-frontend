/* 出品のフォームの「価格設定」の見込み（lib/price-estimate.ts）。DB の listing_quote と place_order の式と同じか */
import { test } from "node:test";
import assert from "node:assert/strict";
import { priceEstimate, rangeText } from "../../lib/price-estimate.ts";

const base = { price: 1800, feeRate: 0.15, videoFee: null, extend: null, extras: [] };

test("有料オプションが無ければ、幅は1つの値", () => {
  const e = priceEstimate(base);
  assert.deepEqual(e.lines, []);
  assert.deepEqual(e.subtotal, { min: 1800, max: 1800 });
  assert.deepEqual(e.fee, { min: 270, max: 270 });
  assert.deepEqual(e.net, { min: 1530, max: 1530 });
});

test("動画・延長・自分で決めた物を1行ずつ出し、全部選ばれたときを上の端にする", () => {
  const e = priceEstimate({
    ...base,
    videoFee: 1000,
    extend: { feePerDay: 500, days: 2 },
    extras: [{ name: "綿棒のセット", price: 500 }],
  });
  assert.deepEqual(e.lines, [
    { label: "🎬 着用動画", amount: 1000, note: "" },
    { label: "📅 着用日数延長", amount: 1000, note: "¥500 × 最大2日" },
    { label: "綿棒のセット", amount: 500, note: "" },
  ]);
  assert.deepEqual(e.subtotal, { min: 1800, max: 4300 });
  assert.deepEqual(e.fee, { min: 270, max: 645 });
  assert.deepEqual(e.net, { min: 1530, max: 3655 });
});

test("手数料は DB と同じ round(小計 × 率)。ちょうど .5 は切り上げる", () => {
  // 3500 × 7.3% = 255.5（小数の掛け算 3500 * 0.073 だと 255.4999… になり、255 に落ちる）
  const e = priceEstimate({ ...base, price: 3000, feeRate: 0.073, videoFee: 500 });
  assert.deepEqual(e.fee, { min: 219, max: 256 });
  assert.deepEqual(e.net, { min: 2781, max: 3244 });
});

test("延長できる日が無いとき（最大の日数が未選択）は、延長の行を出さない", () => {
  const e = priceEstimate({ ...base, extend: { feePerDay: 500, days: 0 } });
  assert.deepEqual(e.lines, []);
  assert.deepEqual(e.subtotal, { min: 1800, max: 1800 });
});

test("幅の書き方：同じなら1つ、違えば「〜」でつなぐ", () => {
  assert.equal(rangeText({ min: 1530, max: 1530 }), "¥1,530");
  assert.equal(rangeText({ min: 1530, max: 3655 }), "¥1,530 〜 ¥3,655");
});
