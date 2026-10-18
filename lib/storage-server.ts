/* 画像の置き場（サーバーだけ）。書くのも消すのも service_role（storage.objects に方針が無い＝画面からは触れない）。
   呼ぶ前に、呼び手がその場所に書いてよいかを必ず確かめておくこと（lib/actions/upload.ts）。 */
import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

export type Bucket = "listing-images" | "avatars" | "post-images" | "chat-images" | "kyc-documents";

const PATH_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/;

/** 作り直した webp を置く。場所は <folder>/<新しい uuid>.webp。置いた場所を返す */
export async function putImage(bucket: Bucket, folder: string, data: Buffer): Promise<string> {
  if (!/^[0-9a-f-]{36}$/.test(folder)) throw new Error("置き場所の形が違います");
  const path = `${folder}/${crypto.randomUUID()}.webp`;
  const { error } = await createServiceClient()
    .storage.from(bucket)
    .upload(path, data, { contentType: "image/webp", upsert: false, cacheControl: "31536000" });
  if (error) throw new Error(`画像を置けませんでした: ${error.message}`);
  return path;
}

/** 非公開の箱の期限つき URL。チャットは60分、本人確認の書類は5分（管理画面で見る間だけ） */
export async function signedUrls(bucket: "chat-images" | "kyc-documents", paths: string[]): Promise<Record<string, string>> {
  const ok = paths.filter((p) => PATH_RE.test(p));
  if (ok.length === 0) return {};
  const expires = bucket === "kyc-documents" ? 5 * 60 : 60 * 60;
  const { data, error } = await createServiceClient().storage.from(bucket).createSignedUrls(ok, expires);
  if (error || !data) return {};
  const out: Record<string, string> = {};
  for (const row of data) {
    if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  }
  return out;
}

/** まとめて消す（退会・本人確認の書類の保存期間切れ）。形の違うパスは触らない */
export async function removeImages(bucket: Bucket, paths: string[]): Promise<{ removed: number; error: string | null }> {
  const ok = paths.filter((p) => PATH_RE.test(p));
  if (ok.length === 0) return { removed: 0, error: null };
  const { data, error } = await createServiceClient().storage.from(bucket).remove(ok);
  return { removed: data?.length ?? 0, error: error ? error.message : null };
}
