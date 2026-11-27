/* 管理画面のページ送りの数（lib/pager.ts）。番号は最大5つ。今のページから2つ以上離れた番号は far（スマホで隠す） */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pagerModel } from "../../lib/pager.ts";

const ns = (m: ReturnType<typeof pagerModel>) => m.nums.map((x) => x.n);
const fars = (m: ReturnType<typeof pagerModel>) => m.nums.filter((x) => x.far).map((x) => x.n);

test("0件なら1ページだけで、前にも次にも進めない", () => {
  const m = pagerModel(1, 0, 20);
  assert.equal(m.pages, 1);
  assert.equal(m.from, 0);
  assert.equal(m.to, 0);
  assert.deepEqual(m.nums, [{ n: 1, far: false }]);
  assert.equal(m.prev, false);
  assert.equal(m.next, false);
});

test("95件・20件ずつの1ページ目は、番号1〜5で、3・4・5が far。次にだけ進める", () => {
  const m = pagerModel(1, 95, 20);
  assert.equal(m.pages, 5);
  assert.equal(m.from, 1);
  assert.equal(m.to, 20);
  assert.deepEqual(ns(m), [1, 2, 3, 4, 5]);
  assert.deepEqual(fars(m), [3, 4, 5]);
  assert.equal(m.prev, false);
  assert.equal(m.next, true);
});

test("3ページ目は、1と5が far", () => {
  const m = pagerModel(3, 95, 20);
  assert.deepEqual(ns(m), [1, 2, 3, 4, 5]);
  assert.deepEqual(fars(m), [1, 5]);
  assert.equal(m.prev, true);
  assert.equal(m.next, true);
});

test("最後の5ページ目は、81-95件で、前にだけ進める", () => {
  const m = pagerModel(5, 95, 20);
  assert.deepEqual(ns(m), [1, 2, 3, 4, 5]);
  assert.deepEqual(fars(m), [1, 2, 3]);
  assert.equal(m.from, 81);
  assert.equal(m.to, 95);
  assert.equal(m.prev, true);
  assert.equal(m.next, false);
});

test("ページが多いときは、今のページを真ん中に5つ並べる（1000件・50件ずつの10ページ目は8〜12）", () => {
  const m = pagerModel(10, 1000, 50);
  assert.equal(m.pages, 20);
  assert.deepEqual(ns(m), [8, 9, 10, 11, 12]);
  assert.deepEqual(fars(m), [8, 12]);
});
