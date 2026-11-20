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

test("振込のご案内だけは、注文のメールでも本文（振込先・振込名義・金額）を載せる", () => {
  const body = "振込名義：P12345＋お名前\n金額：3,825円\n振込先：テスト銀行 本店 普通 1234567 パンティア";
  const m = composeMail({ kind: "order", title: "お振込のご案内（11/04 12:00 まで）", body, link: "/checkout/transfer?group=g1" }, SITE);
  assert.ok(m.text.includes("振込名義：P12345"));
  assert.ok(m.text.includes("金額：3,825円"));
  assert.ok(m.text.includes(`${SITE}/checkout/transfer?group=g1`));
  // 似たパスや他の注文のお知らせは、今までどおり本文を載せない
  for (const link of ["/checkout/transferx?group=g1", "/orders/abc", "/checkout/transfer"]) {
    const o = composeMail({ kind: "order", title: "購入がありました", body: "ピンクのショーツ", link }, SITE);
    assert.ok(!o.text.includes("ピンク"), link);
  }
});

/* ---- 管理画面で書き換えた件名と書き出し ---- */

const PAID = { kind: "order", title: "お支払いが完了しました", body: "ピンクのショーツ", link: "/orders/abc" } as const;

test("上書きが無い・null のときは、今と1文字も変わらない", () => {
  const base = composeMail(PAID, SITE);
  assert.deepEqual(composeMail(PAID, SITE, null), base);
  assert.deepEqual(composeMail(PAID, SITE, { subject: null, body: null }), base);
});

test("上書きの件名に {サイト名} と {お知らせの題} が差し込まれる", () => {
  const m = composeMail(PAID, SITE, { subject: "{サイト名}からのお知らせ：{お知らせの題}", body: null });
  assert.equal(m.subject, "パンティアからのお知らせ：お支払いが完了しました");
  // 書き出しは既定（お知らせの題）のまま
  assert.ok(m.text.startsWith("お支払いが完了しました\n"));
});

test("件名の改行・制御文字は空白にして前後を詰める", () => {
  const m = composeMail(PAID, SITE, { subject: "  A\r\nBcc: x@example.test\tC  ", body: null });
  assert.equal(m.subject, "A  Bcc: x@example.test C");
  assert.ok(!/[\r\n]/.test(m.subject));
});

test("上書きの書き出しのあとに、くわしくは…・リンク・署名・止め方が残る", () => {
  const m = composeMail(PAID, SITE, { subject: null, body: "{お知らせの題}。\nご購入ありがとうございます。" });
  assert.ok(m.text.startsWith("お支払いが完了しました。\nご購入ありがとうございます。\n\n"));
  assert.ok(m.text.includes("くわしくは、ログインしてご確認ください。"));
  assert.ok(m.text.includes(`${SITE}/orders/abc`));
  assert.ok(m.text.includes("このメールは送信専用です。"));
  assert.ok(m.text.includes(`${SITE}/settings`));
  assert.ok(!m.text.includes("ピンク"), "注文のメールには本文を載せないまま");
});

test("kyc の本文（お知らせの中身）は、書き出しを上書きしても残る", () => {
  const m = composeMail({ kind: "kyc", title: "本人確認を承認できませんでした", body: "写真が読み取れませんでした", link: "/kyc" }, SITE, { subject: null, body: "残念なお知らせです" });
  assert.ok(m.text.startsWith("残念なお知らせです\n\n写真が読み取れませんでした\n"));
});

test("知らない差し込み（{本文} など）はそのまま残る・書き出しの制御文字は消す", () => {
  const m = composeMail(PAID, SITE, { subject: "{本文}", body: `前${String.fromCharCode(7)}後\r\n{金額}` });
  assert.equal(m.subject, "{本文}");
  assert.ok(m.text.startsWith("前後\n{金額}\n\n"));
});

test("差し込みは1回だけ（題の中の {サイト名} をさらに置き換えない）", () => {
  const m = composeMail({ ...PAID, title: "題{サイト名}" }, SITE, { subject: "{お知らせの題}", body: null });
  assert.equal(m.subject, "題{サイト名}");
});

test("件名が空白だけになったら既定の件名", () => {
  const m = composeMail(PAID, SITE, { subject: " \r\n ", body: null });
  assert.equal(m.subject, "【パンティア】お支払いが完了しました");
});
