/* お知らせのメールの件名と本文（lib/mail-compose.ts） */
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeMail } from "../../lib/mail-compose.ts";

const SITE = "https://example.test";

test("注文のメールには本文（商品名など）を載せない", () => {
  const m = composeMail({ kind: "order", title: "購入がありました", body: "ピンクのショーツ が購入されました", link: "/orders/abc" }, SITE);
  assert.equal(m.subject, "【パンティア】購入がありました");
  assert.ok(!m.text.includes("ピンク"));
  assert.ok(m.text.includes(`${SITE}/orders/abc`));
  assert.ok(m.text.includes(`${SITE}/settings`), "止め方の案内がある");
});

test("注文以外は本文も載せる・止め方の案内は付けない", () => {
  const m = composeMail({ kind: "kyc", title: "本人確認の結果", body: "  承認しました  ", link: "/kyc" }, SITE);
  assert.ok(m.text.includes("\n承認しました\n"));
  assert.ok(!m.text.includes("/settings"));
});

test("サイトの外へのリンクは、お知らせの一覧に置き換える", () => {
  for (const link of ["https://evil.example/x", "//evil.example/x", "/\\evil.example", "javascript:alert(1)", ""]) {
    const m = composeMail({ kind: "payout", title: "振込しました", body: "", link }, SITE);
    assert.ok(m.text.includes(`${SITE}/notifications\n`), link);
    assert.ok(!m.text.includes("evil"), link);
  }
});

test("リンクが無いときもお知らせの一覧へ", () => {
  const m = composeMail({ kind: "payout", title: "振込しました", body: "", link: null as unknown as string }, SITE);
  assert.ok(m.text.includes(`${SITE}/notifications`));
});
