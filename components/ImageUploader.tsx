"use client";
/* 画像を選んで上げる部品。送る前に手元で長辺 2048px・JPEG に縮める（送る量を減らし、server action の上限 4MB に収める）。
   本当の確認と作り直し（形式・大きさ・EXIF を落とす）はサーバーでやる（lib/actions/upload.ts）。
   value は置き場所のパスと表示用の URL の組。並べ替えは左右の矢印で。 */
import { useRef, useState } from "react";
import { uploadImage, type UploadKind } from "@/lib/actions/upload";

export type UploadedImage = { path: string; url: string };

const MAX_SIDE = 2048;
const SEND_LIMIT = 3.5 * 1024 * 1024;

/** 手元で縮める。読めない画像はそのまま送る（サーバーが断る） */
export async function shrinkImage(file: File, maxSide = MAX_SIDE, quality = 0.85): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size <= SEND_LIMIT && file.type === "image/jpeg") {
      bmp.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    let q = quality;
    let blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
    while (blob && blob.size > SEND_LIMIT && q > 0.5) {
      q -= 0.1;
      blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
    }
    return blob ?? file;
  } catch {
    return file;
  }
}

type Props = {
  kind: UploadKind;
  value: UploadedImage[];
  onChange: (next: UploadedImage[]) => void;
  max: number;
  threadId?: string;
  /** 見た目を見本に合わせるときのクラス */
  className?: string;
  label?: string;
  disabled?: boolean;
};

export default function ImageUploader({ kind, value, onChange, max, threadId, className, label = "画像を追加", disabled }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    let next = [...value];
    try {
      for (const f of Array.from(files).slice(0, Math.max(0, max - next.length))) {
        // 画像でない物・縮められなかった大きい物は送らない（送ると server action の上限で落ち、通信の失敗に見える）
        if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
          setError("JPEG・PNG・WebP の画像だけ使えます。");
          break;
        }
        const blob = await shrinkImage(f);
        if (blob.size > SEND_LIMIT) {
          setError("画像を読み込めないか、大きすぎます。別の画像でお試しください。");
          break;
        }
        const fd = new FormData();
        fd.set("kind", kind);
        if (threadId) fd.set("threadId", threadId);
        fd.set("file", blob, "image.jpg");
        const r = await uploadImage(fd);
        if (!r.ok) {
          setError(r.error);
          break;
        }
        if (r.data) {
          next = [...next, r.data];
          onChange(next);
        }
      }
    } catch {
      setError("画像を送れませんでした。電波の良い所で、もう一度お試しください。");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  }

  return (
    <div className={className ?? "pt-uploader"}>
      <div className="pt-uploader-grid">
        {value.map((img, i) => (
          <div className="pt-uploader-item" key={img.path}>
            <img src={img.url} alt={`画像 ${i + 1}`} />
            {i === 0 && kind === "listing" && <span className="pt-uploader-main">メイン</span>}
            <div className="pt-uploader-tools">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0 || disabled} aria-label="前へ">
                ←
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === value.length - 1 || disabled} aria-label="後ろへ">
                →
              </button>
              <button type="button" onClick={() => onChange(value.filter((_, k) => k !== i))} disabled={disabled} aria-label="外す">
                ×
              </button>
            </div>
          </div>
        ))}
        {value.length < max && (
          <button type="button" className="pt-uploader-add" onClick={() => input.current?.click()} disabled={busy || disabled}>
            {busy ? "送信中…" : `＋ ${label}`}
            <small>
              {value.length}/{max}
            </small>
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple={max - value.length > 1}
        hidden
        onChange={(e) => pick(e.target.files)}
      />
      {error && (
        <p className="pt-msg error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
