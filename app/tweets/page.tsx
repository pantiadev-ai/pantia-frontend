/* /tweets つぶやきの一覧（見本 tweets.html）。ログインは不要。
   公開（visible）のつぶやきを新しい順に。絞り込みは ?q=（本文）・?tag=（タグ）・?category=・?sort=popular。
   読みは利用者の権限（RLS）。停止・ブロック・非公開の出品者のつぶやきは RLS が出さない。 */
import type { Metadata } from "next";
import Link from "next/link";
import "@/styles/tweets.css";
import "@/components/posts/posts.css";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { FollowButton } from "@/components/ToggleButtons";
import Avatar from "@/components/posts/Avatar";
import PostCard from "@/components/posts/PostCard";
import PostComposer from "@/components/posts/PostComposer";
import PostKycGuide from "@/components/posts/PostKycGuide";
import {
  PAGE_SIZE,
  POST_COLUMNS,
  daysAgoIso,
  enrichPosts,
  loadRecommendedSellers,
  loadTrendTags,
  pageOf,
  tagOf,
} from "@/components/posts/data";
import { getViewer } from "@/lib/auth";
import { isOnline, yen } from "@/lib/format";
import { CATEGORIES } from "@/lib/labels";
import { escapeLike, safeSearch } from "@/lib/search";
import { listingImage } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "つぶやき",
  description: "出品者のつぶやき。新着の出品のお知らせや、日常のひとことを見られます。",
};

type Sp = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** 今の絞り込みを残したまま、一部だけ変えた URL */
function hrefWith(base: { q: string | null; tag: string | null; category: string | null; sort: string }, change: Partial<Record<"q" | "tag" | "category" | "sort" | "page", string | null>>) {
  const p = new URLSearchParams();
  const merged = { q: base.q, tag: base.tag, category: base.category, sort: base.sort === "popular" ? "popular" : null, page: null, ...change };
  for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `/tweets?${s}` : "/tweets";
}

export default async function TweetsPage({ searchParams }: PageProps<"/tweets">) {
  const sp = (await searchParams) as Sp;
  const q = safeSearch(one(sp.q));
  const tag = tagOf(one(sp.tag));
  const sort = one(sp.sort) === "popular" ? "popular" : "new";
  const category = CATEGORIES.find((c) => c.value === one(sp.category))?.value ?? null;
  const page = pageOf(one(sp.page));
  const base = { q, tag, category, sort };

  const viewer = await getViewer();
  const supabase = await createClient();
  const canPost = viewer?.role === "seller" && viewer.kycStatus === "approved";

  let query = supabase.from("posts").select(POST_COLUMNS).eq("status", "visible");
  if (q) query = query.ilike("body", `%${escapeLike(q)}%`);
  if (tag) query = query.contains("tags", [tag]);
  if (category) query = query.eq("category", category);
  if (sort === "popular") {
    query = query.gte("created_at", daysAgoIso(7)).order("like_count", { ascending: false }).order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }
  const from = (page - 1) * PAGE_SIZE;
  // 1件多く読んで、次のページがあるかを知る
  const [{ data: rows, error }, trends, sellers, newItems, myListings] = await Promise.all([
    query.range(from, from + PAGE_SIZE),
    loadTrendTags(supabase, 10),
    loadRecommendedSellers(supabase, viewer?.id ?? null, 4),
    supabase
      .from("listings")
      .select("id, title, price, image_paths")
      .eq("status", "published")
      .eq("followers_only", false)
      .order("published_at", { ascending: false })
      .limit(3),
    canPost && viewer
      ? supabase.from("listings").select("id, title").eq("seller_id", viewer.id).eq("status", "published").order("created_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);
  const hasNext = (rows?.length ?? 0) > PAGE_SIZE;
  const posts = await enrichPosts(supabase, (rows ?? []).slice(0, PAGE_SIZE), viewer?.id ?? null);
  const filtered = !!(q || tag || category);

  return (
    <div className="pg-tweets">
      <SiteHeader variant="tweets" active="tweets" search={{ action: "/tweets", placeholder: "つぶやきを検索", defaultValue: q ?? "" }} />

      <main className="layout">
        <div className="feed fade-in">
          {canPost ? (
            <PostComposer listings={myListings.data ?? []} />
          ) : viewer?.role === "seller" ? (
            <PostKycGuide status={viewer.kycStatus} className="pp-kyc-card" />
          ) : null}

          <nav className="filter-row" aria-label="つぶやきの絞り込み">
            <Link href={hrefWith(base, { sort: null, category: null })} className={`ftab${sort === "new" && !category ? " active" : ""}`}>
              ✨ 新着
            </Link>
            <Link href={hrefWith(base, { sort: "popular", category: null })} className={`ftab${sort === "popular" && !category ? " active" : ""}`}>
              🔥 人気
            </Link>
            <Link href="/timeline" className="ftab">
              💗 フォロー中
            </Link>
            {CATEGORIES.map((c) => (
              <Link key={c.value} href={hrefWith(base, { category: c.value })} className={`ftab${category === c.value ? " active" : ""}`}>
                {c.icon} {c.label}
              </Link>
            ))}
          </nav>

          {(q || tag) && (
            <div className="pp-filter-note">
              {q && <span>「{q}」を含むつぶやき</span>}
              {tag && <span>#{tag} のつぶやき</span>}
              <Link href={hrefWith(base, { q: null, tag: null })}>✕ 絞り込みを外す</Link>
            </div>
          )}

          {error ? (
            <div className="pp-empty">つぶやきを読み込めませんでした。時間をおいて、もう一度お試しください。</div>
          ) : posts.length === 0 ? (
            <div className="pp-empty">
              {filtered
                ? "条件に合うつぶやきはまだありません。"
                : sort === "popular"
                  ? "この7日間のつぶやきはまだありません。"
                  : "まだつぶやきはありません。"}
            </div>
          ) : (
            posts.map((p) => <PostCard key={p.id} post={p} variant="tweets" loggedIn={!!viewer} />)
          )}

          {(page > 1 || hasNext) && (
            <div className="load-more pp-pager">
              {page > 1 && (
                <Link className="btn-load" href={hrefWith(base, { page: page - 1 > 1 ? String(page - 1) : null })}>
                  ← 新しいつぶやき
                </Link>
              )}
              {hasNext && (
                <Link className="btn-load" href={hrefWith(base, { page: String(page + 1) })}>
                  もっと見る
                </Link>
              )}
            </div>
          )}
        </div>

        <aside className="sidebar fade-in" style={{ transitionDelay: "0.1s" }}>
          <div className="side-card">
            <div className="side-title">
              <span className="icon-pill">🔥</span> トレンドタグ
            </div>
            {trends.length === 0 ? (
              <p className="pp-side-empty">この7日間のタグはまだありません。</p>
            ) : (
              <div className="hashtag-list">
                {trends.map((t) => (
                  <Link key={t.tag} href={`/tweets?tag=${encodeURIComponent(t.tag)}`} className={`htag${tag === t.tag ? " active" : ""}`}>
                    #{t.tag}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="side-card">
            <div className="side-title">
              <span className="icon-pill">💡</span> おすすめの出品者
            </div>
            {sellers.length === 0 ? (
              <p className="pp-side-empty">まだ出品者がいません。</p>
            ) : (
              sellers.map((s) => (
                <div className="active-seller" key={s.id}>
                  <Link href={`/sellers/${s.id}`} aria-label={`${s.name}のプロフィール`}>
                    <Avatar url={s.avatarUrl} name={s.name} className="as-avatar">
                      {isOnline(s.lastSeenAt) && <div className="as-online" title="オンライン" />}
                    </Avatar>
                  </Link>
                  <div>
                    <Link href={`/sellers/${s.id}`} className="as-name">
                      {s.name}
                    </Link>
                    <div className="as-sub">{[s.occupation, s.age ? `${s.age}歳` : null].filter(Boolean).join(" ")}</div>
                  </div>
                  <FollowButton
                    id={s.id}
                    initial={s.following}
                    loggedIn={!!viewer}
                    className="as-follow"
                    activeClassName="following"
                    labels={["フォロー", "フォロー中"]}
                    ariaLabel={`${s.name}をフォロー`}
                  />
                </div>
              ))
            )}
          </div>

          <div className="side-card">
            <div className="side-title">
              <span className="icon-pill">🛍</span> 新着商品
            </div>
            {(newItems.data ?? []).length === 0 ? (
              <p className="pp-side-empty">まだ商品がありません。</p>
            ) : (
              <div className="pp-side-items">
                {(newItems.data ?? []).map((l) => {
                  const img = listingImage(l.image_paths[0]);
                  return (
                    <Link key={l.id} href={`/items/${l.id}`} className="item-link" style={{ margin: 0 }}>
                      <div className="item-link-thumb">{img ? <img src={img} alt="" className="il-img" /> : "🛍"}</div>
                      <div className="item-link-info">
                        <div className="item-link-name">{l.title}</div>
                        <div className="item-link-price">{l.price !== null ? yen(l.price) : "価格未定"}</div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </main>

      <SiteFooter variant="tweets" />
    </div>
  );
}
