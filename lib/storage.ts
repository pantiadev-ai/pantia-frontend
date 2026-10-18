/* 画像の URL。公開の箱（出品・アイコン・つぶやき）は公開 URL をそのまま組み立てる（DB に問い合わせない）。
   非公開の箱（チャット・本人確認）の期限つき URL は lib/storage-server.ts（サーバーだけ）。
   パスは DB の check（<持ち主>/<uuid>.webp）を通った物だけが入っている。念のため形をもう一度見る。 */

export type PublicBucket = "listing-images" | "avatars" | "post-images";

const PATH_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/;

/** 公開の箱の画像の URL。パスが無い・形が違うときは null（画面は代わりの絵を出す） */
export function publicImageUrl(bucket: PublicBucket, path: string | null | undefined): string | null {
  if (!path || !PATH_RE.test(path)) return null;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

export const listingImage = (p: string | null | undefined) => publicImageUrl("listing-images", p);
export const avatarImage = (p: string | null | undefined) => publicImageUrl("avatars", p);
export const postImage = (p: string | null | undefined) => publicImageUrl("post-images", p);
