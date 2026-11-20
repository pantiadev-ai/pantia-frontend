/* 受け取り待ち（発送済みで、まだ取引が完了していない売上）の額と、申請できる額に入る目安（lib/pending-sales.ts） */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pendingSales, pendingSalesNote } from "../../lib/pending-sales.ts";

const NOW = new Date("2026-11-12T00:00:00Z");
const iso = (d: Date | null) => d?.toISOString() ?? null;

test("行が無ければ 0 円・0 件・目安なし", () => {
  assert.deepEqual(pendingSales([], 7, NOW), { amount: 0, count: 0, earliest: null });
});

test("額と件数は全部の行を足す", () => {
  const r = pendingSales(
    [
      { seller_net: 1200, shipped_at: "2026-11-10T03:00:00Z" },
      { seller_net: 800, shipped_at: "2026-11-11T03:00:00Z" },
    ],
    7,
    NOW,
  );
  assert.equal(r.amount, 2000);
  assert.equal(r.count, 2);
});

test("目安は、発送から日数が過ぎたあとの最初の 0:20（日本時間）＝ 15:20 UTC", () => {
  assert.equal(iso(pendingSales([{ seller_net: 1, shipped_at: "2026-11-10T03:00:00Z" }], 7, NOW).earliest), "2026-11-17T15:20:00.000Z");
  assert.equal(iso(pendingSales([{ seller_net: 1, shipped_at: "2026-11-10T16:00:00Z" }], 7, NOW).earliest), "2026-11-18T15:20:00.000Z");
});

test("発送からちょうど日数の回は含まない（条件が shipped_at < now - 日数 のため）→ 次の日の回", () => {
  assert.equal(iso(pendingSales([{ seller_net: 1, shipped_at: "2026-11-10T15:20:00Z" }], 7, NOW).earliest), "2026-11-18T15:20:00.000Z");
});

test("目安が過ぎていたら過去の日を出さず、今のあとの最初の回を出す（自動完了がまだ回っていない）", () => {
  const r = pendingSales([{ seller_net: 1, shipped_at: "2026-11-01T00:00:00Z" }], 7, new Date("2026-11-20T00:00:00Z"));
  assert.equal(iso(r.earliest), "2026-11-20T15:20:00.000Z");
});

test("目安は発送がいちばん早い行で決め、発送日の無い行は額にだけ入れる", () => {
  const r = pendingSales(
    [
      { seller_net: 500, shipped_at: null },
      { seller_net: 700, shipped_at: "2026-11-11T03:00:00Z" },
      { seller_net: 900, shipped_at: "2026-11-10T03:00:00Z" },
    ],
    7,
    NOW,
  );
  assert.equal(r.amount, 2100);
  assert.equal(r.count, 3);
  assert.equal(iso(r.earliest), "2026-11-17T15:20:00.000Z");
  assert.equal(pendingSales([{ seller_net: 500, shipped_at: null }], 7, NOW).earliest, null);
});

test("注記: 日数を入れ、目安があれば日本の日付で末尾に付ける", () => {
  const base = "購入者が受け取りを連絡するとすぐ、連絡がなくても発送から7日で申請できる額に入ります";
  assert.equal(pendingSalesNote(7, null), base);
  assert.equal(pendingSalesNote(7, new Date("2026-11-17T15:20:00Z")), `${base}（最も早いもの：11/18ごろ）`);
  assert.ok(pendingSalesNote(3, null).includes("発送から3日で"));
});
