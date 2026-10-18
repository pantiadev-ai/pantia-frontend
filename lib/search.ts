/* 利用者の入力を PostgREST の検索に入れる前に通す（28 §A12）。
   .ilike() には escapeLike、.or() の中に入れる値には safeSearch。 */

/** LIKE の記号（\ % _）を文字として扱わせる */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** .or("title.ilike.%…%") の中に入れる値。PostgREST の区切り（, . : ( ) " ）と LIKE の記号（\ % _）を外す。
    長さも切る（長い文字で DB を重くしない）。空になったら null（検索しない） */
export function safeSearch(s: unknown, max = 50): string | null {
  if (typeof s !== "string") return null;
  const cleaned = s
    .normalize("NFKC")
    .replace(/[\\%_,.:()"'*\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return cleaned === "" ? null : cleaned;
}

/** UUID の形か（URL の id を DB に渡す前に確かめる） */
export function isUuid(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
