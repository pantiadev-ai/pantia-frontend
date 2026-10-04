'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import './globals.css';

interface Item {
  id: string;
  title: string;
  price: number;
  category: string;
  shipping_badge?: string;
  image_src?: string;
  image_url?: string;
  image_urls?: string[];
  created_at?: string;
  published_at?: string;
}

export default function HomePage() {
  const supabase = createClient();

  const [items, setItems] = useState<Item[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('すべて');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const { data, error } = await supabase
          .from('items')
          .select('*');

        if (error) {
          console.error('Error fetching items:', error.message);
        } else if (data) {
          setItems(data as Item[]);
        }
      } catch (err) {
        console.error('Unexpected error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, []);

  const toggleFavorite = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((favId) => favId !== id) : [...prev, id]
    );
  };

  const filteredItems = selectedCategory === 'すべて'
    ? items
    : items.filter((item) => item.category?.includes(selectedCategory.replace(/^[^\s]+\s*/, '')));

  return (
    <>
      {/* HEADER */}
      <header className="header">
        <div className="header-inner">
          <a href="/" className="logo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            LABEL NAME
          </a>

          <div className="header-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input type="text" placeholder="商品・出品者を検索" />
          </div>

          <nav className="nav-desktop">
            <a href="#" className="nav-link">女の子</a>
            <a href="#" className="nav-link">商品</a>
            <a href="#" className="nav-link">つぶやき</a>
            <a href="#" className="nav-link">ランキング</a>
          </nav>

          <a href="/mypage" className="btn-primary">
            マイページ
          </a>
        </div>
      </header>

      {/* ANNOUNCE */}
      <div className="announce-bar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        お知らせ：Mastercard・JCB・銀行振込に対応中！
      </div>

      <main className="container">
        {/* HERO / REGISTRATION */}
        <section className="hero-card">
          <h1 className="hero-title">安心・安全のリユースマーケット</h1>
          <p className="hero-sub">会員登録は完全無料。すぐに利用を開始できます</p>

          <div className="hero-grid">
            <a href="/items/create" className="reg-card seller">
              <div className="reg-icon-wrap">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.38 3.46L16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg>
              </div>
              <h3>売りたい方（出品者）</h3>
              <p>プライバシーを守りながら安全に販売。匿名発送オプション完備。</p>
              <button className="btn-primary" style={{ width: '100%' }}>出品する</button>
            </a>

            <a href="/mypage" className="reg-card buyer">
              <div className="reg-icon-wrap">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
              </div>
              <h3>買いたい方（購入者）</h3>
              <p>お気に入りの出品者をフォローして、限定・新着商品をチェック。</p>
              <button className="btn-primary" style={{ width: '100%', background: 'linear-gradient(135deg, var(--secondary), #A78BFA)' }}>マイページへ</button>
            </a>
          </div>
        </section>

        {/* STATS */}
        <div className="stats-bar">
          <div className="stat-item"><div className="stat-num">2,400+</div><div className="stat-label">登録出品者</div></div>
          <div className="stat-item"><div className="stat-num">18,000+</div><div className="stat-label">累計取引数</div></div>
          <div className="stat-item"><div className="stat-num">4.8 ★</div><div className="stat-label">平均評価</div></div>
          <div className="stat-item"><div className="stat-num">即日</div><div className="stat-label">発送対応あり</div></div>
        </div>

        {/* TWEETS */}
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              みんなのつぶやき
            </h2>
            <a href="#" className="more-link">もっと見る →</a>
          </div>

          <div className="scroll-row">
            <div className="tweet-card">
              <div className="tweet-user">
                <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80" className="avatar" alt="みい" />
                <div>
                  <div className="tweet-name">みい</div>
                  <div className="tweet-meta">飲食 ・ 28歳</div>
                </div>
              </div>
              <div className="tweet-text">今日パンツ新しく出品しました♡ プロフィールから見てみてね🌸</div>
              <div className="tweet-foot">
                <div className="tweet-actions">
                  <span className="tweet-act">♡ 12</span>
                  <span className="tweet-act">💬 3</span>
                </div>
                <span>2分前</span>
              </div>
            </div>

            <div className="tweet-card">
              <div className="tweet-user">
                <img src="https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=120&q=80" className="avatar" alt="めい" />
                <div>
                  <div className="tweet-name">めい</div>
                  <div className="tweet-meta">大学生 ・ 19歳</div>
                </div>
              </div>
              <div className="tweet-text">今日ゼミ長かった〜😂 帰宅してすぐ撮影したやつ出してます💕</div>
              <div className="tweet-foot">
                <div className="tweet-actions">
                  <span className="tweet-act">♡ 28</span>
                  <span className="tweet-act">💬 7</span>
                </div>
                <span>15分前</span>
              </div>
            </div>
          </div>
        </section>

        {/* NEW ITEMS */}
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
              新着商品
            </h2>
            <a href="#" className="more-link">もっと見る →</a>
          </div>

          {/* Category Filter */}
          <div className="cat-tabs">
            {['すべて', '🩲 パンティ', '👙 ブラジャー', '💞 B&Pセット', '🧴 体液系', '👗 衣類系'].map((cat) => (
              <button
                key={cat}
                className={`cat-chip ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', fontWeight: 'bold' }}>読み込み中...🌸</div>
          ) : filteredItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-sub)' }}>該当する商品はありません</div>
          ) : (
            <div className="items-grid">
              {filteredItems.map((item) => {
                const displayImg = item.image_src || item.image_url || (item.image_urls && item.image_urls.length > 0 ? item.image_urls[0] : null);

                return (
                  <a href={`/items/${item.id}`} key={item.id} className="item-card">
                    <div className="item-thumb-wrap">
                      {displayImg ? (
                        <img src={displayImg} className="item-img" alt={item.title} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eee', fontSize: '32px' }}>📦</div>
                      )}
                      <span className="item-tag">{item.category}</span>
                      <button
                        className={`fav-btn ${favorites.includes(item.id) ? 'active' : ''}`}
                        onClick={(e) => toggleFavorite(e, item.id)}
                      >
                        ♥
                      </button>
                    </div>
                    <div className="item-body">
                      <div className="item-title">{item.title}</div>
                      <div className="item-seller-info">
                        <span>{item.shipping_badge || '通常発送'}</span>
                      </div>
                      <div className="item-foot">
                        <div className="item-price">¥{item.price ? item.price.toLocaleString() : 0}</div>
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-copy">
            © 2026 LABEL NAME. All rights reserved.
          </div>
        </div>
      </footer>
    </>
  );
}