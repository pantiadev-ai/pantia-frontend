/* 出品の入力の確かめ方（lib/listing-input.ts）。ふつうの出品（saveListing）とキャラの出品（管理画面）が同じ部品を使う */
import { test } from "node:test";
import assert from "node:assert/strict";
import { INCOMPLETE, ListingSchema, isComplete, listingRow, listingRowError, type ParsedListing } from "../../lib/listing-input.ts";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const IMG1 = `${OWNER}/33333333-3333-4333-8333-333333333333.webp`;
const IMG2 = `${OWNER}/44444444-4444-4444-8444-444444444444.webp`;

function input(extra: Partial<ParsedListing> = {}): ParsedListing {
  return {
    title: "白のショーツ",
    description: "説明です",
    category: "panty",
    worn_days: 2,
    material: "cotton",
    color: "white",
    size: "M",
    price: 3000,
    stock_mode: "single",
    opt_photo: true,
    opt_letter: false,
    opt_ziplock: false,
    opt_card: false,
    opt_video: false,
    opt_extend: false,
    max_worn_days: null,
    request_only: false,
    same_day: true,
    anonymous_ok: false,
    pre_message_ok: true,
    followers_only: false,
    cool_shipping: false,
    ship_estimate: "same_next",
    ng_note: "",
    paid_options: [],
    image_paths: [IMG1],
    ...extra,
  };
}

const PHOTO_AGAIN = "写真をもう一度選び直してください。";

test("ふつうの入力は通る（誤りなし）", () => {
  assert.equal(listingRowError(input(), OWNER), null);
});

test("他人のフォルダの写真は断る", () => {
  const d = input({ image_paths: [`${OTHER}/33333333-3333-4333-8333-333333333333.webp`] });
  assert.equal(listingRowError(d, OWNER), PHOTO_AGAIN);
});

test("同じ写真が2つあれば断る", () => {
  assert.equal(listingRowError(input({ image_paths: [IMG1, IMG1] }), OWNER), PHOTO_AGAIN);
  assert.equal(listingRowError(input({ image_paths: [IMG1, IMG2] }), OWNER), null);
});

test("延長ありで、最大の日数が着用日数より短ければ断る", () => {
  const d = input({ opt_extend: true, worn_days: 3, max_worn_days: 2 });
  assert.equal(listingRowError(d, OWNER), "延長できる最大の日数は、着用日数と同じか、それより長くしてください。");
  assert.equal(listingRowError(input({ opt_extend: true, worn_days: 3, max_worn_days: 3 }), OWNER), null);
});

test("延長なしなら、最大の日数が短くても見ない（行では null にする）", () => {
  const d = input({ opt_extend: false, worn_days: 3, max_worn_days: 2 });
  assert.equal(listingRowError(d, OWNER), null);
  assert.equal(listingRow(d).max_worn_days, null);
  assert.equal(listingRow(input({ opt_extend: true, worn_days: 2, max_worn_days: 4 })).max_worn_days, 4);
});

test("有料オプションの誤りは、その文をそのまま返す", () => {
  const d = input({ paid_options: [{ id: "a1", name: "着用写真集", price: 99 }] });
  const msg = listingRowError(d, OWNER);
  assert.equal(typeof msg, "string");
  assert.notEqual(msg, PHOTO_AGAIN);
});

test("行はちょうど26列で、名義と状態を含まない", () => {
  const keys = Object.keys(listingRow(input()));
  assert.equal(keys.length, 26);
  assert.ok(!keys.includes("seller_id"));
  assert.ok(!keys.includes("status"));
});

test("知らない key が入った入力は通さない（strict）", () => {
  assert.equal(ListingSchema.safeParse({ ...input(), seller_id: OTHER }).success, false);
  assert.equal(ListingSchema.safeParse(input()).success, true);
});

test("公開に要る項目がそろっているか", () => {
  assert.equal(isComplete(input()), true);
  assert.equal(isComplete(input({ description: "" })), false);
  assert.equal(isComplete(input({ image_paths: [] })), false);
  assert.match(INCOMPLETE, /写真（1〜5枚）/);
});
