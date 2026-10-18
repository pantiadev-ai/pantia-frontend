/* 画面の値の書き方。日付は日本時間で出ること（サーバーは UTC で動く） */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dateJst, dateTimeJst, displayName, excerpt, last4, maskName, ratingAvg, relTime, san, stars, yen } from "../../lib/format.ts";

test("yen は3桁区切り・端数は丸める", () => {
  assert.equal(yen(1234567), "¥1,234,567");
  assert.equal(yen(null), "¥0");
  assert.equal(yen(99.6), "¥100");
});

test("日付は日本時間（UTC 15:30 は翌日 0:30）", () => {
  assert.equal(dateJst("2026-10-15T15:30:00Z"), "2026/10/16");
  assert.equal(dateTimeJst("2026-10-15T15:30:00Z"), "2026/10/16 00:30");
  assert.equal(dateJst("壊れた日付"), "");
});

test("relTime", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  assert.equal(relTime("2026-10-15T11:59:30Z", now), "たった今");
  assert.equal(relTime("2026-10-15T11:55:00Z", now), "5分前");
  assert.equal(relTime("2026-10-15T09:00:00Z", now), "3時間前");
  assert.equal(relTime("2026-10-13T12:00:00Z", now), "2日前");
  assert.equal(relTime("2026-09-01T12:00:00Z", now), "2026/09/01");
});

test("購入者の名前は先頭1字だけ", () => {
  assert.equal(maskName("kenta"), "K***さん");
  assert.equal(maskName("たろう"), "た***さん");
  assert.equal(maskName("😀abc"), "😀***さん");
  assert.equal(maskName(""), "***さん");
  assert.equal(displayName(null), "退会したユーザー");
});

test("評価・星・下4桁・抜き出し", () => {
  assert.equal(ratingAvg(19, 5), "3.8");
  assert.equal(ratingAvg(0, 0), "-");
  assert.equal(stars(4), "★★★★☆");
  assert.equal(stars(9), "★★★★★");
  assert.equal(last4("1234567"), "****4567");
  assert.equal(excerpt("あ".repeat(70), 60).length, 61);
});

test("san は「さん」を重ねない（購入者の伏せた名前・さんで終わる呼び名）", () => {
  assert.equal(san("ゆい"), "ゆいさん");
  assert.equal(san("K***さん"), "K***さん");
  assert.equal(san(maskName("ken")), "K***さん");
  assert.equal(san("たろうさん"), "たろうさん");
  assert.equal(san(""), "");
  assert.equal(san(null), "");
});
