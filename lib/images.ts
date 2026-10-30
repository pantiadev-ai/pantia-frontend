/* 上げられた写真を、保存する前にサーバーで作り直す（28 §A8・§O7、SECURITY.md の 5）。
   ・中身の先頭（マジックバイト）で JPEG・PNG・WebP だけを通す（拡張子・Content-Type は信じない）
   ・sharp で読み直して WebP に作り直す。EXIF（撮った場所の緯度経度・機種）などのメタデータは全部落ちる
     （sharp は withMetadata を付けない限り書き出さない。向きだけは rotate() で先に画素へ焼き込む）
   ・大きさ: 受け取りは 8MB まで、画素数は 4,000万まで（巨大な画像で落とす攻撃を止める）、長辺は用途ごとに縮める
   ・出品とつぶやきの写真は、綺麗に見えすぎないよう、わざと少し粗くする（2026-10-30 運営の依頼。見比べて「ほどほど」を選んだ）。
     粗さは長辺と画質だけで出す（見本に付けた sharp の blur(0.5) は弱すぎて画素が1つも変わっていなかった） */
import "server-only";
import sharp from "sharp";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export type ImageKind = "listing" | "cover" | "avatar" | "post" | "chat" | "kyc";

/** 用途ごとの作り直し方。side は長辺、quality は WebP の画質 */
export const IMAGE_SPEC: Record<ImageKind, { side: number; quality: number }> = {
  listing: { side: 1080, quality: 55 },
  post: { side: 1080, quality: 55 },
  // カバーは横長で大きめに見せるので、粗くせずに大きく残す
  cover: { side: 1600, quality: 82 },
  avatar: { side: 600, quality: 82 },
  chat: { side: 1600, quality: 82 },
  // 本人確認の書類は文字が読めるよう大きめに残す
  kyc: { side: 2400, quality: 90 },
};

export class ImageError extends Error {}

function sniff(buf: Buffer): "jpeg" | "png" | "webp" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length >= 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "webp";
  return null;
}

/** File（server action の formData）を確かめて作り直す。だめなら ImageError（画面にそのまま出せる文） */
export async function processImage(file: unknown, kind: ImageKind): Promise<{ data: Buffer; width: number; height: number }> {
  if (!(file instanceof File) || file.size === 0) throw new ImageError("画像が選ばれていません。");
  if (file.size > MAX_UPLOAD_BYTES) throw new ImageError("画像が大きすぎます（8MBまで）。");
  const input = Buffer.from(await file.arrayBuffer());
  if (!sniff(input)) throw new ImageError("JPEG・PNG・WebP の画像だけ使えます。");
  try {
    const { side, quality } = IMAGE_SPEC[kind];
    const { data, info } = await sharp(input, { limitInputPixels: 40_000_000, failOn: "error" })
      .rotate()
      .resize({ width: side, height: side, fit: "inside", withoutEnlargement: true })
      .webp({ quality })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    throw new ImageError("画像を読み込めませんでした。別の画像でお試しください。");
  }
}
