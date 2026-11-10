#!/usr/bin/env node
/* デザイン見本（revivalworks.jp/labelname/*.css）を、ページごとの囲い（.pg-<名前>）の中だけに効くように書き換える。

   なぜ: Next.js の App Router は、ページを移っても前のページの CSS を外さない（node_modules/next/dist/docs の CSS の項）。
   見本の CSS はページごとに同じクラス名（.header・.card など）を別の形で書いているので、そのまま読むと
   ページを移るたびに見た目が混ざる。そこで全部のセレクタの頭に .pg-<名前> を付ける。

   書き換え:
     :root / html / body          → .pg-<名前>（変数・背景・文字の大きさを囲いに持たせる）
     * の全体リセット             → :where(.pg-<名前>) *（強さ0。見本の * と同じ強さにして、共通の部品 .pt-* の余白を消さない）
     それ以外のセレクタ           → .pg-<名前> <セレクタ>
     @keyframes X                 → @keyframes <名前>-X（animation の中の名前も合わせる）
     'Plus Jakarta Sans'・'Noto Sans JP' → next/font の変数（app/layout.tsx）
     先頭の @import（Google Fonts） → 消す（next/font で自前で配る。CSP で外のフォントを許さないため）

   使い方: node scripts/scope-css.mjs <見本の CSS のフォルダ> <出力のフォルダ>
     見本の style.css は base.css として書き出す（見本の無い画面が使う共通の型）。

   いまの styles/*.css は、これで作ったあと手で直接直している（2026-11-11 から）。流し直すと直しが消えるので、
   出力のフォルダに同じ名前のファイルがあるときは書かずに飛ばす。新しい見本を足すときは、空のフォルダに書き出して手で移す。 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import postcss from "postcss";

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.log("使い方: node scripts/scope-css.mjs <見本の CSS のフォルダ> <出力のフォルダ>");
  process.exit(1);
}
mkdirSync(out, { recursive: true });

const ROOTLIKE = /^(?::root|html|body)$/;

function scopeSelector(sel, scope) {
  const s = sel.trim();
  if (ROOTLIKE.test(s)) return scope;
  if (/^\*(::?[\w-]+)?$/.test(s)) return `:where(${scope}) ${s}`;
  // 「body .x」「html body .x」のように根から始まる物は、根を囲いに置き換える。
  // 「body::before」「body.dark」のように間が空いていない物は、囲いそのものに付ける（空けると中の全部の要素に効いてしまう）
  const m = s.match(/^(?:html\s+)?(?:body|html|:root)(\s*[>+~]?\s*)(.+)$/);
  if (m) return `${scope}${m[1] === "" ? "" : m[1].trim() ? ` ${m[1].trim()} ` : " "}${m[2]}`;
  return `${scope} ${s}`;
}

for (const file of readdirSync(src).filter((f) => f.endsWith(".css")).sort()) {
  const name = basename(file, ".css") === "style" ? "base" : basename(file, ".css").replace(/_/g, "-");
  const scope = `.pg-${name}`;
  const dest = join(out, `${name}.css`);
  if (existsSync(dest)) {
    console.log(`飛ばした ${name}.css（もうある。手で直しているので上書きしない。空のフォルダに書き出して手で移す）`);
    continue;
  }
  const root = postcss.parse(readFileSync(join(src, file), "utf8"));
  const frames = new Set();

  root.walkAtRules(/^(import|charset)$/, (r) => r.remove());
  root.walkAtRules("keyframes", (r) => {
    frames.add(r.params.trim());
    r.params = `${name}-${r.params.trim()}`;
  });
  root.walkRules((rule) => {
    if (rule.parent?.type === "atrule" && /keyframes$/.test(rule.parent.name)) return;
    rule.selectors = rule.selectors.map((s) => scopeSelector(s, scope));
  });
  root.walkDecls((d) => {
    if (/^animation(-name)?$/.test(d.prop)) {
      d.value = d.value.replace(/[A-Za-z_][\w-]*/g, (w) => (frames.has(w) ? `${name}-${w}` : w));
    }
    if (d.prop === "font-family") {
      d.value = d.value
        .replace(/['"]Plus Jakarta Sans['"]/g, "var(--font-jakarta)")
        .replace(/['"]Noto Sans JP['"]/g, "var(--font-noto)");
    }
  });
  // 囲いは body の代わりなので、画面の高さいっぱいに伸ばす
  root.prepend(postcss.rule({ selector: scope, nodes: [postcss.decl({ prop: "min-height", value: "100vh" })] }));
  root.prepend(postcss.comment({ text: ` 元は scripts/scope-css.mjs で作った（元: revivalworks.jp/labelname/${file}）。いまは手で直接直している。流し直さない（流し直すと直しが消える） ` }));

  // 確かめたあとに同じ名前のファイルができていても、上書きしない（wx）
  writeFileSync(dest, root.toString(), { flag: "wx" });
  console.log(`書いた ${name}.css（囲い ${scope}・keyframes ${frames.size}）`);
}
