/* webhook の署名の確かめ（HMAC-SHA256）。server-only や環境変数に頼らないので、単体試験から直に呼べる（tests/unit/hmac.test.ts）。 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** 生の本文の HMAC-SHA256 と、見出しの16進の値（前に "sha256=" が付いていてもよい）を、時間が一定の比べ方で照らす */
export function verifyHmacSha256Hex(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const hex = header.trim().replace(/^sha256=/i, "");
  if (!/^[0-9a-f]{64}$/i.test(hex)) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  const given = Buffer.from(hex, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
