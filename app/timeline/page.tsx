/* /timeline フォロー中の出品者のつぶやき・新着商品（見本 timeline.html）。ログインが要る。
   ?tab=posts（既定）・items・sellers、?seller=<id> で1人に絞る、?page= でページ送り。
   読みは利用者の権限（RLS）。フォローしていても、停止・ブロック・非公開になった出品者の物は RLS が出さない。 */
import type { Metadata } from "next";
import Link from "next/link";
import "@/styles/timeline.css";
import "@/components/posts/posts.css";
import SiteHeader from "@/components/SiteHeader";
import { FavoriteButton, FollowButton } from "@/components/ToggleButtons";
import Avatar from "@/components/posts/Avatar";
import PostCard from "@/components/posts/PostCard";
import PostComposer from "@/components/posts/PostComposer";
import PostKycGuide from "@/components/posts/PostKycGuide";
import { PAGE_SIZE, POST_COLUMNS, daysAgoIso, enrichPosts, loadRecommendedSellers, loadTrendTags, pageOf, type Supa } from "@/components/posts/data";
import { requireViewer } from "@/lib/auth";
import { displayName, isOnline, ratingAvg, san, yen } from "@/lib/format";
import { CATEGORIES } from "@/lib/labels";
import { isUuid } from "@/lib/search";
import { avatarImage, listingImage } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "タイムライン" };

/** 読むフォローの上限（.in に入れる数。URL が長くなりすぎないように） */
const FOLLOW_MAX = 200;
const ITEM_PAGE = 24;

type Tab = "posts" | "items" | "sellers";
type Sp = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function href(tab: Tab, extra: { seller?: string | null; page?: number } = {}) {
  const p = new URLSearchParams();
  if (tab !== "posts") p.set("tab", tab);
  if (extra.seller) p.set("seller", extra.seller);
  if (extra.page && extra.page > 1) p.set("page", String(extra.page));
  const s = p.toString();
  return s ? `/timeline?${s}` : "/timeline";
}

const subOf = (occupation: string | null, age: number | null) => [occupation, age ? `${age}歳` : null].filter(Boolean).join(" ");

async function loadFollowedProfiles(supabase: Supa, ids: string[]) {
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("profiles")
    .select("id, public_name, avatar_path, age, occupation, last_seen_at, sales_count, rating_sum, rating_count")
    .in("id", ids);
  // フォローした新しい順に並べ直す
  const order = new Map(ids.map((id, i) => [id, i]));
  return (data ?? []).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export default async function TimelinePage({ searchParams }: PageProps<"/timeline">) {
  const viewer = await requireViewer("/timeline");
  const sp = (await searchParams) as Sp;
  const tabRaw = one(sp.tab);
  const tab: Tab = tabRaw === "items" ? "items" : tabRaw === "sellers" ? "sellers" : "posts";
  const page = pageOf(one(sp.page));
  const supabase = await createClient();
  const canPost = viewer.role === "seller" && viewer.kycStatus === "approved";

  const [followsRes, favRes, likeRes, recommended, trends, composerListings] = await Promise.all([
    supabase
      .from("follows")
      .select("seller_id", { count: "exact" })
      .eq("follower_id", viewer.id)
      .order("created_at", { ascending: false })
      .limit(FOLLOW_MAX),
    supabase.from("favorites").select("listing_id", { count: "exact", head: true }).eq("user_id", viewer.id),
    supabase.from("post_likes").select("post_id", { count: "exact", head: true }).eq("user_id", viewer.id),
    loadRecommendedSellers(supabase, viewer.id, 4, { excludeFollowing: true }),
    loadTrendTags(supabase, 8),
    canPost ? myListings(supabase, viewer.id) : Promise.resolve([] as { id: string; title: string }[]),
  ]);
  const followIds = (followsRes.data ?? []).map((f) => f.seller_id);
  const followCount = followsRes.count ?? followIds.length;
  const sellerRaw = one(sp.seller);
  const seller = isUuid(sellerRaw) && followIds.includes(sellerRaw) ? sellerRaw : null;
  const authorIds = seller ? [seller] : followIds;

  const profiles = await loadFollowedProfiles(supabase, followIds);
  const profMap = new Map(profiles.map((p) => [p.id, p]));
  const visibleFollowIds = profiles.map((p) => p.id);
  const sellerName = seller ? displayName(profMap.get(seller)?.public_name) : null;

  // ── つぶやき ──
  let posts: Awaited<ReturnType<typeof enrichPosts>> = [];
  let postsNext = false;
  if (tab === "posts" && authorIds.length > 0) {
    const from = (page - 1) * PAGE_SIZE;
    const { data } = await supabase
      .from("posts")
      .select(POST_COLUMNS)
      .in("author_id", authorIds)
      .eq("status", "visible")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE);
    postsNext = (data?.length ?? 0) > PAGE_SIZE;
    posts = await enrichPosts(supabase, (data ?? []).slice(0, PAGE_SIZE), viewer.id);
  }
  const newSince = Date.parse(daysAgoIso(1));

  // ── 新着商品 ──
  let items: { id: string; title: string; price: number | null; image_paths: string[]; category: string | null; seller_id: string; same_day: boolean; status: string }[] = [];
  let itemsNext = false;
  let favSet = new Set<string>();
  if (tab === "items" && authorIds.length > 0) {
    const from = (page - 1) * ITEM_PAGE;
    const { data } = await supabase
      .from("listings")
      .select("id, title, price, image_paths, category, seller_id, same_day, status")
      .in("seller_id", authorIds)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .range(from, from + ITEM_PAGE);
    itemsNext = (data?.length ?? 0) > ITEM_PAGE;
    items = (data ?? []).slice(0, ITEM_PAGE);
    if (items.length) {
      const { data: favs } = await supabase
        .from("favorites")
        .select("listing_id")
        .eq("user_id", viewer.id)
        .in(
          "listing_id",
          items.map((i) => i.id),
        );
      favSet = new Set((favs ?? []).map((f) => f.listing_id));
    }
  }

  const noFollow = followIds.length === 0;

  return (
    <div className="pg-timeline">
      <SiteHeader variant="timeline" active="timeline" search={{ action: "/tweets", placeholder: "つぶやきを検索" }} />

      <main className="layout">
        {/* ── 左: 自分・ナビ・フォロー中 ── */}
        <aside className="left-sidebar fade-in">
          <div className="buyer-profile">
            <Avatar url={avatarImage(viewer.avatarPath)} name={viewer.nickname} className="bp-avatar" />
            <div className="bp-name">{viewer.nickname}</div>
            <div className="bp-role">{viewer.role === "seller" ? "🌸 出品者" : "🛍 購入者"}</div>
            <div className="bp-stats">
              <div>
                <div className="bp-stat-num">{followCount}</div>
                <div className="bp-stat-label">フォロー中</div>
              </div>
              <div>
                <div className="bp-stat-num">{favRes.count ?? 0}</div>
                <div className="bp-stat-label">お気に入り</div>
              </div>
              <div>
                <div className="bp-stat-num">{likeRes.count ?? 0}</div>
                <div className="bp-stat-label">いいね</div>
              </div>
            </div>
          </div>

          <nav className="side-nav" aria-label="タイムラインの切り替え">
            <Link href={href("posts")} className={`side-nav-item${tab === "posts" ? " active" : ""}`}>
              <span>💬</span> つぶやき
            </Link>
            <Link href={href("items")} className={`side-nav-item${tab === "items" ? " active" : ""}`}>
              <span>🛍</span> 新着商品
            </Link>
            <Link href={href("sellers")} className={`side-nav-item${tab === "sellers" ? " active" : ""}`}>
              <span>👩</span> フォロー中の子
            </Link>
          </nav>

          <div className="following-card">
            <div className="fc-title">
              フォロー中 ({followCount})
              {followCount > 0 && (
                <Link className="fc-link" href={href("sellers")}>
                  全員見る
                </Link>
              )}
            </div>
            {profiles.length === 0 ? (
              <p className="pp-side-empty">まだフォローしていません。</p>
            ) : (
              profiles.slice(0, 8).map((p) => {
                const name = displayName(p.public_name);
                return (
                  <Link key={p.id} href={href(tab === "sellers" ? "posts" : tab, { seller: p.id })} className={`fc-item${seller === p.id ? " pp-current" : ""}`}>
                    <Avatar url={avatarImage(p.avatar_path)} name={name} className="fc-avatar">
                      {isOnline(p.last_seen_at) && <div className="fc-online" title="オンライン" />}
                    </Avatar>
                    <div>
                      <div className="fc-name">{name}</div>
                      <div className="fc-sub">{subOf(p.occupation, p.age)}</div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </aside>

        {/* ── 中央 ── */}
        <div className="timeline fade-in" style={{ transitionDelay: "0.08s" }}>
          <div className="tl-tabs">
            <Link href={href("posts", { seller })} className={`tl-tab${tab === "posts" ? " active" : ""}`}>
              💬 つぶやき
            </Link>
            <Link href={href("items", { seller })} className={`tl-tab${tab === "items" ? " active" : ""}`}>
              🛍 新着商品
            </Link>
            <Link href={href("sellers")} className={`tl-tab${tab === "sellers" ? " active" : ""}`}>
              👩 フォロー管理
            </Link>
          </div>

          {seller && tab !== "sellers" && (
            <div className="seller-filter-bar">
              <span>👩</span>
              <span>{sellerName}のみ表示中</span>
              <Link href={href(tab)} className="pp-filter-clear" aria-label="絞り込みを外す">
                ✕
              </Link>
            </div>
          )}

          {tab === "posts" && canPost && <PostComposer listings={composerListings} />}
          {tab === "posts" && !canPost && viewer.role === "seller" && <PostKycGuide status={viewer.kycStatus} className="pp-kyc-card" />}

          {noFollow ? (
            <div className="tl-panel show">
              <div className="unfollow-notice pp-nofollow">
                <div className="pp-nofollow-title">🌸 まだ誰もフォローしていません</div>
                <p>気になる出品者をフォローすると、つぶやきと新着商品がここに届きます。</p>
                <Link href="/sellers" className="btn-follow">
                  出品者を探す
                </Link>
              </div>
              {recommended.map((s) => (
                <div className="discover-item pp-discover-wide" key={s.id}>
                  <Link href={`/sellers/${s.id}`} aria-label={`${s.name}のプロフィール`}>
                    <Avatar url={s.avatarUrl} name={s.name} className="di-avatar">
                      {isOnline(s.lastSeenAt) && <div className="di-online" title="オンライン" />}
                    </Avatar>
                  </Link>
                  <div>
                    <Link href={`/sellers/${s.id}`} className="di-name">
                      {s.name}
                    </Link>
                    <div className="di-sub">{subOf(s.occupation, s.age)}</div>
                    <div className="di-stats">
                      <span>⭐ {s.ratingCount > 0 ? s.rating.toFixed(1) : "-"}</span>
                      <span>📦 {s.salesCount}件</span>
                    </div>
                  </div>
                  <FollowButton
                    id={s.id}
                    initial={s.following}
                    loggedIn
                    refresh
                    className="btn-follow"
                    activeClassName="following"
                    labels={["フォロー", "フォロー中"]}
                    ariaLabel={`${s.name}をフォロー`}
                  />
                </div>
              ))}
            </div>
          ) : tab === "posts" ? (
            <div className="tl-panel show">
              {posts.length === 0 ? (
                <div className="pp-empty">{seller ? `${san(sellerName)}のつぶやきはまだありません。` : "フォロー中の出品者のつぶやきはまだありません。"}</div>
              ) : (
                posts.map((p) => <PostCard key={p.id} post={p} variant="timeline" loggedIn isNew={Date.parse(p.createdAt) > newSince} />)
              )}
              {(page > 1 || postsNext) && (
                <div className="load-more pp-pager">
                  {page > 1 && (
                    <Link className="btn-load" href={href("posts", { seller, page: page - 1 })}>
                      ← 新しいつぶやき
                    </Link>
                  )}
                  {postsNext && (
                    <Link className="btn-load" href={href("posts", { seller, page: page + 1 })}>
                      もっと見る
                    </Link>
                  )}
                </div>
              )}
            </div>
          ) : tab === "items" ? (
            <div className="tl-panel show">
              <div className="pp-count-note">フォロー中の出品者の新着商品</div>
              {items.length === 0 ? (
                <div className="pp-empty">公開中の商品はまだありません。</div>
              ) : (
                <div className="items-grid">
                  {items.map((it) => {
                    const img = listingImage(it.image_paths[0]);
                    const cat = CATEGORIES.find((c) => c.value === it.category);
                    return (
                      <div className="item-card" key={it.id}>
                        <Link href={`/items/${it.id}`} className="item-thumb">
                          {img ? <img src={img} alt={it.title} className="item-img" loading="lazy" /> : <span className="pp-noimg">🛍</span>}
                          {cat && <div className="item-tag">{cat.label}</div>}
                        </Link>
                        <FavoriteButton
                          id={it.id}
                          initial={favSet.has(it.id)}
                          loggedIn
                          className="item-heart"
                          activeClassName="liked"
                          labels={["♡", "♥"]}
                          ariaLabel="お気に入り"
                        />
                        <Link href={`/items/${it.id}`} className="item-info">
                          <div className="item-name">{it.title}</div>
                          <div className="item-seller">{displayName(profMap.get(it.seller_id)?.public_name)}</div>
                          <div className="item-footer">
                            <div className="item-price">{it.price !== null ? yen(it.price) : "価格未定"}</div>
                            {it.same_day && <div className="item-badge">即日</div>}
                          </div>
                        </Link>
                      </div>
                    );
                  })}
                </div>
              )}
              {(page > 1 || itemsNext) && (
                <div className="load-more pp-pager">
                  {page > 1 && (
                    <Link className="btn-load" href={href("items", { seller, page: page - 1 })}>
                      ← 新しい商品
                    </Link>
                  )}
                  {itemsNext && (
                    <Link className="btn-load" href={href("items", { seller, page: page + 1 })}>
                      もっと見る
                    </Link>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="tl-panel show">
              <div className="pp-count-note">フォロー中の出品者 {followCount}人</div>
              {profiles.map((p) => {
                const name = displayName(p.public_name);
                const online = isOnline(p.last_seen_at);
                return (
                  <Link key={p.id} href={`/sellers/${p.id}`} className="seller-group-header">
                    <Avatar url={avatarImage(p.avatar_path)} name={name} className="sgh-avatar">
                      {online && <div className="sgh-online" />}
                    </Avatar>
                    <div>
                      <div className="sgh-name">{name}</div>
                      <div className="sgh-sub">
                        {[subOf(p.occupation, p.age), `⭐ ${ratingAvg(p.rating_sum, p.rating_count)}`, `${p.sales_count}件販売`].filter(Boolean).join(" ・ ")}
                      </div>
                    </div>
                    {online && <div className="sgh-badge pp-online-badge">オンライン</div>}
                  </Link>
                );
              })}
              {followIds.length > visibleFollowIds.length && (
                <p className="pp-side-empty">利用を停止した・退会した出品者は表示していません。</p>
              )}
              <div className="unfollow-notice">
                <div className="pp-notice-text">
                  出品者カードをタップしてプロフィールを確認できます。
                  <br />
                  フォロー解除はプロフィールページから行えます。
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── 右: おすすめ・タグ・通知 ── */}
        <aside className="right-sidebar fade-in" style={{ transitionDelay: "0.16s" }}>
          {!noFollow && (
            <div className="side-card">
              <div className="side-title">
                <span className="icon-pill">💡</span> おすすめの子
              </div>
              {recommended.length === 0 ? (
                <p className="pp-side-empty">おすすめできる出品者はいまいません。</p>
              ) : (
                recommended.map((s) => (
                  <div className="discover-item" key={s.id}>
                    <Link href={`/sellers/${s.id}`} aria-label={`${s.name}のプロフィール`}>
                      <Avatar url={s.avatarUrl} name={s.name} className="di-avatar">
                        {isOnline(s.lastSeenAt) && <div className="di-online" title="オンライン" />}
                      </Avatar>
                    </Link>
                    <div>
                      <Link href={`/sellers/${s.id}`} className="di-name">
                        {s.name}
                      </Link>
                      <div className="di-sub">{subOf(s.occupation, s.age)}</div>
                      <div className="di-stats">
                        <span>⭐ {s.ratingCount > 0 ? s.rating.toFixed(1) : "-"}</span>
                        <span>📦 {s.salesCount}件</span>
                      </div>
                    </div>
                    <FollowButton
                      id={s.id}
                      initial={s.following}
                      loggedIn
                      className="btn-follow"
                      activeClassName="following"
                      labels={["フォロー", "フォロー中"]}
                      ariaLabel={`${s.name}をフォロー`}
                    />
                  </div>
                ))
              )}
            </div>
          )}

          <div className="side-card">
            <div className="side-title">
              <span className="icon-pill">🔥</span> トレンドタグ
            </div>
            {trends.length === 0 ? (
              <p className="pp-side-empty">この7日間のタグはまだありません。</p>
            ) : (
              <div>
                {trends.map((t) => (
                  <Link key={t.tag} href={`/tweets?tag=${encodeURIComponent(t.tag)}`} className="htag">
                    #{t.tag}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="side-card">
            <div className="side-title">
              <span className="icon-pill">🔔</span> 通知設定
            </div>
            <p className="pp-notice-text">フォロー中の出品者の新着つぶやき・新着商品のお知らせは、設定で切り替えられます。</p>
            <Link href="/settings" className="btn-follow pp-settings-link">
              通知の設定へ
            </Link>
          </div>
        </aside>
      </main>
    </div>
  );
}

/** 投稿欄で紐づけられる自分の出品（公開中） */
async function myListings(supabase: Supa, userId: string) {
  const { data } = await supabase
    .from("listings")
    .select("id, title")
    .eq("seller_id", userId)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(50);
  return data ?? [];
}
