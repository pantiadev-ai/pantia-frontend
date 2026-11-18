/* 会話の一覧の行の変換（my_threads の1行 → 画面の形） */
import { test } from "node:test";
import assert from "node:assert/strict";
import { threadStateOf, toThreadRow } from "../../components/chat/view.ts";

const base = {
  thread_id: "00000000-0000-4000-8000-000000000001",
  other_id: "00000000-0000-4000-8000-000000000002",
  other_name: "みさき",
  other_avatar: null,
  other_role: "seller",
  other_last_seen: null,
  other_verified: true,
  last_message_at: "2026-11-18T01:00:00+00:00",
  preview: "こんにちは",
  unread: 0,
  muted: false,
};

test("交渉中の札が付いた会話は、画面の行でも negotiating が true", () => {
  assert.equal(toThreadRow({ ...base, negotiating: true }).negotiating, true);
});

test("札の無い会話は false", () => {
  assert.equal(toThreadRow({ ...base, negotiating: false }).negotiating, false);
});

test("negotiating の列が無い古い行（配備の途中）は false", () => {
  assert.equal(toThreadRow(base).negotiating, false);
});

/* 開いている会話の読み直し（loadLatest）が返す状態。つなぎ直し・15秒ごとの読み直しで、見出しの札もこれで最新にする */
const SELLER = "00000000-0000-4000-8000-00000000000a";
const BUYER = "00000000-0000-4000-8000-00000000000b";
const thread = { seller_id: SELLER, seller_last_read_at: "2026-11-18T01:00:00+00:00", buyer_last_read_at: "2026-11-18T02:00:00+00:00" };

test("読み直しの結果に交渉中が入る（Realtime が切れている間に売手が付けた札も、戻ったときに出る）", () => {
  assert.deepEqual(threadStateOf({ ...thread, negotiating: true }, BUYER), { otherReadAt: thread.seller_last_read_at, negotiating: true });
  assert.deepEqual(threadStateOf({ ...thread, negotiating: false }, SELLER), { otherReadAt: thread.buyer_last_read_at, negotiating: false });
});

test("読み直しで negotiating の列が無い古い行（配備の途中）は false", () => {
  assert.equal(threadStateOf(thread, BUYER).negotiating, false);
  assert.equal(threadStateOf({ ...thread, negotiating: null }, BUYER).negotiating, false);
});
