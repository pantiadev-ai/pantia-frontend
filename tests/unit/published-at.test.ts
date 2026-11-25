/* 運営が出品日を変える窓の、日時の読み書き（lib/published-at.ts）。
   窓の欄（datetime-local）は日本時間の「2026-11-20T23:30」。DB へは +09:00 つきで渡す。 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isoToJstLocal, jstLocalToIso, publishedAtError } from "../../lib/published-at.ts";

test("欄の日時（日本時間）を +09:00 つきの日時にする", () => {
  assert.equal(jstLocalToIso("2026-11-20T23:30"), "2026-11-20T23:30:00+09:00");
  assert.equal(jstLocalToIso("2026-01-05T00:00"), "2026-01-05T00:00:00+09:00");
});

test("秒まである欄の値も読める", () => {
  assert.equal(jstLocalToIso("2026-11-20T23:30:15"), "2026-11-20T23:30:15+09:00");
});

test("形の違う値・ありえない日時は読まない", () => {
  for (const bad of ["2026-11-20", "", "abc", "2026-11-20 23:30", "2026-11-20T24:00", "2026-02-30T10:00", "2026-13-01T10:00", "2026-11-20T23:30+09:00"]) {
    assert.equal(jstLocalToIso(bad), null, bad);
  }
});

test("保存されている日時を、窓の初めの値（日本時間・分まで）にする", () => {
  assert.equal(isoToJstLocal("2026-11-20T14:30:00Z"), "2026-11-20T23:30");
  assert.equal(isoToJstLocal("2026-11-20T15:05:59.123+00:00"), "2026-11-21T00:05");
});

test("読めない日時なら、窓の初めの値は空", () => {
  assert.equal(isoToJstLocal("abc"), "");
});

const NOW = new Date("2026-11-24T12:00:00+09:00");

test("今より先の日時は断る", () => {
  assert.equal(publishedAtError("2026-11-24T12:01:00+09:00", NOW), "今より先の日時にはできません。");
  assert.equal(publishedAtError("2027-01-01T00:00:00+09:00", NOW), "今より先の日時にはできません。");
});

test("2000年より前は打ち間違いとして断る", () => {
  assert.equal(publishedAtError("1999-12-31T23:59:00+09:00", NOW), "日時を確かめてください。");
});

test("読めない日時は断る", () => {
  assert.equal(publishedAtError("abc", NOW), "日時を確かめてください。");
});

test("昨日・今ちょうど・2000-01-01 0:00 はよい", () => {
  assert.equal(publishedAtError("2026-11-23T12:00:00+09:00", NOW), null);
  assert.equal(publishedAtError("2026-11-24T12:00:00+09:00", NOW), null);
  assert.equal(publishedAtError("2000-01-01T00:00:00+09:00", NOW), null);
});
