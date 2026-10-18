/* 1つの会話（見本 chat.html）。左に会話の一覧、真ん中に会話、右に相手と注文・会話に出た物。
   当事者でなければ（RLS で threads が読めなければ）404。読み込みはすべて利用者の権限（RLS）。
   右の欄は開いた時点の内容（新しいメッセージで作り直さない） */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ChatHeaderBar from "@/components/chat/ChatHeaderBar";
import ChatRoom from "@/components/chat/ChatRoom";
import MuteToggle from "@/components/chat/MuteToggle";
import ThreadList from "@/components/chat/ThreadList";
import { loadMessages, otherReadAt } from "@/components/chat/data";
import type { ChatListing, ChatPerson, MyListing } from "@/components/chat/types";
import { initialOf, listEmpty, otherName, toThreadRow } from "@/components/chat/view";
import ReportButton from "@/components/ReportButton";
import { BlockButton } from "@/components/ToggleButtons";
import { requireViewer } from "@/lib/auth";
import { dateJst, isOnline, num, orderNo, presence, ratingAvg, yen } from "@/lib/format";
import { ORDER_STATUS } from "@/lib/labels";
import { isUuid } from "@/lib/search";
import { avatarImage, listingImage } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import "@/styles/chat.css";
import "@/components/chat/chat-extra.css";

export const metadata: Metadata = {
  title: "メッセージ",
  robots: { index: false, follow: false },
};

type OrderRow = { id: string; order_no: number; title: string; image_path: string | null; total: number; status: string; created_at: string };

function OrderLinks({ orders }: { orders: OrderRow[] }) {
  return (
    <div className="chat-orders">
      {orders.map((o) => {
        const st = ORDER_STATUS[o.status] ?? { label: o.status, tone: "pending" as const };
        const img = listingImage(o.image_path);
        return (
          <Link key={o.id} href={`/orders/${o.id}`} className="order-banner">
            <div className="ob-thumb">{img ? <img src={img} alt="" className="ob-img" /> : "📦"}</div>
            <div className="ob-info">
              <div className="ob-title chat-ellipsis">{o.title}</div>
              <div className="ob-sub">
                {orderNo(o.order_no)} ・ {yen(o.total)} ・ {dateJst(o.created_at)}
              </div>
            </div>
            <span className={`ob-status ${st.tone}`}>{st.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

export default async function MessageThreadPage({ params }: PageProps<"/messages/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const tid = id.toLowerCase();
  const viewer = await requireViewer(`/messages/${tid}`);
  const supabase = await createClient();

  const { data: t, error } = await supabase
    .from("threads")
    .select("id, seller_id, buyer_id, seller_last_read_at, buyer_last_read_at, seller_muted, buyer_muted")
    .eq("id", tid)
    .maybeSingle();
  if (error) throw new Error(`会話を読めませんでした: ${error.code ?? ""}`);
  // RLS で当事者だけが読めるが、念のため画面でも確かめる
  if (!t || (t.seller_id !== viewer.id && t.buyer_id !== viewer.id)) notFound();

  const isSeller = t.seller_id === viewer.id;
  const otherId = isSeller ? t.buyer_id : t.seller_id;
  const otherRole = isSeller ? "buyer" : "seller";

  const [profileRes, blockRes, page, ordersRes, doneOrdersRes, listingsRes, threadsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, public_name, avatar_path, age, occupation, accept_messages, last_seen_at, kyc_status, follower_count, sales_count, rating_sum, rating_count")
      .eq("id", otherId)
      .maybeSingle(),
    supabase.from("blocks").select("blocked_id").eq("blocker_id", viewer.id).eq("blocked_id", otherId).maybeSingle(),
    loadMessages(supabase, tid),
    supabase
      .from("orders")
      .select("id, order_no, title, image_path, total, status, created_at")
      .eq("seller_id", t.seller_id)
      .eq("buyer_id", t.buyer_id)
      .order("created_at", { ascending: false })
      .limit(5),
    // 出品者がメッセージを止めていても、支払い待ち以外の注文があれば購入者は送れる（DB の send_message と同じ決まり）
    isSeller
      ? null
      : supabase.from("orders").select("id", { count: "exact", head: true }).eq("buyer_id", viewer.id).eq("seller_id", otherId).neq("status", "pending"),
    isSeller
      ? supabase
          .from("listings")
          .select("id, title, price, image_paths")
          .eq("seller_id", viewer.id)
          .eq("status", "published")
          .order("published_at", { ascending: false })
          .limit(50)
      : null,
    supabase.rpc("my_threads"),
  ]);

  // 退会・停止した相手は RLS で読めない
  const profile = profileRes.data;
  const blocked = !!blockRes.data;
  const orders = (ordersRes.data ?? []) as OrderRow[];
  const name = otherName(profile?.public_name ?? null, otherRole);
  const avatarUrl = avatarImage(profile?.avatar_path);
  const online = otherRole === "seller" && !!profile && isOnline(profile.last_seen_at);
  const statusText = !profile ? "退会・利用停止中" : otherRole === "seller" ? presence(profile.last_seen_at) || "出品者" : "購入者";

  const me: ChatPerson = { id: viewer.id, name: viewer.nickname, avatarUrl: avatarImage(viewer.avatarPath) };
  const other: ChatPerson = { id: otherId, name, avatarUrl };
  const myListings: MyListing[] = (listingsRes?.data ?? []).map((l) => ({
    id: l.id,
    title: l.title,
    price: l.price,
    imageUrl: listingImage(l.image_paths?.[0]),
  }));
  const muted = isSeller ? t.seller_muted : t.buyer_muted;
  const threads = (threadsRes.data ?? []).map(toThreadRow);
  const empty = listEmpty(viewer.role);

  // 送れないときの理由（DB でも断られるが、先に分かる物は欄の代わりに案内を出す）
  let closed: { text: string; href?: string; label?: string } | null = null;
  if (!profile) closed = { text: "この相手は退会したか利用が止められているため、メッセージを送れません。" };
  else if (blocked) closed = { text: "この相手をブロックしています。送るには、上の 🚫 でブロックを外してください。" };
  else if (viewer.kycStatus !== "approved")
    closed =
      viewer.kycStatus === "pending"
        ? { text: "本人確認（18歳以上の確認）の審査中です。確認が済むとメッセージを送れます。" }
        : { text: "メッセージを送るには、本人確認（18歳以上の確認）が必要です。", href: "/kyc", label: "本人確認へ進む" };
  else if (!isSeller && profile.accept_messages === false && (doneOrdersRes?.count ?? 0) === 0)
    closed = {
      text: "この出品者は、購入した人からのメッセージだけを受け付けています。",
      href: `/sellers/${otherId}`,
      label: "出品者のページを見る",
    };

  // 右の欄: 会話に出た商品・画像（開いた時点の新しい50件から）
  const sharedItems: ChatListing[] = [];
  const seen = new Set<string>();
  for (const m of [...page.messages].reverse()) {
    if (m.listing && !seen.has(m.listing.id)) {
      seen.add(m.listing.id);
      sharedItems.push(m.listing);
    }
  }
  const sharedImages = page.messages
    .flatMap((m) => m.images)
    .filter((i): i is { path: string; url: string } => !!i.url)
    .reverse()
    .slice(0, 9);

  const avatar = (cls: string, withOnline: string | null) => (
    <div className={cls}>
      {avatarUrl ? <img src={avatarUrl} alt="" className="chat-avatar-img" /> : initialOf(name)}
      {withOnline && online && <div className={withOnline} />}
    </div>
  );

  return (
    <div className="pg-chat">
      <ChatHeaderBar viewer={viewer} />
      <div className="chat-layout is-room">
        <ThreadList initial={threads} activeId={tid} emptyText={empty.text} emptyLink={empty.link} />

        <main className="chat-main">
          <div className="chat-header">
            <Link href="/messages" className="ch-back" aria-label="会話の一覧へ戻る">
              ‹
            </Link>
            {avatar("ch-avatar", "ch-online")}
            <div className="ch-info">
              <h2 className="ch-name">{name}</h2>
              <div className={`ch-status${online ? "" : " off"}`}>{statusText}</div>
            </div>
            <div className="ch-actions">
              {otherRole === "seller" && profile && (
                <Link href={`/sellers/${otherId}`} className="ch-btn" title="プロフィールを見る" aria-label="プロフィールを見る">
                  👤
                </Link>
              )}
              <MuteToggle threadId={tid} initial={muted} />
              <span title="この相手を通報する">
                <ReportButton type="user" targetId={otherId} label="🚩" className="ch-btn" loggedIn />
              </span>
              <span title={blocked ? "ブロックを外す" : "ブロックする"}>
                <BlockButton
                  id={otherId}
                  initial={blocked}
                  loggedIn
                  labels={["🚫", "🚫"]}
                  className="ch-btn"
                  ariaLabel="この相手をブロック"
                  confirmOn="この相手をブロックしますか？メッセージの送受信ができなくなります。"
                />
              </span>
            </div>
          </div>

          {orders.length > 0 && (
            <details className="chat-fold">
              <summary>この相手との注文（{orders.length}件）</summary>
              <OrderLinks orders={orders} />
            </details>
          )}

          <ChatRoom
            threadId={tid}
            me={me}
            other={other}
            isSeller={isSeller}
            initial={page}
            initialOtherReadAt={otherReadAt(t, viewer.id)}
            myListings={myListings}
            closed={closed}
          />
        </main>

        <aside className="right-sidebar" aria-label="相手と取引の情報">
          <div className="rs-section">
            <div className="rs-title">{otherRole === "seller" ? "出品者" : "購入者"}</div>
            <div className="sp-mini">
              {avatar("sp-avatar", null)}
              <div className="sp-name">{name}</div>
              {otherRole === "seller" && profile && (
                <>
                  {(profile.age || profile.occupation) && (
                    <div className="sp-sub">{[profile.age ? `${profile.age}歳` : null, profile.occupation].filter(Boolean).join(" ・ ")}</div>
                  )}
                  {profile.kyc_status === "approved" && <div className="kyc-badge">✓ 本人確認済み</div>}
                  <div className="sp-stats">
                    <div>
                      <div className="sp-stat-n">{ratingAvg(profile.rating_sum, profile.rating_count)}</div>
                      <div className="sp-stat-l">評価</div>
                    </div>
                    <div>
                      <div className="sp-stat-n">{num(profile.sales_count)}</div>
                      <div className="sp-stat-l">販売数</div>
                    </div>
                    <div>
                      <div className="sp-stat-n">{num(profile.follower_count)}</div>
                      <div className="sp-stat-l">フォロワー</div>
                    </div>
                  </div>
                  <Link href={`/sellers/${otherId}`} className="sp-btn">
                    プロフィールを見る
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="rs-section">
            <div className="rs-title">注文情報</div>
            {orders.length > 0 ? <OrderLinks orders={orders} /> : <p className="chat-rs-empty">この相手との注文はまだありません。</p>}
          </div>

          {sharedItems.length > 0 && (
            <div className="rs-section">
              <div className="rs-title">会話に出た商品</div>
              {sharedItems.map((l) => (
                <Link key={l.id} href={`/items/${l.id}`} className="shared-item">
                  <div className="si-thumb">{l.imageUrl ? <img src={l.imageUrl} alt="" className="si-img" /> : "🛍"}</div>
                  <div className="ob-info">
                    <div className="si-name chat-ellipsis">{l.title}</div>
                    <div className="si-price">{yen(l.price)}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {sharedImages.length > 0 && (
            <div className="rs-section">
              <div className="rs-title">共有された画像</div>
              <div className="chat-imgs-grid">
                {sharedImages.map((img, k) => (
                  <a key={img.path} href={img.url} target="_blank" rel="noopener noreferrer" className="rs-img-thumb" aria-label={`共有された画像 ${k + 1} を開く`}>
                    <img src={img.url} alt="" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
