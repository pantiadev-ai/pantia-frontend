/* 対応オプションの決まり（lib/listing-options.ts）。
   出品者のページ・商品のページの札・購入の欄が、同じ物を出すための1か所。
   2026-11-09 に運営から「購入者から見ると、オプションが入っている所と入っていない所があった」 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OPTION_LABELS,
  OPTION_ORDER,
  includedOptionKeys,
  listingOptionKeys,
  optionLabel,
  sellerOptionKeys,
  type ListingOptionFlags,
} from "../../lib/listing-options.ts";

const none: ListingOptionFlags = {
  optPhoto: false,
  optExtend: false,
  sameDay: false,
  anonymousOk: false,
  optLetter: false,
  optVideo: false,
  optZiplock: false,
  optCard: false,
};
const flags = (over: Partial<ListingOptionFlags>): ListingOptionFlags => ({ ...none, ...over });

test("出品の印は、プロフィールと同じ名前の対応オプションになる", () => {
  assert.deepEqual(listingOptionKeys(flags({ optPhoto: true })), ["photo"]);
  assert.deepEqual(listingOptionKeys(flags({ optExtend: true })), ["days"]);
  assert.deepEqual(listingOptionKeys(flags({ sameDay: true })), ["same_day"]);
  assert.deepEqual(listingOptionKeys(flags({ anonymousOk: true })), ["anonymous"]);
  assert.deepEqual(listingOptionKeys(flags({ optLetter: true })), ["letter"]);
  assert.deepEqual(listingOptionKeys(flags({ optVideo: true })), ["video"]);
  assert.deepEqual(listingOptionKeys(flags({ optZiplock: true })), ["ziplock"]);
  assert.deepEqual(listingOptionKeys(flags({ optCard: true })), ["card"]);
  assert.deepEqual(listingOptionKeys(none), []);
});

test("全部付いた出品は、決まった順に全部出る", () => {
  const all = flags({
    optPhoto: true,
    optExtend: true,
    sameDay: true,
    anonymousOk: true,
    optLetter: true,
    optVideo: true,
    optZiplock: true,
    optCard: true,
  });
  assert.deepEqual(listingOptionKeys(all), ["photo", "days", "same_day", "anonymous", "letter", "video", "ziplock", "card"]);
});

// request_only は「リクエストを受けた人だけが買える」という購入の制限で、プロフィールの「🎀 リクエスト対応」とは別の物
test("リクエスト専用の出品は、対応オプションに「リクエスト対応」を足さない", () => {
  // 商品のページは ListingDetail（requestOnly も持つ）をそのまま渡す
  const requestOnly = { ...none, requestOnly: true };
  assert.deepEqual(listingOptionKeys(requestOnly), []);
  assert.deepEqual(sellerOptionKeys([], [requestOnly]), []);
  assert.deepEqual(sellerOptionKeys(["request"], [requestOnly]), ["request"]);
});

test("出品者のページは、プロフィールで選んだ物に、公開中の出品で選ばれている物を足して出す（重ねない・順はいつも同じ）", () => {
  const got = sellerOptionKeys(
    ["letter", "bundle"],
    [flags({ optPhoto: true, optLetter: true }), flags({ optZiplock: true, optVideo: true }), flags({ optPhoto: true })],
  );
  assert.deepEqual(got, ["photo", "letter", "bundle", "video", "ziplock"]);
});

test("出品者のページ：プロフィールが空でも、出品で選ばれていれば出る。どちらも無ければ空", () => {
  assert.deepEqual(sellerOptionKeys([], [flags({ optCard: true })]), ["card"]);
  assert.deepEqual(sellerOptionKeys([], []), []);
  assert.deepEqual(sellerOptionKeys([], [none, none]), []);
});

test("出品者のページ：プロフィールに知らない値が入っていても出さない", () => {
  assert.deepEqual(sellerOptionKeys(["photo", "unknown", "<script>"], []), ["photo"]);
});

test("付いてくる物（選ばなくても付く）は、ジップロック梱包とメッセージカードだけ", () => {
  const all = flags({ optPhoto: true, optLetter: true, optVideo: true, optZiplock: true, optCard: true, anonymousOk: true });
  assert.deepEqual(includedOptionKeys(all), ["ziplock", "card"]);
  assert.deepEqual(includedOptionKeys(flags({ optCard: true })), ["card"]);
  assert.deepEqual(includedOptionKeys(flags({ optPhoto: true })), []);
});

test("名前は、どの対応オプションにも絵文字と名前がある（出品の入力の画面と同じ名前）", () => {
  for (const k of OPTION_ORDER) {
    assert.ok(OPTION_LABELS[k].icon, k);
    assert.ok(OPTION_LABELS[k].label, k);
  }
  assert.equal(optionLabel("ziplock"), "🧴 ジップロック梱包");
  assert.equal(optionLabel("card"), "✉️ メッセージカード");
  assert.equal(optionLabel("video"), "🎬 着用動画");
  assert.equal(optionLabel("photo"), "📸 着用写真");
});
