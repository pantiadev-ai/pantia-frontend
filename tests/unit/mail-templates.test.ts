/* メールの文面の目録（lib/mail-templates.ts） */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MAIL_TEMPLATES, loadOverrides, mailTemplateInput, templateFor, type MailTemplateRow } from "../../lib/mail-templates.ts";

const MIGRATIONS = join(import.meta.dirname, "../../supabase/migrations");

/** migrations の notify(宛先, 'order'|'kyc'|'payout', '題…') を全部拾う。
    1つ目の引数は括弧をまたがない（コメントの「notify()」から次の行の in ('order', 'kyc', …) を拾わないため） */
function noticeTitles(): { kind: string; title: string; file: string }[] {
  const out: { kind: string; title: string; file: string }[] = [];
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    for (const m of sql.matchAll(/notify\(\s*[^,()]+,\s*'(order|kyc|payout)',\s*'([^']+)'/g)) out.push({ kind: m[1], title: m[2], file });
  }
  return out;
}

test("目録の題と migrations のお知らせの題が過不足なく一致する", () => {
  const found = noticeTitles();
  assert.ok(found.length >= 17, `拾えた数が少なすぎる: ${found.length}`);
  const used = new Set<string>();
  for (const f of found) {
    const t = templateFor(f.kind, f.title);
    assert.ok(t, `目録に無いお知らせ: ${f.kind} / ${f.title}（${f.file}）`);
    used.add(t.key);
  }
  for (const t of MAIL_TEMPLATES) assert.ok(used.has(t.key), `migrations で使われていない目録の行: ${t.key}`);
  assert.equal(MAIL_TEMPLATES.length, 17);
});

test("key は重複しない・題は種類の中で重複しない", () => {
  assert.equal(new Set(MAIL_TEMPLATES.map((t) => t.key)).size, MAIL_TEMPLATES.length);
  assert.equal(new Set(MAIL_TEMPLATES.map((t) => `${t.kind}/${t.title}`)).size, MAIL_TEMPLATES.length);
  for (const t of MAIL_TEMPLATES) assert.ok(t.key.startsWith(`${t.kind}.`), t.key);
});

test("templateFor は題で1つに決まり、kind が違えば null", () => {
  assert.equal(templateFor("order", "お支払いが完了しました")?.key, "order.paid");
  assert.equal(templateFor("order", "お振込のご案内（11/04 12:00 まで）")?.key, "order.transfer_guide");
  assert.equal(templateFor("kyc", "お支払いが完了しました"), null);
  assert.equal(templateFor("chat", "本人確認が完了しました"), null);
  assert.equal(templateFor("order", "購入がありました"), null);
  // 前方一致は prefix の行だけ
  assert.equal(templateFor("order", "お支払いが完了しました（追記）"), null);
});

test("mailTemplateInput: 空の件名と空の書き出しは通る（既定に戻す）", () => {
  const r = mailTemplateInput.safeParse({ key: "order.paid", subject: "  ", body: "\r\n　" });
  assert.ok(r.success);
  assert.equal(r.data.subject, "");
  assert.equal(r.data.body, "");
});

test("mailTemplateInput: 書き出しの改行は CRLF を LF にそろえて通す", () => {
  const r = mailTemplateInput.safeParse({ key: "kyc.approved", subject: "{サイト名}からのお知らせ", body: "1行目\r\n2行目\r3行目" });
  assert.ok(r.success);
  assert.equal(r.data.body, "1行目\n2行目\n3行目");
});

test("mailTemplateInput: 件名 101字・件名の改行・書き出しの制御文字・2001字・知らない key は通らない", () => {
  const bad = [
    { key: "order.paid", subject: "あ".repeat(101), body: "" },
    { key: "order.paid", subject: "1行目\n2行目", body: "" },
    { key: "order.paid", subject: "タブ\tあり", body: "" },
    { key: "order.paid", subject: "", body: `ベル${String.fromCharCode(7)}` },
    { key: "order.paid", subject: "", body: "あ".repeat(2001) },
    { key: "order.unknown", subject: "件名", body: "" },
    { key: "Order.paid", subject: "件名", body: "" },
  ];
  for (const input of bad) assert.equal(mailTemplateInput.safeParse(input).success, false, JSON.stringify(input).slice(0, 60));
  // ちょうど100字・2000字は通る（絵文字は1字と数える）
  assert.ok(mailTemplateInput.safeParse({ key: "order.paid", subject: "😀".repeat(100), body: "あ".repeat(2000) }).success);
});

test("mailTemplateInput: 断るときの文は日本語", () => {
  const r = mailTemplateInput.safeParse({ key: "order.paid", subject: "あ".repeat(101), body: "" });
  assert.equal(r.success, false);
  assert.match(r.error.issues[0].message, /件名/);
});

/** 偽の service（mail_templates を select するだけ） */
function fakeService(result: { data: MailTemplateRow[] | null; error: { message: string } | null }) {
  const calls: string[] = [];
  return {
    calls,
    from(table: "mail_templates") {
      calls.push(table);
      return { select: (cols: "key, subject, body") => (calls.push(cols), Promise.resolve(result)) };
    },
  };
}

test("loadOverrides: 表の行を key ごとの上書きにする", async () => {
  const svc = fakeService({ data: [{ key: "order.paid", subject: "件名A", body: null }], error: null });
  const m = await loadOverrides(svc);
  assert.deepEqual(m.get("order.paid"), { subject: "件名A", body: null });
  assert.equal(m.size, 1);
  assert.deepEqual(svc.calls, ["mail_templates", "key, subject, body"]);
});

test("loadOverrides: 文面の表が読めなくても空の Map で続ける", async () => {
  const errors: unknown[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => void errors.push(a);
  try {
    const m = await loadOverrides(fakeService({ data: null, error: { message: "boom" } }));
    assert.equal(m.size, 0);
    const thrown = await loadOverrides({
      from() {
        throw new Error("network");
      },
    });
    assert.equal(thrown.size, 0);
  } finally {
    console.error = orig;
  }
  assert.equal(errors.length, 2);
  assert.equal((errors[0] as unknown[])[0], "[mail] templates");
});
