/* / 入口（見本: index.html）。数字・つぶやき・出品者・新着・ランキングは、すべて DB から利用者の権限で読む。
   新着のカテゴリは URL の ?cat= で切り替える（知らない値は無視して「すべて」） */
import "@/styles/base.css";
import "@/components/catalogue/catalogue.css";
import type { ReactNode } from "react";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { getViewer, type Viewer } from "@/lib/auth";
import {
  authorsOf,
  countPublicSellers,
  favoriteIds,
  latestPosts,
  listSellers,
  myBlockedIds,
  rankingListings,
  rankingSellers,
  searchListings,
} from "@/lib/catalogue";
import { avatarImage } from "@/lib/storage";
import { CATEGORIES } from "@/lib/labels";
import { displayName, excerpt, isOnline, num, relTime, san, yen } from "@/lib/format";
import HomeItemCard from "@/components/catalogue/HomeItemCard";
import { initialOf, isRecent, metaLine } from "@/components/catalogue/card-helpers";

const NEW_ITEMS = 8;
const POSTS = 6;
const GIRLS = 6;
const RANKS = 3;
/** 空の行の高さを保つための空白 */
const NBSP = String.fromCharCode(0xa0);

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function rankNumClass(i: number): string {
  return `rank-num${i === 0 ? " gold" : i === 1 ? " silver" : i === 2 ? " bronze" : ""}`;
}

/** 写真が無い人は頭文字の丸 */
function Avatar({ path, name, className }: { path: string | null; name: string | null; className?: string }) {
  const src = avatarImage(path);
  const cls = className ? ` ${className}` : "";
  return src ? (
    <img src={src} className={`avatar${cls}`} alt="" loading="lazy" />
  ) : (
    <span className={`cat-avatar-fallback${cls}`} aria-hidden="true">
      {initialOf(name)}
    </span>
  );
}

/* ── 登録の2枚のカード。ログイン中は役割に合わせた行き先にする ── */
function Hero({ viewer }: { viewer: Viewer | null }) {
  const shirt = (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M20.38 3.46L16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
    </svg>
  );
  const cart = (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );

  type Card = { href: string; tone: "seller" | "buyer"; icon: ReactNode; title: string; text: string; button: string };
  let title = "安心・安全のリユースマーケット";
  let sub: ReactNode = "会員登録は完全無料。すぐに利用を開始できます";
  let cards: [Card, Card];

  if (!viewer) {
    // role は登録画面で役割を先に選んでおくための印（仮。今の /auth は読まない）
    cards = [
      {
        href: "/auth?tab=register&role=seller",
        tone: "seller",
        icon: shirt,
        title: "売りたい方（出品者）",
        text: "プライバシーを守りながら安全に販売。匿名発送オプション完備。",
        button: "出品者として登録",
      },
      {
        href: "/auth?tab=register&role=buyer",
        tone: "buyer",
        icon: cart,
        title: "買いたい方（購入者）",
        text: "お気に入りの出品者をフォローして、限定・新着商品をチェック。",
        button: "購入者として登録",
      },
    ];
  } else {
    title = `ようこそ、${san(viewer.nickname || "ゲスト")}`;
    sub =
      viewer.kycStatus === "approved" ? (
        viewer.role === "seller" ? (
          "新しい商品を出品して、ファンに届けましょう"
        ) : (
          "フォロー中の女の子の新着とつぶやきをチェックしましょう"
        )
      ) : viewer.kycStatus === "pending" ? (
        "本人確認の書類を確認しています。終わるまでお待ちください"
      ) : (
        <>
          {viewer.role === "seller" ? "出品" : "購入"}には本人確認が必要です。<Link href="/kyc">本人確認をする →</Link>
        </>
      );
    cards =
      viewer.role === "seller"
        ? [
            { href: "/listings/new", tone: "seller", icon: shirt, title: "商品を出品する", text: "写真と説明を入れて、すぐに出品できます。", button: "出品する" },
            { href: "/mypage", tone: "buyer", icon: cart, title: "マイページ", text: "注文・売上・プロフィールの管理はこちら。", button: "マイページへ" },
          ]
        : [
            { href: "/items", tone: "seller", icon: cart, title: "商品をさがす", text: "カテゴリ・価格・着用日数で絞り込めます。", button: "商品を見る" },
            { href: "/timeline", tone: "buyer", icon: shirt, title: "タイムライン", text: "フォロー中の女の子の新着とつぶやき。", button: "タイムラインへ" },
          ];
  }

  return (
    <section className="hero-card">
      <h1 className="hero-title">{title}</h1>
      <p className="hero-sub">{sub}</p>
      <div className="hero-grid">
        {cards.map((c) => (
          <Link href={c.href} className={`reg-card ${c.tone}`} key={c.href}>
            <div className="reg-icon-wrap">{c.icon}</div>
            <h3>{c.title}</h3>
            <p>{c.text}</p>
            <span className="btn-primary cat-reg-btn">{c.button}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const catRaw = first(sp.cat);
  const cat = CATEGORIES.some((c) => c.value === catRaw) ? catRaw : null;

  const viewer = await getViewer();
  const [sellerCount, base, catRes, posts, active, rankS, rankL, blocked] = await Promise.all([
    countPublicSellers(),
    searchListings({ sort: "new", limit: NEW_ITEMS }),
    cat ? searchListings({ categories: [cat], sort: "new", limit: NEW_ITEMS }) : Promise.resolve(null),
    latestPosts(POSTS),
    listSellers({ byActivity: true, limit: GIRLS * 2 }),
    rankingSellers(RANKS + 2),
    rankingListings(RANKS + 2),
    myBlockedIds(viewer?.id),
  ]);

  // 自分がブロックした人は、どの区画にも出さない（仮。RLS で除かれない物もあるので画面でも除く）
  const newRes = catRes ?? base;
  const newItems = newRes.items.filter((i) => !blocked.has(i.sellerId));
  const shownPosts = posts.filter((p) => !blocked.has(p.authorId));
  const girls = active.sellers.filter((s) => !blocked.has(s.id)).slice(0, GIRLS);
  const topSellers = rankS.rows.filter((r) => !blocked.has(r.id)).slice(0, RANKS);
  const topListings = rankL.rows.filter((r) => !blocked.has(r.sellerId)).slice(0, RANKS);

  const [authors, favs] = await Promise.all([
    authorsOf(shownPosts.map((p) => p.authorId)),
    favoriteIds(
      viewer?.id,
      newItems.map((i) => i.id),
    ),
  ]);
  const tweets = shownPosts.filter((p) => authors.has(p.authorId));
  const sameDayCount = base.facets.options.same_day ?? 0;
  const moreItemsHref = cat ? `/items?categories=${cat}` : "/items";

  return (
    <div className="pg-base">
      <SiteHeader variant="index" search={{ action: "/items", placeholder: "商品・出品者を検索" }} />

      <main className="container">
        <Hero viewer={viewer} />

        {/* 数字の帯 */}
        <div className="stats-bar">
          <div className="stat-item">
            <div className="stat-num">{sellerCount == null ? "-" : num(sellerCount)}</div>
            <div className="stat-label">登録出品者</div>
          </div>
          <div className="stat-item">
            <div className="stat-num">{base.ok ? num(base.total) : "-"}</div>
            <div className="stat-label">公開中の商品</div>
          </div>
          <div className="stat-item">
            <div className="stat-num">{base.ok ? num(sameDayCount) : "-"}</div>
            <div className="stat-label">即日発送の商品</div>
          </div>
          <div className="stat-item">
            <div className="stat-num">18歳以上</div>
            <div className="stat-label">本人確認済みのみ</div>
          </div>
        </div>

        {/* つぶやき */}
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              みんなのつぶやき
            </h2>
            <Link href="/tweets" className="more-link">
              もっと見る →
            </Link>
          </div>
          {tweets.length === 0 ? (
            <div className="cat-empty">まだつぶやきはありません</div>
          ) : (
            <div className="scroll-row">
              {tweets.map((p) => {
                const a = authors.get(p.authorId)!;
                const meta = metaLine(a.occupation, a.age);
                return (
                  <div className="tweet-card cat-card" key={p.id}>
                    <div className="tweet-user">
                      <Avatar path={a.avatarPath} name={a.publicName} />
                      <div>
                        <div className="tweet-name">{displayName(a.publicName)}</div>
                        {meta ? <div className="tweet-meta">{meta}</div> : null}
                      </div>
                    </div>
                    <Link href={`/tweets/${p.id}`} className="tweet-text cat-stretch">
                      {excerpt(p.body, 80) || (p.imagePaths.length > 0 ? "📷 写真を投稿しました" : "")}
                    </Link>
                    <div className="tweet-foot">
                      <div className="tweet-actions">
                        <span className="tweet-act">♡ {num(p.likeCount)}</span>
                        <span className="tweet-act">💬 {num(p.commentCount)}</span>
                      </div>
                      <span>{relTime(p.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* アクティブな出品者 */}
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              アクティブな出品者
            </h2>
            <Link href="/sellers" className="more-link">
              全員を見る →
            </Link>
          </div>
          {girls.length === 0 ? (
            <div className="cat-empty">{active.ok ? "まだ登録している女の子はいません" : "読み込めませんでした"}</div>
          ) : (
            <div className="girls-grid">
              {girls.map((s) => {
                const meta = metaLine(s.occupation, s.age, " / ");
                const isNew = isRecent(s.createdAt, 14);
                const sameDay = s.supportedOptions.includes("same_day");
                return (
                  <Link href={`/sellers/${s.id}`} className="girl-card" key={s.id}>
                    <div className="girl-avatar-wrap">
                      <Avatar path={s.avatarPath} name={s.publicName} />
                      <span className={`status-badge${isOnline(s.lastSeenAt) ? "" : " offline"}`} />
                    </div>
                    <div className="girl-name">{displayName(s.publicName)}</div>
                    <div className="girl-tag">{meta || NBSP}</div>
                    {isNew || sameDay ? (
                      <div className="badge-row">
                        {isNew ? <span className="badge badge-secondary">新着</span> : null}
                        {sameDay ? <span className="badge badge-primary">即日</span> : null}
                      </div>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* 新着商品 */}
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
              新着商品
            </h2>
            <Link href={moreItemsHref} className="more-link">
              もっと見る →
            </Link>
          </div>

          <div className="cat-tabs">
            <Link href="/" scroll={false} className={`cat-chip${cat ? "" : " active"}`} aria-current={cat ? undefined : "page"}>
              すべて
            </Link>
            {CATEGORIES.filter((c) => c.value !== "other").map((c) => (
              <Link
                key={c.value}
                href={`/?cat=${c.value}`}
                scroll={false}
                className={`cat-chip${cat === c.value ? " active" : ""}`}
                aria-current={cat === c.value ? "page" : undefined}
              >
                {c.icon} {c.label}
              </Link>
            ))}
          </div>

          {!newRes.ok ? (
            <div className="cat-empty" role="alert">
              商品を読み込めませんでした。時間をおいて、もう一度開いてください
            </div>
          ) : newItems.length === 0 ? (
            <div className="cat-empty">{cat ? "このカテゴリの商品はまだありません" : "まだ商品はありません"}</div>
          ) : (
            <div className="items-grid">
              {newItems.map((item) => (
                <HomeItemCard key={item.id} item={item} heart={item.sellerId !== viewer?.id} favorited={favs.has(item.id)} loggedIn={!!viewer} />
              ))}
            </div>
          )}
        </section>

        {/* 週間ランキング */}
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              週間ランキング
            </h2>
            <Link href="/ranking" className="more-link">
              もっと見る →
            </Link>
          </div>

          <div className="ranking-grid">
            <div className="rank-box">
              <div className="rank-box-title">人気出品者</div>
              {topSellers.length === 0 ? (
                <div className="cat-empty">{rankS.ok ? "今週のランキングはまだありません" : "読み込めませんでした"}</div>
              ) : (
                <div className="rank-list">
                  {topSellers.map((r, i) => (
                    <Link href={`/sellers/${r.id}`} className="rank-item" key={r.id}>
                      <span className={rankNumClass(i)}>{i + 1}</span>
                      <Avatar path={r.avatarPath} name={r.publicName} className="cat-avatar-30" />
                      <div className="rank-info">
                        <div className="rank-title">{displayName(r.publicName)}</div>
                        <div className="rank-sub">{metaLine(r.occupation, r.age) || NBSP}</div>
                      </div>
                      <div className="rank-val">今週 {num(r.weekOrders)}件</div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="rank-box">
              <div className="rank-box-title">注目アイテム</div>
              {topListings.length === 0 ? (
                <div className="cat-empty">{rankL.ok ? "今週のランキングはまだありません" : "読み込めませんでした"}</div>
              ) : (
                <div className="rank-list">
                  {topListings.map((r, i) => (
                    <Link href={`/items/${r.id}`} className="rank-item" key={r.id}>
                      <span className={rankNumClass(i)}>{i + 1}</span>
                      <div className="rank-info">
                        <div className="rank-title">{r.title}</div>
                        <div className="rank-sub">
                          {displayName(r.sellerName)} ・ {yen(r.price)}
                        </div>
                      </div>
                      {r.soldOut ? <span className="badge badge-secondary">SOLD</span> : <div className="rank-val">♥ {num(r.likeCount)}</div>}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 安心・安全 */}
        <section className="trust-section">
          <div className="section-title cat-trust-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            安心・安全への取り組み
          </div>
          <p className="cat-trust-sub">すべてのユーザー様が快適にお取引できる環境を整えています</p>
          <div className="trust-grid">
            <div className="trust-card">
              <div className="trust-icon">📦</div>
              <h4>匿名配送</h4>
              <p>住所・氏名を開示せずに安全にお届け可能。</p>
            </div>
            <div className="trust-card">
              <div className="trust-icon">🛡️</div>
              <h4>本人確認の徹底</h4>
              <p>18歳以上の身元確認を行ったユーザーのみ利用可。</p>
            </div>
            <div className="trust-card">
              <div className="trust-icon">💳</div>
              <h4>安全な決済処理</h4>
              <p>クレジットカード・PayPay・銀行振込に対応。</p>
            </div>
            <div className="trust-card">
              <div className="trust-icon">🚨</div>
              <h4>通報・ブロック</h4>
              <p>困った相手はすぐにブロック。通報は運営が確認します。</p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter variant="index" />

      {/* スマホの下のナビ（768px 以上では消える） */}
      <nav className="mobile-bottom-nav" aria-label="メニュー">
        <Link href="/" className="nav-item active" aria-current="page">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
          ホーム
        </Link>
        <Link href="/items" className="nav-item">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          さがす
        </Link>
        <Link href="/tweets" className="nav-item">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          つぶやき
        </Link>
        <Link href={viewer ? "/mypage" : "/auth"} className="nav-item">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          {viewer ? "マイページ" : "ログイン"}
        </Link>
      </nav>
    </div>
  );
}
