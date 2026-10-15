// DB の回帰テストを「検証用」の Supabase に流す（本番には流さない）
//   使い方: SUPABASE_ACCESS_TOKEN=... TEST_PROJECT_REF=<検証用の ref> node supabase/tests/run.mjs [01_catalogue.sql ...]
//   ・各テストは _harness.sql + テスト + _footer.sql を1回で流す。最後に結果を例外で返すので、作ったデータは全部取り消される
//   ・migration を先に流しておくこと
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REF = (process.env.TEST_PROJECT_REF ?? process.env.PENTEST_REF ?? "").trim();
const TOKEN = (process.env.SUPABASE_ACCESS_TOKEN ?? "").trim();
// 本番（パンティア）の ref には流さない
const PRODUCTION = new Set(["swqrhatsooeqoqfzugaj"]);
if (!/^[a-z]{20}$/.test(REF) || PRODUCTION.has(REF)) {
  console.error("TEST_PROJECT_REF が検証用の ref ではありません。止めます。");
  process.exitCode = 2;
  throw new Error("stop");
}
if (!TOKEN) {
  console.error("SUPABASE_ACCESS_TOKEN がありません。");
  process.exitCode = 2;
  throw new Error("stop");
}

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(here).filter((f) => /^\d\d_.*\.sql$/.test(f)).sort();
const harness = readFileSync(join(here, "_harness.sql"), "utf8");
const footer = readFileSync(join(here, "_footer.sql"), "utf8");

let failed = 0;
for (const f of files) {
  const query = `${harness}\n${readFileSync(join(here, f), "utf8")}\n${footer}`;
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  const m = text.match(/RESULT (\{.*?\})(?:\\n|")/);
  if (!m) {
    failed++;
    console.log(`✗ ${f}: テストが最後まで走りませんでした\n  ${text.slice(0, 1500)}`);
    continue;
  }
  const r = JSON.parse(m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
  failed += r.fail;
  console.log(`${r.fail ? "✗" : "✓"} ${f}: 合格 ${r.pass} / 不合格 ${r.fail}`);
  for (const x of r.failed) console.log(`    - ${x}`);
}
process.exitCode = failed ? 1 : 0;
