/* 購入の手続きの入力の確かめ方（lib/checkout-input.ts）。
   誤りの文は、最初に違う欄を名指しする。全角の数字・ハイフンで入れても通る。 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlaceInput } from "../../lib/checkout-input.ts";

const ID = "11111111-1111-4111-8111-111111111111";
const ADDRESS = {
  name: "山田 花子",
  postal: "981-1104",
  prefecture: "宮城県",
  address1: "仙台市太白区中田町1-2-3",
  address2: "",
  phone: "090-1234-5678",
};

function input(address: Record<string, unknown>, rest: Record<string, unknown> = {}) {
  return { listingIds: [ID], method: "transfer", address: { ...ADDRESS, ...address }, ...rest };
}

function okOf(r: ReturnType<typeof parsePlaceInput>) {
  if (!r.ok) assert.fail(`通るはずが「${r.message}」で止まった`);
  return r.data;
}

function messageOf(r: ReturnType<typeof parsePlaceInput>): string {
  if (r.ok) assert.fail("止まるはずが通った");
  return r.message;
}

test("全角の数字・ハイフンの郵便番号と電話番号も通り、半角の形にそろう", () => {
  const d = okOf(parsePlaceInput(input({ postal: "９８１－１１０４", phone: "０９０ー１２３４ー５６７８" })));
  assert.equal(d.address.postal, "981-1104");
  assert.equal(d.address.phone, "09012345678");
});

test("ハイフンなしの7桁は 123-4567 の形にそろう", () => {
  assert.equal(okOf(parsePlaceInput(input({ postal: "9811104" }))).address.postal, "981-1104");
});

test("前の決まりで通っていた電話番号の書き方（点・空白で区切る）は、そのまま通る", () => {
  assert.equal(okOf(parsePlaceInput(input({ phone: "090.1234.5678" }))).address.phone, "09012345678");
  assert.equal(okOf(parsePlaceInput(input({ phone: "03 1234 5678" }))).address.phone, "0312345678");
});

test("郵便番号が6桁なら、郵便番号の欄だと分かる文を返す", () => {
  assert.equal(messageOf(parsePlaceInput(input({ postal: "981-110" }))), "郵便番号は7桁の数字で入れてください。");
});

test("電話番号の形が違えば、電話番号の欄だと分かる文を返す", () => {
  assert.equal(messageOf(parsePlaceInput(input({ phone: "090-1234" }))), "電話番号は 0 から始まる10〜11桁で入れてください。");
});

test("お名前・都道府県・市区町村・番地・建物名の誤りも、その欄の名前で返す", () => {
  assert.equal(messageOf(parsePlaceInput(input({ name: "  " }))), "お名前を入れてください（30字まで）。");
  assert.equal(messageOf(parsePlaceInput(input({ prefecture: "" }))), "都道府県を選んでください。");
  assert.equal(messageOf(parsePlaceInput(input({ address1: "" }))), "市区町村・番地を入れてください（100字まで）。");
  assert.equal(messageOf(parsePlaceInput(input({ address2: "あ".repeat(101) }))), "建物名・部屋番号は100字までで入れてください。");
});

test("違う欄が2つ以上あれば、画面の上の欄の文を1つだけ返す", () => {
  assert.equal(messageOf(parsePlaceInput(input({ postal: "981-110", phone: "1" }))), "郵便番号は7桁の数字で入れてください。");
  const empty = { name: "", postal: "", prefecture: "", address1: "", address2: "", phone: "" };
  assert.equal(messageOf(parsePlaceInput(input(empty))), "お名前を入れてください（30字まで）。");
});

test("お届け先でない誤りは、カートと支払い方法の文を返す", () => {
  assert.equal(messageOf(parsePlaceInput(input({}, { method: "cash" }))), "カートの中身と支払い方法を確かめてください。");
  assert.equal(messageOf(parsePlaceInput(input({}, { listingIds: [] }))), "カートの中身と支払い方法を確かめてください。");
});

test("お届け先に知らない欄が混ざっていたら、お届け先の文を返す", () => {
  assert.equal(messageOf(parsePlaceInput(input({ extra: "x" }))), "お届け先を確かめてください。");
});
