'use client';

import React, { useState, useEffect, use } from 'react';
import { createClient } from '@/utils/supabase/client';
import './seller_profile.css';

interface Seller {
  id: string;
  nickname: string;
  age?: number;
  occupation?: string;
  bio?: string;
  profile_image_url?: string;
  profile_image_urls?: string[];
  created_at?: string;
}

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
}

export default function SellerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: sellerId } = use(params);
  const supabase = createClient();

  const [seller, setSeller] = useState<Seller | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [activeTab, setActiveTab] = useState<'intro' | 'items' | 'tweets' | 'reviews'>('intro');
  const [isFollowing, setIsFollowing] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSellerData = async () => {
      try {
        // 1. 出品者情報（sellers）を取得
        const { data: sellerData, error: sellerErr } = await supabase
          .from('sellers')
          .select('*')
          .eq('id', sellerId)
          .single();

        if (sellerErr) {
          console.error('Seller Fetch Error:', sellerErr.message);
        } else {
          setSeller(sellerData);
        }

        // 2. この出品者の商品一覧（items）を取得
        const { data: itemsData, error: itemsErr } = await supabase
          .from('items')
          .select('*')
          .or(`user_id.eq.${sellerId},seller_id.eq.${sellerId}`);

        if (itemsErr) {
          console.error('Items Fetch Error:', itemsErr.message);
        } else if (itemsData) {
          setItems(itemsData as Item[]);
        }
      } catch (err) {
        console.error('Unexpected error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSellerData();
  }, [sellerId]);

  const toggleFavorite = (e: React.MouseEvent, itemId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setFavorites((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontWeight: 'bold' }}>
        読み込み中...🌸
      </div>
    );
  }

  if (!seller) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <h2>出品者が見つかりませんでした</h2>
        <a href="/" style={{ color: 'var(--primary)', marginTop: '10px', display: 'inline-block' }}>トップページへ戻る</a>
      </div>
    );
  }

  return (
    <>
      {/* HEADER */}
      <header className="seller-header">
        <a href="/" className="logo">♡ LABEL NAME</a>
        <div className="header-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="text" placeholder="商品・出品者を検索" />
        </div>
        <nav>
          <a href="#">女の子</a>
          <a href="#">商品</a>
          <a href="#">つぶやき</a>
          <a href="#">ランキング</a>
          <div className="nav-divider"></div>
          <a href="/mypage" className="nav-login">マイページ</a>
        </nav>
      </header>

      {/* BREADCRUMB */}
      <div className="breadcrumb">
        <a href="/">トップ</a>
        <span className="bc-sep">›</span>
        <span>{seller.nickname}</span>
      </div>

      {/* COVER */}
      <div className="profile-cover fade-in visible">
        <div className="cover-img">🌸 💕 ✨ 🎀 💗</div>
      </div>

      {/* PROFILE MAIN */}
      <main className="profile-main fade-in visible">
        {/* LEFT SIDEBAR */}
        <aside className="sidebar">
          <div className="profile-card">
            <div className="avatar-wrap">
              <div className="profile-avatar" style={{ overflow: 'hidden' }}>
                {seller.profile_image_url ? (
                  <img src={seller.profile_image_url} alt={seller.nickname} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  seller.nickname.slice(0, 1)
                )}
              </div>
              <div className="online-badge"></div>
            </div>
            <div className="profile-name">{seller.nickname}</div>
            <div className="profile-handle">@{seller.nickname.toLowerCase()}</div>

            {/* サブ画像ギャラリー */}
            {seller.profile_image_urls && seller.profile_image_urls.length > 1 && (
              <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', marginBottom: '12px' }}>
                {seller.profile_image_urls.map((url, i) => (
                  <img key={i} src={url} alt={`sub_${i}`} style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #fff' }} />
                ))}
              </div>
            )}

            <div className="profile-tags">
              <span className="ptag online">🟢 オンライン</span>
              {seller.age && <span className="ptag age">{seller.age}歳</span>}
              {seller.occupation && <span className="ptag job">{seller.occupation}</span>}
              <span className="ptag">即日発送</span>
            </div>

            <button
              className={`btn-follow ${isFollowing ? 'following' : ''}`}
              onClick={() => setIsFollowing(!isFollowing)}
            >
              {isFollowing ? '✓ フォロー中' : '♡ フォローする'}
            </button>
            <button className="btn-message">✉ メッセージを送る</button>

            <div className="profile-stats">
              <div className="pstat">
                <div className="pstat-num">0</div>
                <div className="pstat-label">フォロワー</div>
              </div>
              <div className="pstat">
                <div className="pstat-num">{items.length}</div>
                <div className="pstat-label">販売数</div>
              </div>
              <div className="pstat">
                <div className="pstat-num">5.0</div>
                <div className="pstat-label">評価</div>
              </div>
            </div>
          </div>

          <div className="info-card">
            <div className="info-title">📋 基本情報</div>
            {seller.age && (
              <div className="info-row">
                <span className="info-label">年齢</span>
                <span className="info-val">{seller.age}歳</span>
              </div>
            )}
            {seller.occupation && (
              <div className="info-row">
                <span className="info-label">職業</span>
                <span className="info-val">{seller.occupation}</span>
              </div>
            )}
            <div className="info-row">
              <span className="info-label">発送目安</span>
              <span className="info-val pk">即日〜翌日</span>
            </div>
            <div className="info-row">
              <span className="info-label">配送方法</span>
              <span className="info-val">匿名配送対応</span>
            </div>
          </div>
        </aside>

        {/* RIGHT MAIN */}
        <div className="main-content">
          {/* TABS */}
          <div className="tabs">
            <div
              className={`tab ${activeTab === 'intro' ? 'active' : ''}`}
              onClick={() => setActiveTab('intro')}
            >
              自己紹介
            </div>
            <div
              className={`tab ${activeTab === 'items' ? 'active' : ''}`}
              onClick={() => setActiveTab('items')}
            >
              出品中 ({items.length})
            </div>
            <div
              className={`tab ${activeTab === 'tweets' ? 'active' : ''}`}
              onClick={() => setActiveTab('tweets')}
            >
              つぶやき
            </div>
            <div
              className={`tab ${activeTab === 'reviews' ? 'active' : ''}`}
              onClick={() => setActiveTab('reviews')}
            >
              レビュー
            </div>
          </div>

          {/* TAB: 自己紹介 */}
          {activeTab === 'intro' && (
            <div className="tab-panel">
              <div className="intro-card">
                <div className="sec-label"><span className="icon-pill">👋</span> 自己紹介</div>
                <div className="intro-text" style={{ whiteSpace: 'pre-wrap' }}>
                  {seller.bio || 'はじめまして！プロフィールをご覧いただきありがとうございます🌸'}
                </div>
              </div>
            </div>
          )}

          {/* TAB: 出品中 */}
          {activeTab === 'items' && (
            <div className="tab-panel">
              {items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-sub)' }}>現在出品中の商品はありません</div>
              ) : (
                <div className="items-grid">
                  {items.map((item) => {
                    const displayImg = item.image_src || item.image_url || (item.image_urls && item.image_urls.length > 0 ? item.image_urls[0] : null);

                    return (
                      <a href={`/items/${item.id}`} key={item.id} className="item-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                        <div className="item-thumb">
                          {displayImg ? (
                            <img src={displayImg} alt={item.title} className="item-img" />
                          ) : (
                            '📦'
                          )}
                          <div className="item-tag">{item.category}</div>
                          <div
                            className="item-heart"
                            style={{ color: favorites.includes(item.id) ? 'var(--primary)' : '' }}
                            onClick={(e) => toggleFavorite(e, item.id)}
                          >
                            {favorites.includes(item.id) ? '♥' : '♡'}
                          </div>
                        </div>
                        <div className="item-info">
                          <div className="item-name">{item.title}</div>
                          <div className="item-footer">
                            <div className="item-price">¥{item.price ? item.price.toLocaleString() : 0}</div>
                            <div className="item-badge">{item.shipping_badge || '即日'}</div>
                          </div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB: つぶやき */}
          {activeTab === 'tweets' && (
            <div className="tab-panel">
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-sub)' }}>
                まだつぶやきはありません
              </div>
            </div>
          )}

          {/* TAB: レビュー */}
          {activeTab === 'reviews' && (
            <div className="tab-panel">
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-sub)' }}>
                まだレビューはありません
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="seller-footer">
        <div className="footer-inner">
          <div className="footer-logo">♡ LABEL NAME</div>
          <div className="footer-copy">© 2026 LABEL NAME.</div>
        </div>
      </footer>
    </>
  );
}