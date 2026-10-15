#!/usr/bin/env node
/* 依存の門（28 §K2）。npm audit の結果を、当社の線で合否にする。
     node scripts/security-gate.mjs            … 合否（落ちたら exit 1）
     node scripts/security-gate.mjs --json     … 機械向けの一覧

   線:
     本番の依存（--omit=dev） … moderate 以上で落とす（外部監査 2026-10-05 で uuid の moderate を素通しした反省）
     開発用を含む全部        … high 以上で落とす
   例外: security-exceptions.json に「包み・勧告ID・理由・期限」を書いた物だけ通す。
         期限が過ぎた例外は、それ自体で落とす（例外を置きっぱなしにしない）。

   型の正本: C:\Users\OWNER\dev\ai-kakumei\_security\gate\（全リポで同じ物を使う。直したら正本から写す） */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const today = new Date().toISOString().slice(0, 10);

function audit(omitDev) {
  // Windows の npm は npm.cmd。シェルを通さず、Node 同梱の npm-cli.js を動かす
  const args = ["audit", "--json", ...(omitDev ? ["--omit=dev"] : [])];
  const r = process.platform === "win32"
    ? spawnSync(process.execPath, [join(process.execPath, "..", "node_modules", "npm", "bin", "npm-cli.js"), ...args], { cwd: root, encoding: "utf8", maxBuffer: 64 << 20 })
    : spawnSync("npm", args, { cwd: root, encoding: "utf8", maxBuffer: 64 << 20 });
  let j;
  try { j = JSON.parse(r.stdout); } catch { throw new Error(`npm audit の出力が読めません（exit ${r.status}）: ${String(r.stderr).slice(0, 400)}`); }
  if (j.error) throw new Error(`npm audit が失敗しました: ${j.error.summary ?? JSON.stringify(j.error)}`);
  // 勧告そのもの（via が物の行）だけを数える。連鎖（via が文字の行）は元の勧告で数える
  const out = [];
  for (const [pkg, v] of Object.entries(j.vulnerabilities ?? {})) {
    for (const via of v.via ?? []) {
      if (typeof via === "string") continue;
      const id = /GHSA-[\w-]+/.exec(via.url ?? "")?.[0] ?? String(via.source);
      out.push({ pkg, id, severity: via.severity ?? v.severity, title: via.title ?? "", range: via.range ?? "" });
    }
  }
  return out;
}

const exPath = join(root, "security-exceptions.json");
const exceptions = existsSync(exPath) ? JSON.parse(readFileSync(exPath, "utf8")).exceptions ?? [] : [];
const problems = [];
for (const e of exceptions) {
  for (const k of ["package", "advisory", "reason", "expires"]) if (!e[k]) problems.push(`例外の「${k}」が空です: ${JSON.stringify(e)}`);
  if (e.expires && e.expires < today) problems.push(`例外の期限切れ（${e.expires}）: ${e.package} ${e.advisory} … 直すか、理由を見直して期限を延ばす`);
}
const excepted = (f) => exceptions.find((e) => e.package === f.pkg && e.advisory === f.id && !(e.expires < today));

const prod = audit(true).filter((f) => RANK[f.severity] >= RANK.moderate).map((f) => ({ ...f, scope: "本番" }));
const prodKeys = new Set(prod.map((f) => f.pkg + f.id));
const dev = audit(false).filter((f) => RANK[f.severity] >= RANK.high && !prodKeys.has(f.pkg + f.id)).map((f) => ({ ...f, scope: "開発用" }));
const all = [...prod, ...dev];
const failing = all.filter((f) => !excepted(f));
const used = new Set(all.filter(excepted).map((f) => f.pkg + f.id));
const unused = exceptions.filter((e) => !used.has(e.package + e.advisory));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ failing, excepted: all.filter(excepted), unused, problems }, null, 2));
} else {
  for (const f of all) console.log("%s %s [%s] %s %s %s", excepted(f) ? "例外" : "NG  ", f.scope, f.severity, f.pkg, f.id, f.title);
  for (const e of unused) console.log("（使われていない例外。消してよい）%s %s", e.package, e.advisory);
  for (const p of problems) console.log("NG   %s", p);
  console.log(failing.length || problems.length ? "❌ 依存の門: 落ちました" : "✅ 依存の門: 通りました（本番 moderate 以上・開発用 high 以上が、例外を除いて0件）");
}
process.exit(failing.length || problems.length ? 1 : 0);
