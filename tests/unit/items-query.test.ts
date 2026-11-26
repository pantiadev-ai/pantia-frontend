/* /items の絞り込み（components/catalogue/items-query.ts）。
   改修リスト 行9: ログイン中の表示を隠す設定のあいだは、「オンライン中」の絞り込みを欄にも URL の読み取りにも出さない */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ITEM_FLAGS, parseItemsQuery, visibleItemFlags, withoutHiddenFlags } from "../../components/catalogue/items-query.ts";

test("隠す設定では、絞り込みの欄に「オンライン中」を出さない（ほかの7つはそのまま）", () => {
  const keys = visibleItemFlags(false).map((f) => f.key);
  assert.equal(keys.length, 7);
  assert.ok(!keys.includes("online"));
  assert.deepEqual(keys, ITEM_FLAGS.map((f) => f.key).filter((k) => k !== "online"));
});

test("出す設定では、8つ全部を出す", () => {
  assert.deepEqual(visibleItemFlags(true).map((f) => f.key), ITEM_FLAGS.map((f) => f.key));
});

test("隠す設定で ?online=1 が来たら、その絞り込みだけ外す（0件にしない）", () => {
  const s = parseItemsQuery({ online: "1", same_day: "1" });
  assert.deepEqual(withoutHiddenFlags(s, false).flags, ["same_day"]);
});

test("出す設定では、?online=1 をそのまま効かせる", () => {
  const s = parseItemsQuery({ online: "1", same_day: "1" });
  assert.deepEqual(withoutHiddenFlags(s, true).flags, ["same_day", "online"]);
});
