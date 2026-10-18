/* チャットの表示用の小さな関数。サーバーでもブラウザでも使う（server-only の物は import しない） */
import { displayName, maskName } from "@/lib/format";
import { avatarImage } from "@/lib/storage";
import type { MessageKind, ThreadRow } from "./types";

const TZ = "Asia/Tokyo";
const WITHDRAWN = "退会したユーザー";

export const BODY_MAX = 1000;
export const KINDS: readonly MessageKind[] = ["text", "image", "item", "system", "shipping"];
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** チャットの画像の置き場所（<会話の id>/<uuid>.webp。DB の paths_ok と同じ形） */
export const CHAT_PATH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;
/** 時刻の文字（PostgREST の 2026-10-15T05:12:33.123456+00:00 と、Realtime の空白区切り・時差なしの両方） */
export const ISO_RE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)?$/;

/** 相手の名前。購入者の名前を出品者に見せるときは伏せる（退会した人の「退会したユーザー」は伏せない） */
export function otherName(name: string | null | undefined, role: string | null | undefined): string {
  const s = displayName(name);
  return role === "buyer" && s !== WITHDRAWN ? maskName(s) : s;
}

/** アイコンが無いときに出す頭の1字 */
export function initialOf(name: string): string {
  return Array.from(name.trim())[0] ?? "?";
}

/** my_threads の1行を画面の形にする。生成された型は null を書いていないが、退会した相手などは null が来る */
export function toThreadRow(r: {
  thread_id: string;
  other_id: string | null;
  other_name: string | null;
  other_avatar: string | null;
  other_role: string | null;
  other_last_seen: string | null;
  other_verified: boolean | null;
  last_message_at: string | null;
  preview: string | null;
  unread: number | null;
  muted: boolean | null;
}): ThreadRow {
  const role = r.other_role === "seller" || r.other_role === "buyer" ? r.other_role : null;
  return {
    threadId: r.thread_id,
    otherId: r.other_id ?? null,
    name: otherName(r.other_name, role),
    avatarUrl: avatarImage(r.other_avatar),
    role,
    lastSeenAt: r.other_last_seen ?? null,
    verified: !!r.other_verified,
    lastMessageAt: r.last_message_at ?? "",
    preview: r.preview ?? "",
    unread: Math.max(0, Number(r.unread) || 0),
    muted: !!r.muted,
  };
}

/** 時刻の文字を「2026-10-15T05:12:33.123456+00:00」の形にそろえる。読めなければ null */
export function normIso(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = ISO_RE.exec(v.trim());
  if (!m) return null;
  const frac = (m[3] ?? "").padEnd(6, "0");
  let tz = m[4] ?? "+00:00"; // Realtime の timestamptz は UTC で来る
  if (tz === "Z") tz = "+00:00";
  else if (/^[+-]\d{2}$/.test(tz)) tz = `${tz}:00`;
  else if (/^[+-]\d{4}$/.test(tz)) tz = `${tz.slice(0, 3)}:${tz.slice(3)}`;
  return `${m[1]}T${m[2]}.${frac}${tz}`;
}

/** Date にする（JS はミリ秒までしか読まないので、そこで切る） */
export function toDate(iso: string): Date | null {
  const n = normIso(iso);
  if (!n) return null;
  const d = new Date(n.slice(0, 23) + n.slice(26));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 並べるための鍵（UTC のミリ秒＋マイクロ秒の残り）。文字の大小で時刻順になる */
export function sortKey(iso: string): string {
  const n = normIso(iso);
  const d = toDate(iso);
  if (!n || !d) return "";
  return `${d.toISOString().slice(0, 23)}${n.slice(23, 26)}`;
}

function ymd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** 日本時間の日付（区切りを入れる判定に使う） */
export function dayKey(iso: string): string {
  const d = toDate(iso);
  return d ? ymd(d) : "";
}

/** 日付の区切りの文字（今日・昨日・10月15日（水）） */
export function dayLabel(iso: string): string {
  const d = toDate(iso);
  if (!d) return "";
  const now = new Date();
  const key = ymd(d);
  if (key === ymd(now)) return "今日";
  if (key === ymd(new Date(now.getTime() - 86400000))) return "昨日";
  const md = new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, month: "long", day: "numeric" }).format(d);
  const wd = new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, weekday: "short" }).format(d);
  return `${md}（${wd}）`;
}

/** 一覧の時刻（今日は 14:22、昨日は「昨日」、それより前は 5/7） */
export function listTime(iso: string): string {
  const d = toDate(iso);
  if (!d) return "";
  const now = new Date();
  const key = ymd(d);
  if (key === ymd(now)) return new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
  if (key === ymd(new Date(now.getTime() - 86400000))) return "昨日";
  return new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, month: "numeric", day: "numeric" }).format(d);
}

/** 吹き出しの時刻（14:22） */
export function clock(iso: string): string {
  const d = toDate(iso);
  return d ? new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d) : "";
}

/** 会話が1つも無いときの案内（出品者は待つ側、購入者は出品者のページから送る側） */
export function listEmpty(role: string): { text: string; link?: { href: string; label: string } } {
  return role === "seller"
    ? { text: "購入者からのメッセージがここに届きます。" }
    : { text: "気になる出品者のページからメッセージを送れます。", link: { href: "/sellers", label: "出品者をさがす" } };
}
