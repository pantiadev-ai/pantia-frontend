/* 支払い方法の名前を「クレジットカード・銀行振込」の形にまとめる（lib/pay-text.ts）。
   トップと商品ページで使う。設定で消した方法は名前に出ない。 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { payNamesText } from "../../lib/pay-text.ts";

test("決済会社の名前（Stripe）は省き、同じ名前は1つにする", () => {
  assert.equal(
    payNamesText(["クレジットカード（Stripe）", "PayPay", "銀行振込（Stripe）", "銀行振込"]),
    "クレジットカード・PayPay・銀行振込",
  );
});

test("銀行振込だけなら「銀行振込」だけ", () => {
  assert.equal(payNamesText(["銀行振込"]), "銀行振込");
});

test("支払い方法が1つも無ければ空の文字", () => {
  assert.equal(payNamesText([]), "");
});
