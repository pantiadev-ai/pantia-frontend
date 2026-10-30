/* 上げられた写真の作り直し（lib/images.ts）。npm run test:unit で流す
   （lib/images.ts は "server-only" を読むので、test:unit に --conditions=react-server を付けてある） */
import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { IMAGE_SPEC, ImageError, processImage, type ImageKind } from "../../lib/images.ts";

const MARK = "UNIT-EXIF-SECRET";
const KINDS = Object.keys(IMAGE_SPEC) as ImageKind[];

/** 3000×2000 の JPEG（撮った人の名前を EXIF に入れる） */
function bigJpeg(): Promise<Buffer> {
  return sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#9cf" } })
    .jpeg()
    .withExif({ IFD0: { Artist: MARK, Copyright: MARK } })
    .toBuffer();
}

const W = 800;
const H = 600;

/** 写真に近い画像（色の変わり目にざらつきを足す。縮まない 800×600）の生の画素 */
function photoRaw(): Buffer {
  const raw = Buffer.alloc(W * H * 3);
  let seed = 1;
  const noise = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) % 41) - 20;
  for (let i = 0; i < W * H; i++) {
    const x = i % W;
    const y = Math.floor(i / W);
    raw[i * 3] = Math.max(0, Math.min(255, (x * 255) / W + noise()));
    raw[i * 3 + 1] = Math.max(0, Math.min(255, (y * 255) / H + noise()));
    raw[i * 3 + 2] = Math.max(0, Math.min(255, 128 + noise()));
  }
  return raw;
}

/** 作り直した画像が、元の画素からどれだけずれたか（1画素あたり。大きいほど粗い） */
async function drift(webp: Buffer, raw: Buffer): Promise<number> {
  const { data } = await sharp(webp).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (let i = 0; i < raw.length; i++) sum += Math.abs(data[i] - raw[i]);
  return sum / raw.length;
}

const fileOf = (buf: Buffer, name: string, type: string) => new File([new Uint8Array(buf)], name, { type });

test("用途ごとに長辺を縮め、WebP にして、EXIF を落とす", async () => {
  const input = await bigJpeg();
  for (const kind of KINDS) {
    const out = await processImage(fileOf(input, "a.jpg", "image/jpeg"), kind);
    assert.equal(Math.max(out.width, out.height), IMAGE_SPEC[kind].side, kind);
    assert.equal(out.data.toString("latin1", 8, 12), "WEBP", kind);
    assert.equal(out.data.includes(Buffer.from(MARK)), false, kind);
  }
});

test("出品とつぶやきの写真だけ長辺1080・画質55に落とし、ほかは画質80以上で残す", () => {
  assert.deepEqual(IMAGE_SPEC.listing, { side: 1080, quality: 55 });
  assert.deepEqual(IMAGE_SPEC.post, { side: 1080, quality: 55 });
  for (const kind of ["cover", "avatar", "chat", "kyc"] as const) assert.ok(IMAGE_SPEC[kind].quality >= 80, kind);
});

test("出品とつぶやきの写真は、メッセージの写真より粗くなる（大きさは同じ）", async () => {
  const raw = photoRaw();
  const input = await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
  const chat = await processImage(fileOf(input, "p.png", "image/png"), "chat");
  for (const kind of ["listing", "post"] as const) {
    const out = await processImage(fileOf(input, "p.png", "image/png"), kind);
    // 小さい画像は大きくも小さくもしない
    assert.deepEqual([out.width, out.height], [W, H], kind);
    assert.ok(out.data.length < chat.data.length, kind);
    assert.ok((await drift(out.data, raw)) > (await drift(chat.data, raw)), kind);
  }
});

test("画像でない物は ImageError で断る", async () => {
  await assert.rejects(processImage(fileOf(Buffer.from("hello"), "a.jpg", "image/jpeg"), "listing"), ImageError);
  await assert.rejects(processImage("a.jpg", "post"), ImageError);
});
