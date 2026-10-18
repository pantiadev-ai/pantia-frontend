/* 二段階認証（TOTP・RFC 6238。SHA-1・30秒・6桁）の番号を作る。管理画面の試験で使う */
import { createHmac } from "node:crypto";

function base32(s: string): Buffer {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of s.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase()) {
    const v = abc.indexOf(ch);
    if (v < 0) throw new Error("TOTP の秘密の形が違います");
    bits += v.toString(2).padStart(5, "0");
  }
  const out: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}

export function totp(secret: string, at = Date.now()): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac("sha1", base32(secret)).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  const n = (((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1_000_000;
  return String(n).padStart(6, "0");
}

/** 30秒の切り替わりの直前なら、次の窓まで待つ（入れている間に番号が変わらないように） */
export async function freshTotp(secret: string): Promise<string> {
  const left = 30 - (Math.floor(Date.now() / 1000) % 30);
  if (left < 5) await new Promise((r) => setTimeout(r, (left + 1) * 1000));
  return totp(secret);
}
