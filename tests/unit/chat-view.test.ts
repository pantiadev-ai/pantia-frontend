/* 会話の一覧の行の変換（my_threads の1行 → 画面の形） */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toThreadRow } from "../../components/chat/view.ts";

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
