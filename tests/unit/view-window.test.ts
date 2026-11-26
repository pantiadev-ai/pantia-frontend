/* 運営が会話を見られる時間（券。開いてから30分）。画像の期限つき URL も券の残りより長くしない（0023） */
import { test } from "node:test";
import assert from "node:assert/strict";
import { VIEW_MINUTES, viewSecondsLeft, viewUntil } from "../../lib/view-window.ts";

const OPENED = "2026-11-27T00:00:00.000Z";
const at = (min: number) => Date.parse(OPENED) + min * 60_000;

test("券は30分（DB の admin_view_any_thread と同じ）", () => {
  assert.equal(VIEW_MINUTES, 30);
});

test("見られる期限は、開いた時刻の30分後", () => {
  assert.equal(viewUntil(OPENED), "2026-11-27T00:30:00.000Z");
});

test("開いた時刻が読めなければ、期限は空", () => {
  assert.equal(viewUntil(""), "");
  assert.equal(viewUntil("bad"), "");
});

test("残りの秒は、開いてから29分なら60秒（画像の URL を60分にしない）", () => {
  assert.equal(viewSecondsLeft(OPENED, at(29)), 60);
});

test("開いた直後は30分ぶん", () => {
  assert.equal(viewSecondsLeft(OPENED, at(0)), 30 * 60);
});

test("券が切れていれば0（1秒未満の残りも0）", () => {
  assert.equal(viewSecondsLeft(OPENED, at(31)), 0);
  assert.equal(viewSecondsLeft(OPENED, at(30)), 0);
  assert.equal(viewSecondsLeft(OPENED, at(30) - 500), 0);
});

test("開いた時刻が読めなければ0", () => {
  assert.equal(viewSecondsLeft("bad", at(1)), 0);
});
