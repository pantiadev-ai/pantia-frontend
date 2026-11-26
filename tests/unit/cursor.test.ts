/* 改修リスト 行17: 商品画像・出品者の写真にマウスを乗せても、カーソルは「＋の虫眼鏡」にせず矢印のまま */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..");

function cssBlock(file: string, selector: string): string {
  const css = readFileSync(join(root, "styles", file), "utf8");
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `${file} に ${selector} がありません`);
  return css.slice(start, css.indexOf("}", start));
}

test("styles のどこにも zoom-in のカーソルが無い", () => {
  for (const f of readdirSync(join(root, "styles")).filter((n) => n.endsWith(".css"))) {
    assert.doesNotMatch(readFileSync(join(root, "styles", f), "utf8"), /cursor:\s*zoom-in/, f);
  }
});

test("商品の大きい画像と出品者の写真は矢印のカーソル", () => {
  assert.match(cssBlock("item-detail.css", ".pg-item-detail .main-img"), /cursor:\s*default/);
  assert.match(cssBlock("seller-profile.css", ".pg-seller-profile .profile-photo"), /cursor:\s*default/);
});
