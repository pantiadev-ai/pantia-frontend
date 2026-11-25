/* 運営が出品日を変える窓の、日時の読み書き。
   窓の欄（datetime-local）は日本時間の「2026-11-20T23:30」で、DB へは +09:00 つきで渡す。
   node:test から読むので import は置かない。 */

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const JST_MS = 9 * 60 * 60 * 1000;
/** これより前は打ち間違いとみなす（DB の admin_set_listing_published_at と同じ） */
const FLOOR = Date.parse("2000-01-01T00:00:00+09:00");

/** 欄の値（日本時間）を +09:00 つきの日時にする。形が違う・ありえない日時なら null */
export function jstLocalToIso(local: string): string | null {
  const m = LOCAL.exec(local);
  if (!m) return null;
  const [, y, mo, d, h, mi, s = "00"] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}+09:00`;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  // 2月30日などは Date が繰り上げるので、戻して同じになるかで確かめる
  const back = new Date(t + JST_MS).toISOString().slice(0, 19);
  return back === `${y}-${mo}-${d}T${h}:${mi}:${s}` ? iso : null;
}

/** 保存されている日時を、窓の初めの値（日本時間・分まで）にする。読めなければ空 */
export function isoToJstLocal(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t + JST_MS).toISOString().slice(0, 16);
}

/** 変えてよい日時か。だめなら画面に出す文 */
export function publishedAtError(iso: string, now: Date): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t) || t < FLOOR) return "日時を確かめてください。";
  if (t > now.getTime()) return "今より先の日時にはできません。";
  return null;
}
