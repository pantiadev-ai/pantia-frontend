#!/usr/bin/env node
/* 設計メモの門（28 §0・§K8）。SECURITY.md が無い・埋め残しがある・見出しが消えていると落とす。
     node scripts/security-design-check.mjs            … 着手前〜作る間（門が push ごとに流す）。「仮」は一覧で知らせるだけ
     node scripts/security-design-check.mjs --release  … 公開の前（28 §0 の段4）。「仮」が1つでも残っていたら落とす
   設計を飛ばしてコードを書き始める・決めないまま公開するのを、機械で止めるためのもの。
   見ているのは形（埋めたか・決めたか）だけで、中身が正しいかは見ない。中身は 28 の項目で人が確かめる。
   型の正本: C:\Users\OWNER\dev\ai-kakumei\_security\gate\（全リポで同じ物。直したら正本から写す） */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const release = process.argv.includes("--release");
const file = join(process.cwd(), "SECURITY.md");
if (!existsSync(file)) {
  console.log("❌ 設計メモの門: SECURITY.md がありません。正本 C:\\Users\\OWNER\\dev\\ai-kakumei\\_security\\gate\\SECURITY.md を写して埋める");
  process.exit(1);
}
const lines = readFileSync(file, "utf8").split(/\r?\n/);
const text = lines.join("\n");
const REQUIRED = [
  "## 1. 何を預かるか", "## 2. 役割と権限", "## 3. 入口", "## 4. 秘密", "## 5. ファイル・写真・音声",
  "## 6. 外へ送る物", "## 7. 消えても戻す", "## 8. ASVS 5.0 の章", "## 9. 例外",
];
// 説明の引用（> で始まる行）は数えない。印の説明が書いてあるため
const body = lines.map((line, i) => ({ line, n: i + 1 })).filter(({ line }) => !line.trimStart().startsWith(">"));
const left = body.filter(({ line }) => line.includes("［書く"));
const provisional = body.filter(({ line }) => /(^|[|：:\s（(])仮[（(]|(^|[|：:\s])仮\s*($|[|])/.test(line));
const missing = REQUIRED.filter((h) => !text.includes(h));

const show = (label, list) => {
  for (const { line, n } of list.slice(0, 30)) console.log("%s %d行目: %s", label, n, line.trim().slice(0, 120));
  if (list.length > 30) console.log("%s ほか %d か所", label, list.length - 30);
};
show("NG  ", left);
for (const h of missing) console.log("NG   見出しが消えています: %s", h);
show(release ? "NG  " : "仮  ", provisional);

const fail = left.length || missing.length || (release && provisional.length);
if (fail) {
  console.log("❌ 設計メモの門%s: 埋め残し %d か所・消えた見出し %d 個%s", release ? "（公開前）" : "", left.length, missing.length,
    release ? `・仮のまま ${provisional.length} か所` : "");
  process.exit(1);
}
console.log(provisional.length
  ? `✅ 設計メモの門: 埋まっています（「仮」が ${provisional.length} か所。公開の前に --release で全部なくす）`
  : `✅ 設計メモの門${release ? "（公開前）" : ""}: 埋まっています`);
