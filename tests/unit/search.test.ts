/* 検索の入力の逃がし（28 §A12）。npm run test:unit で流す */
import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeLike, isUuid, safeSearch } from "../../lib/search.ts";

const BS = String.fromCharCode(92); // 「\」1文字

test("escapeLike は \\ % _ を文字として逃がす", () => {
  assert.equal(escapeLike("a%b"), `a${BS}%b`);
  assert.equal(escapeLike("a_b"), `a${BS}_b`);
  assert.equal(escapeLike(`a${BS}b`), `a${BS}${BS}b`);
  assert.equal(escapeLike(`100%_${BS}`), `100${BS}%${BS}_${BS}${BS}`);
  assert.equal(escapeLike("ふつうの文字"), "ふつうの文字");
});

test("safeSearch は PostgREST の区切りと LIKE の記号を外し、空なら null", () => {
  assert.equal(safeSearch("a,b.(c)%_"), "a b c");
  assert.equal(safeSearch(`a${BS}b`), "a b");
  assert.equal(safeSearch("   "), null);
  assert.equal(safeSearch(123), null);
  assert.equal(safeSearch("x".repeat(80))?.length, 50);
  assert.equal(safeSearch("ＡＢＣ"), "ABC");
});

test("isUuid は UUID の形だけ通す", () => {
  assert.equal(isUuid("123e4567-e89b-12d3-a456-426614174000"), true);
  assert.equal(isUuid("123e4567-e89b-12d3-a456-42661417400"), false);
  assert.equal(isUuid("../etc/passwd"), false);
  assert.equal(isUuid(null), false);
});
