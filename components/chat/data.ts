/* チャットの読み込み（サーバーだけ）。ページと server action の両方から使う。
   読むのはすべて利用者の権限（RLS）。messages は当事者で、見える物（visible か、自分の held）だけが返る。 */
import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { listingImage } from "@/lib/storage";
import { signedUrls } from "@/lib/storage-server";
import type { ChatListing, ChatMessage, ChatPage, MessageKind } from "./types";
import { CHAT_PATH_RE, KINDS, normIso } from "./view";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const PAGE_SIZE = 50;
const COLUMNS = "id, sender_id, kind, body, image_paths, listing_id, order_id, hearted, status, created_at";

type Row = {
  id: string;
  sender_id: string | null;
  kind: string;
  body: string;
  image_paths: string[] | null;
  listing_id: string | null;
  order_id: string | null;
  hearted: boolean;
  status: string;
  created_at: string;
};

/** 商品カード用に、メッセージに付いた商品を読む（RLS で見えない物は入らない） */
async function loadListings(supabase: Supabase, ids: string[]): Promise<Map<string, ChatListing>> {
  const map = new Map<string, ChatListing>();
  if (ids.length === 0) return map;
  const { data } = await supabase.from("listings").select("id, title, price, image_paths").in("id", ids);
  for (const l of data ?? []) {
    map.set(l.id, { id: l.id, title: l.title, price: l.price, imageUrl: listingImage(l.image_paths?.[0]) });
  }
  return map;
}

/** DB の行を画面の形にする。画像は期限つき URL（60分）にする */
export async function toChatMessages(supabase: Supabase, rows: Row[]): Promise<ChatMessage[]> {
  const ok = rows.filter((r) => (KINDS as readonly string[]).includes(r.kind) && r.status !== "hidden");
  const paths = ok.flatMap((r) => (r.image_paths ?? []).filter((p) => CHAT_PATH_RE.test(p)));
  const listingIds = [...new Set(ok.map((r) => r.listing_id).filter((x): x is string => !!x))];
  const [urls, listings] = await Promise.all([
    paths.length > 0 ? signedUrls("chat-images", paths) : Promise.resolve({} as Record<string, string>),
    loadListings(supabase, listingIds),
  ]);
  return ok.map((r) => ({
    id: r.id,
    senderId: r.sender_id,
    kind: r.kind as MessageKind,
    body: r.body ?? "",
    images: (r.image_paths ?? []).filter((p) => CHAT_PATH_RE.test(p)).map((p) => ({ path: p, url: urls[p] ?? null })),
    listingId: r.listing_id,
    listing: r.listing_id ? (listings.get(r.listing_id) ?? null) : null,
    orderId: r.order_id,
    hearted: !!r.hearted,
    held: r.status === "held",
    createdAt: normIso(r.created_at) ?? r.created_at,
  }));
}

/** 会話のメッセージを新しい方から50件（before より前）。画面には古い順で返す。
    before は（時刻, id）の組。同じ時刻のメッセージが続いても取りこぼさない。呼ぶ前に形を確かめておくこと（ISO_RE・UUID_RE） */
export async function loadMessages(supabase: Supabase, threadId: string, before?: { at: string; id: string }): Promise<ChatPage> {
  let q = supabase
    .from("messages")
    .select(COLUMNS)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1);
  // 時刻には「:」「.」が入るので、PostgREST の決まりどおり二重引用符で囲む
  if (before) q = q.or(`created_at.lt."${before.at}",and(created_at.eq."${before.at}",id.lt.${before.id})`);
  const { data, error } = await q;
  if (error) throw new Error(`メッセージを読めませんでした: ${error.code ?? ""}`);
  const rows = (data ?? []) as Row[];
  const hasMore = rows.length > PAGE_SIZE;
  const page = rows.slice(0, PAGE_SIZE).reverse();
  return { messages: await toChatMessages(supabase, page), hasMore };
}

/** 相手の既読時刻（自分の送った物に「既読」を付けるため） */
export function otherReadAt(
  t: { seller_id: string; seller_last_read_at: string | null; buyer_last_read_at: string | null },
  viewerId: string,
): string | null {
  return t.seller_id === viewerId ? t.buyer_last_read_at : t.seller_last_read_at;
}
