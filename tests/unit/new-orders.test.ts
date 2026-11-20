/* 管理画面の「新しい注文」（admin_new_orders の戻り値）を画面用の形に直す（lib/new-orders.ts） */
import { test } from "node:test";
import assert from "node:assert/strict";
import { newOrderStatus, parseNewOrders } from "../../lib/new-orders.ts";

const ITEM = {
  id: "11111111-1111-4111-8111-111111111111",
  order_no: 42,
  title: "商品A",
  total: 3300,
  status: "paid",
  payment_method: "bank_transfer",
  created_at: "2026-11-20T03:00:00Z",
  seller_id: "22222222-2222-4222-8222-222222222222",
  seller_name: "キャラ子",
  is_character: true,
};

test("件数と行を画面用の名前に直す", () => {
  assert.deepEqual(parseNewOrders({ count: 3, items: [ITEM] }), {
    count: 3,
    items: [
      {
        id: ITEM.id,
        orderNo: 42,
        title: "商品A",
        total: 3300,
        status: "paid",
        paymentMethod: "bank_transfer",
        createdAt: "2026-11-20T03:00:00Z",
        sellerId: ITEM.seller_id,
        sellerName: "キャラ子",
        isCharacter: true,
      },
    ],
  });
});

test("形が違えば 0 件・空", () => {
  for (const bad of [null, undefined, "x", 3, [], { count: "3", items: "x" }]) {
    assert.deepEqual(parseNewOrders(bad), { count: 0, items: [] });
  }
});

test("件数が負・小数・数でないときは 0、行の配列が無ければ空", () => {
  assert.equal(parseNewOrders({ count: -1, items: [] }).count, 0);
  assert.equal(parseNewOrders({ count: 1.5, items: [] }).count, 0);
  assert.deepEqual(parseNewOrders({ count: 2 }).items, []);
});

test("id の無い行は落とし、売手の名前が無ければ空、キャラの印は true のときだけ", () => {
  const r = parseNewOrders({
    count: 2,
    items: [{ ...ITEM, id: null }, { ...ITEM, seller_name: null, is_character: "yes" }],
  });
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].sellerName, "");
  assert.equal(r.items[0].isCharacter, false);
});

test("状態の名前: 振込の入金待ち／入金済み・発送待ち／発送の準備中", () => {
  assert.deepEqual(newOrderStatus("pending"), { cls: "badge-pending", label: "振込の入金待ち" });
  assert.deepEqual(newOrderStatus("paid"), { cls: "badge-new", label: "入金済み・発送待ち" });
  assert.deepEqual(newOrderStatus("preparing"), { cls: "badge-ship", label: "発送の準備中" });
  assert.deepEqual(newOrderStatus("shipped"), { cls: "badge-muted", label: "shipped" });
});
