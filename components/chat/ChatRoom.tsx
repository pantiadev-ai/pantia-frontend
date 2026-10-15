"use client";
/* 会話の本体（メッセージの並び・送る欄）。chat-main の中に置く。
   新しいメッセージは Realtime（messages の INSERT/UPDATE）で受ける。つながらないときは見えている間だけ15秒ごとに読み直す。
   本文は文字としてだけ出す（HTML として読ませない・URL を勝手にリンクにしない） */
import { Fragment, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import ImageUploader, { type UploadedImage } from "@/components/ImageUploader";
import ReportButton from "@/components/ReportButton";
import { chatImageUrls, loadLatest, loadOlder, markRead, sendMessage, toggleHeart } from "@/lib/actions/chat";
import { yen } from "@/lib/format";
import { listingImage } from "@/lib/storage";
import { createClient, realtimeReady } from "@/lib/supabase/browser";
import type { ChatMessage, ChatPage, ChatPerson, MessageKind, MyListing } from "./types";
import { BODY_MAX, CHAT_PATH_RE, KINDS, UUID_RE, clock, dayKey, dayLabel, initialOf, normIso, sortKey } from "./view";

const EMOJIS = ["🌸", "💕", "🎀", "✨", "😊", "😂", "🫠", "💗", "📸", "📦", "💳", "🏠"];
const HEART_KINDS: readonly MessageKind[] = ["text", "image", "item"];
const NET_ERROR = "通信に失敗しました。電波の良い所で、もう一度お試しください。";

type Props = {
  threadId: string;
  me: ChatPerson;
  other: ChatPerson;
  /** 自分がこの会話の出品者側か（相手の既読時刻の列と「自分の商品を紹介」に使う） */
  isSeller: boolean;
  initial: ChatPage;
  initialOtherReadAt: string | null;
  myListings: MyListing[];
  /** 送れないときの理由（null なら送れる） */
  closed: { text: string; href?: string; label?: string } | null;
};

/** (時刻, id) の組で比べる。DB の読み込みの区切り（loadMessages）と同じ並び */
function compareMsg(a: ChatMessage, b: ChatMessage): number {
  const ka = sortKey(a.createdAt);
  const kb = sortKey(b.createdAt);
  if (ka !== kb) return ka < kb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** id で重ねて、時刻の順に並べる */
function merge(list: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const map = new Map(list.map((m) => [m.id, m]));
  for (const m of incoming) map.set(m.id, m);
  return [...map.values()].sort(compareMsg);
}

/** 読み直した新しい50件で、その範囲を入れ替える（非表示になった物を消すため）。範囲の外は残す。
    範囲の端は時刻だけでなく (時刻, id) の組で決める。同じ時刻の物が50件の区切りをまたぐと、時刻だけでは外の物まで捨ててしまう。 */
function replaceWindow(list: ChatMessage[], latest: ChatMessage[]): ChatMessage[] {
  if (latest.length === 0) return list;
  const sorted = [...latest].sort(compareMsg);
  const lo = sorted[0]!;
  const hi = sorted[sorted.length - 1]!;
  const outside = list.filter((m) => compareMsg(m, lo) < 0 || compareMsg(m, hi) > 0);
  return merge(outside, latest);
}

/** Realtime で届いた行を確かめて画面の形にする。形の違う物は捨てる */
function fromRow(raw: unknown, threadId: string): ChatMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !UUID_RE.test(r.id) || r.thread_id !== threadId) return null;
  if (typeof r.kind !== "string" || !(KINDS as readonly string[]).includes(r.kind)) return null;
  if (r.status !== "visible" && r.status !== "held") return null;
  const createdAt = normIso(r.created_at);
  if (!createdAt) return null;
  // 配列は JSON の配列で来る。念のため Postgres の {a,b} の形も読む
  const list = Array.isArray(r.image_paths)
    ? r.image_paths
    : typeof r.image_paths === "string"
      ? r.image_paths.replace(/^\{|\}$/g, "").split(",")
      : [];
  const paths = list.filter((p): p is string => typeof p === "string" && CHAT_PATH_RE.test(p)).slice(0, 4);
  const id = (v: unknown) => (typeof v === "string" && UUID_RE.test(v) ? v : null);
  return {
    id: r.id,
    senderId: id(r.sender_id),
    kind: r.kind as MessageKind,
    body: typeof r.body === "string" ? r.body : "",
    images: paths.map((p) => ({ path: p, url: null })),
    listingId: id(r.listing_id),
    listing: null,
    orderId: id(r.order_id),
    hearted: r.hearted === true,
    held: r.status === "held",
    createdAt,
  };
}

function Avatar({ person, className }: { person: ChatPerson; className: string }) {
  return <div className={className}>{person.avatarUrl ? <img src={person.avatarUrl} alt="" className="chat-avatar-img" /> : initialOf(person.name)}</div>;
}

export default function ChatRoom({ threadId, me, other, isSeller, initial, initialOtherReadAt, myListings, closed }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial.messages);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [otherReadAt, setOtherReadAt] = useState(initialOtherReadAt);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [toast, setToast] = useState(false);
  const [text, setText] = useState("");
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [panel, setPanel] = useState<"none" | "image" | "item" | "emoji">("none");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, startSend] = useTransition();
  const [, startHeart] = useTransition();

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  /** 次の描画で一番下へ送る（最初・自分が送った・下を見ていたときに届いた） */
  const stickRef = useRef(true);
  /** 「前を読む」のとき、見ていた位置を保つための元の高さ */
  const keepRef = useRef<{ height: number; top: number } | null>(null);
  /** 一番下のあたりを見ているか（画像の読み込みで高さが変わったときに下へ合わせる） */
  const atBottomRef = useRef(true);
  /** 今の並び（Realtime の受け取りで、もう持っているかを見る） */
  const listRef = useRef<ChatMessage[]>(initial.messages);

  useEffect(() => {
    listRef.current = messages;
  }, [messages]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (keepRef.current) {
      el.scrollTop = el.scrollHeight - keepRef.current.height + keepRef.current.top;
      keepRef.current = null;
    } else if (stickRef.current) {
      el.scrollTop = el.scrollHeight;
      stickRef.current = false;
      atBottomRef.current = true;
    }
  }, [messages]);

  /** 新しく増えた物を入れる。相手の物で、上の方を読んでいたら「↓ 新しいメッセージ」を出す */
  function addIncoming(incoming: ChatMessage[], replace = false) {
    const known = new Set(listRef.current.map((m) => m.id));
    const fresh = incoming.filter((m) => !known.has(m.id));
    const fromOther = fresh.some((m) => m.senderId !== me.id);
    const el = scrollRef.current;
    const near = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (fresh.length > 0) {
      if (near || !fromOther) stickRef.current = true;
      else setToast(true);
    }
    setMessages((prev) => (replace ? replaceWindow(prev, incoming) : merge(prev, incoming)));
    return fromOther;
  }

  /** 新しい方の50件を読み直す。相手から新しい物が来ていれば true */
  async function refreshLatest(): Promise<boolean> {
    try {
      const r = await loadLatest(threadId);
      if (!r.ok || !r.data) return false;
      setOtherReadAt(r.data.otherReadAt);
      return addIncoming(r.data.messages, true);
    } catch {
      return false;
    }
  }

  /** 画像の URL・商品のカードを足す（Realtime の行には入っていないため） */
  async function hydrate(m: ChatMessage) {
    let imgs = m.images;
    let listing = m.listing;
    if (imgs.length > 0) {
      try {
        const r = await chatImageUrls(threadId, imgs.map((i) => i.path));
        if (r.ok && r.data) {
          const urls = r.data;
          imgs = imgs.map((i) => ({ ...i, url: urls[i.path] ?? null }));
        }
      } catch {
        // 読めなければ代わりの絵のまま
      }
    }
    if (m.listingId) {
      const { data } = await createClient().from("listings").select("id, title, price, image_paths").eq("id", m.listingId).maybeSingle();
      if (data) listing = { id: data.id, title: data.title, price: data.price, imageUrl: listingImage(data.image_paths?.[0]) };
    }
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, images: imgs, listing } : x)));
  }

  /** Realtime の1行。相手の新しい物なら true（既読にするため） */
  const onRow = useEffectEvent((type: "INSERT" | "UPDATE", raw: unknown): boolean => {
    const m = fromRow(raw, threadId);
    if (!m) return false;
    const exists = listRef.current.some((x) => x.id === m.id);
    if (exists) {
      if (type === "UPDATE") {
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, hearted: m.hearted, held: m.held } : x)));
      }
      return false;
    }
    // INSERT か、確認が済んで見えるようになった物（UPDATE）
    const fromOther = addIncoming([m]);
    if (m.images.length > 0 || m.listingId) void hydrate(m);
    return fromOther;
  });

  const onThread = useEffectEvent((raw: unknown) => {
    if (!raw || typeof raw !== "object") return;
    const r = raw as Record<string, unknown>;
    const at = normIso(isSeller ? r.buyer_last_read_at : r.seller_last_read_at);
    if (at) setOtherReadAt(at);
  });

  const resync = useEffectEvent(() => refreshLatest());

  useEffect(() => {
    const supabase = createClient();
    let disposed = false;
    let joined = false;
    let poll: ReturnType<typeof setInterval> | null = null;
    let readTimer: ReturnType<typeof setTimeout> | null = null;

    // 見ている間に届いた物は少し待ってから既読にする（続けて届いたときに何度も呼ばない）
    const scheduleRead = () => {
      if (disposed || document.visibilityState !== "visible") return;
      if (readTimer) clearTimeout(readTimer);
      readTimer = setTimeout(() => {
        readTimer = null;
        markRead(threadId).catch(() => undefined);
      }, 800);
    };
    const sync = () => {
      void resync().then((fromOther) => {
        if (fromOther) scheduleRead();
      });
    };
    const startPolling = () => {
      if (disposed || poll) return;
      poll = setInterval(() => {
        if (document.visibilityState === "visible") sync();
      }, 15000);
    };
    const stopPolling = () => {
      if (poll) clearInterval(poll);
      poll = null;
    };

    markRead(threadId).catch(() => undefined);

    const filter = `thread_id=eq.${threadId}`;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    // 鍵を渡してから購読する（渡す前に参加すると anon 扱いで何も届かない。lib/supabase/browser.ts の realtimeReady）
    void realtimeReady(supabase)
      .catch(() => undefined)
      .then(() => {
        if (disposed) return;
        channel = supabase
          .channel(`chat-room:${threadId}:${crypto.randomUUID()}`)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter }, (p) => {
            if (onRow("INSERT", p.new)) scheduleRead();
          })
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter }, (p) => {
            if (onRow("UPDATE", p.new)) scheduleRead();
          })
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "threads", filter: `id=eq.${threadId}` }, (p) => onThread(p.new))
          .subscribe((status) => {
            if (disposed) return;
            if (status === "SUBSCRIBED") {
              joined = true;
              stopPolling();
              // つながる前・つなぎ直しの間に来た物を拾う
              sync();
            } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
              joined = false;
              startPolling();
            }
          });
      });
    const fallback = setTimeout(() => {
      if (!joined) startPolling();
    }, 10000);

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      scheduleRead();
      if (!joined) sync();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      disposed = true;
      clearTimeout(fallback);
      if (readTimer) clearTimeout(readTimer);
      stopPolling();
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [threadId]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    atBottomRef.current = near;
    if (near && toast) setToast(false);
  }

  function toBottom() {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    atBottomRef.current = true;
    setToast(false);
  }

  function onImgLoad() {
    if (atBottomRef.current) {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }

  function older() {
    const first = messages[0];
    if (loadingOlder || !hasMore || !first) return;
    setLoadingOlder(true);
    setError(null);
    loadOlder(threadId, first.createdAt, first.id)
      .then((r) => {
        if (!r.ok) {
          setError(r.error);
          return;
        }
        const page = r.data;
        if (!page) return;
        const el = scrollRef.current;
        if (el) keepRef.current = { height: el.scrollHeight, top: el.scrollTop };
        setMessages((prev) => merge(prev, page.messages));
        setHasMore(page.hasMore);
      })
      .catch(() => setError(NET_ERROR))
      .finally(() => setLoadingOlder(false));
  }

  function heart(id: string) {
    setError(null);
    startHeart(async () => {
      try {
        const r = await toggleHeart(id);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        const on = r.data?.hearted === true;
        setMessages((prev) => prev.map((x) => (x.id === id ? { ...x, hearted: on } : x)));
      } catch {
        setError(NET_ERROR);
      }
    });
  }

  const canSubmit = !sending && !closed && (text.trim() !== "" || images.length > 0 || picked !== null);

  function send() {
    if (!canSubmit) return;
    const payload = { body: text, imagePaths: images.map((i) => i.path), listingId: picked };
    setError(null);
    setNotice(null);
    startSend(async () => {
      try {
        const r = await sendMessage(threadId, payload);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setText("");
        setImages([]);
        setPicked(null);
        setPanel("none");
        if (inputRef.current) {
          inputRef.current.style.height = "";
          inputRef.current.focus();
        }
        if (r.message) setNotice(r.message);
        stickRef.current = true;
        await refreshLatest();
      } catch {
        setError(NET_ERROR);
      }
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // 日本語の変換を決める Enter では送らない
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return;
    // スマホなど指で操作する画面には Shift が無いので、Enter は改行のままにして送信ボタンで送る
    if (window.matchMedia("(pointer: coarse)").matches) return;
    e.preventDefault();
    send();
  }

  function onInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  function insertEmoji(emoji: string) {
    const el = inputRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setPanel("none");
    if (next.length > BODY_MAX) return;
    setText(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  }

  const togglePanel = (p: "image" | "item" | "emoji") => setPanel((cur) => (cur === p ? "none" : p));
  const count = Array.from(text).length;
  const pickedListing = myListings.find((l) => l.id === picked) ?? null;

  return (
    <>
      <div className="messages-scroll" ref={scrollRef} onScroll={onScroll} role="log" aria-live="polite" aria-label="メッセージ">
        {hasMore && (
          <button type="button" className="chat-older" onClick={older} disabled={loadingOlder}>
            {loadingOlder ? "読み込み中…" : "前のメッセージを読む"}
          </button>
        )}
        {messages.length === 0 && (
          <div className="chat-empty-thread">
            まだメッセージはありません。
            <br />
            最初のメッセージを送ってみましょう。
          </div>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const day = dayKey(m.createdAt);
          const showDay = !prev || dayKey(prev.createdAt) !== day;
          const divider = showDay ? (
            <div className="date-divider">
              <span suppressHydrationWarning>{dayLabel(m.createdAt)}</span>
            </div>
          ) : null;

          // 決済・発送などの案内は中央に小さく
          if (m.kind === "system" || m.kind === "shipping" || m.senderId === null) {
            return (
              <Fragment key={m.id}>
                {divider}
                <div className="sys-msg chat-sys">
                  {m.body}
                  {m.orderId && (
                    <>
                      {" "}
                      <Link href={`/orders/${m.orderId}`} className="chat-sys-link">
                        注文を見る
                      </Link>
                    </>
                  )}
                </div>
              </Fragment>
            );
          }

          const mine = m.senderId === me.id;
          const groupStart = showDay || !prev || prev.senderId !== m.senderId || prev.kind === "system" || prev.kind === "shipping";
          const read = mine && !m.held && !!otherReadAt && sortKey(m.createdAt) <= sortKey(otherReadAt);
          return (
            <Fragment key={m.id}>
              {divider}
              <div className={`msg-row${mine ? " mine" : ""}${m.held ? " is-held" : ""}`}>
                <Avatar person={mine ? me : other} className="msg-avatar" />
                <div className="msg-group">
                  {!mine && groupStart && <div className="msg-sender">{other.name}</div>}
                  {m.body !== "" && <div className={`bubble ${mine ? "mine" : "theirs"}`}>{m.body}</div>}
                  {m.images.length > 0 && (
                    <div className={`chat-imgs${m.images.length > 1 ? " multi" : ""}`}>
                      {m.images.map((img, k) =>
                        img.url ? (
                          <a key={img.path} href={img.url} target="_blank" rel="noopener noreferrer" className="img-bubble" aria-label={`画像 ${k + 1} を開く`}>
                            <img src={img.url} alt={`送られた画像 ${k + 1}`} onLoad={onImgLoad} />
                          </a>
                        ) : (
                          <div key={img.path} className="img-bubble" aria-label="画像を読み込めません">
                            📷
                          </div>
                        ),
                      )}
                    </div>
                  )}
                  {m.kind === "item" &&
                    (m.listing ? (
                      <Link href={`/items/${m.listing.id}`} className="item-bubble">
                        <div className="ib-thumb">{m.listing.imageUrl ? <img src={m.listing.imageUrl} alt="" className="ib-img" onLoad={onImgLoad} /> : "🛍"}</div>
                        <div className="ib-name">{m.listing.title}</div>
                        <div className="ib-price">{yen(m.listing.price)}</div>
                        <span className="ib-btn">商品を見る →</span>
                      </Link>
                    ) : m.listingId ? (
                      <div className="item-bubble chat-gone">この商品は今は見られません</div>
                    ) : null)}
                  {!mine && !m.held && HEART_KINDS.includes(m.kind) ? (
                    <div className="reactions">
                      <button
                        type="button"
                        className={`reaction${m.hearted ? " mine" : ""}`}
                        aria-pressed={m.hearted}
                        aria-label={m.hearted ? "ハートを外す" : "ハートを付ける"}
                        onClick={() => heart(m.id)}
                      >
                        {m.hearted ? "♥" : "♡"}
                      </button>
                    </div>
                  ) : mine && m.hearted ? (
                    <div className="reactions">
                      <span className="reaction mine" title="相手がハートを付けました">
                        ♥
                      </span>
                    </div>
                  ) : null}
                  <div className="msg-meta">
                    <span>{clock(m.createdAt)}</span>
                    {mine && m.held && <span className="chat-held">確認中（相手にはまだ届いていません）</span>}
                    {read && <span className="read-check">✓✓ 既読</span>}
                    {!mine && <ReportButton type="message" targetId={m.id} loggedIn label="通報" className="chat-report" />}
                  </div>
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>

      {toast && (
        <button type="button" className="new-msg-toast show" onClick={toBottom}>
          ↓ 新しいメッセージ
        </button>
      )}

      {closed ? (
        <div className="input-area chat-closed">
          <p>{closed.text}</p>
          {closed.href && (
            <Link href={closed.href} className="chat-closed-link">
              {closed.label ?? "くわしく"}
            </Link>
          )}
        </div>
      ) : (
        <div className="input-area">
          {panel === "emoji" && (
            <div className="emoji-picker show" role="menu" aria-label="絵文字">
              {EMOJIS.map((e) => (
                <button key={e} type="button" className="ep-emoji" role="menuitem" onClick={() => insertEmoji(e)}>
                  {e}
                </button>
              ))}
            </div>
          )}
          {(panel === "image" || images.length > 0) && (
            <div className="chat-panel">
              <div className="chat-panel-head">
                <span>画像を送る（4枚まで）</span>
                {images.length === 0 && (
                  <button type="button" className="chat-panel-close" aria-label="閉じる" onClick={() => setPanel("none")}>
                    ×
                  </button>
                )}
              </div>
              <ImageUploader kind="chat" threadId={threadId} value={images} onChange={setImages} max={4} className="pt-uploader chat-uploader" disabled={sending} />
            </div>
          )}
          {panel === "item" && isSeller && (
            <div className="chat-panel">
              <div className="chat-panel-head">
                <span>紹介する商品を選んでください</span>
                <button type="button" className="chat-panel-close" aria-label="閉じる" onClick={() => setPanel("none")}>
                  ×
                </button>
              </div>
              {myListings.length === 0 ? (
                <p className="chat-panel-empty">
                  公開中の出品がありません。<Link href="/listings/new">出品する</Link>
                </p>
              ) : (
                <div className="chat-picks">
                  {myListings.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      className={`chat-pick${picked === l.id ? " active" : ""}`}
                      aria-pressed={picked === l.id}
                      onClick={() => setPicked((cur) => (cur === l.id ? null : l.id))}
                    >
                      <span className="chat-pick-thumb">{l.imageUrl ? <img src={l.imageUrl} alt="" /> : "🛍"}</span>
                      <span className="chat-pick-name">{l.title}</span>
                      <span className="chat-pick-price">{yen(l.price)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {pickedListing && panel !== "item" && (
            <div className="chat-picked">
              🛍 {pickedListing.title}（{yen(pickedListing.price)}）を紹介します
              <button type="button" className="chat-panel-close" aria-label="商品の紹介をやめる" onClick={() => setPicked(null)}>
                ×
              </button>
            </div>
          )}
          <div className="input-toolbar">
            <button
              type="button"
              className={`tool-btn${panel === "image" ? " active" : ""}`}
              title="画像を送る"
              aria-label="画像を送る"
              disabled={picked !== null}
              onClick={() => togglePanel("image")}
            >
              🖼
            </button>
            {isSeller && (
              <button
                type="button"
                className={`tool-btn${panel === "item" ? " active" : ""}`}
                title="自分の商品を紹介"
                aria-label="自分の商品を紹介"
                disabled={images.length > 0}
                onClick={() => togglePanel("item")}
              >
                🛍
              </button>
            )}
            <button type="button" className={`tool-btn${panel === "emoji" ? " active" : ""}`} title="絵文字" aria-label="絵文字" onClick={() => togglePanel("emoji")}>
              😊
            </button>
            <span className="chat-caution">※ 住所・個人情報の送付はお控えください</span>
          </div>
          <div className="input-row">
            <textarea
              ref={inputRef}
              className="msg-input"
              placeholder="メッセージを入力..."
              aria-label="メッセージ"
              rows={1}
              maxLength={BODY_MAX}
              value={text}
              onChange={onInput}
              onKeyDown={onKeyDown}
              readOnly={sending}
            />
            <button type="button" className="send-btn" onClick={send} disabled={!canSubmit} title="送信" aria-label="送信">
              {sending ? "…" : "➤"}
            </button>
          </div>
          {(error || notice) && (
            <p className={`pt-msg ${error ? "error" : "ok"} chat-form-msg`} role={error ? "alert" : "status"}>
              {error ?? notice}
            </p>
          )}
          <div className="input-hint">
            <span className="chat-hint-keys">Enter で送信 ・ Shift+Enter で改行</span>
            {count > BODY_MAX - 200 && (
              <span className={count >= BODY_MAX ? "chat-count over" : "chat-count"}>
                {" "}
                {count}/{BODY_MAX}
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
