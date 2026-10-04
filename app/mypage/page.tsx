'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import './mypage.css';

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

export default function MyPage() {
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState('items');
  const [tweetText, setTweetText] = useState('');
  const [tweetList, setTweetList] = useState<string[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const [userInfo, setUserInfo] = useState({
    nickname: 'めめ',
    role: 'seller',
    email: '',
    age: '-',
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
          window.location.href = '/auth';
          return;
        }

        const meta = user.user_metadata || {};
        setUserInfo({
          nickname: meta.nickname || 'めめ',
          role: meta.role || 'seller',
          email: user.email || '',
          age: meta.age || '-',
        });

        // ログイン中のユーザーID（user.id）に紐づく商品だけを取得
        const { data: itemData, error: itemError } = await supabase
          .from('items')
          .select('*')
          .or(`user_id.eq.${user.id},seller_id.eq.${user.id}`);

        if (itemError) {
          console.error('Data Fetch Error:', itemError.message);
        } else if (itemData) {
          setItems(itemData as Item[]);
        }
      } catch (err) {
        console.error('Unexpected error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handlePostTweet = () => {
    if (!tweetText.trim()) return;
    setTweetList([tweetText, ...tweetList]);
    setTweetText('');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/auth';
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontWeight: 'bold' }}>
        読み込み中...🌸
      </div>
    );
  }

  return (
    <>
      <header className="mypage-header">
        <a href="/" className="logo">♡ LABEL NAME</a>
        <nav>
          <a href="#">商品一覧</a>
          <a href="#">つぶやき</a>
          <a href="#" className="notif-btn">🔔<span className="notif-dot"></span></a>
          <div className="nav-divider"></div>
          <a href="/mypage" className="nav-active">マイページ</a>
          <button
            onClick={handleLogout}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text-sub)', fontWeight: 700 }}
          >
            ログアウト
          </button>
        </nav>
      </header>

      <main className="layout">
        <aside className="sidebar fade-in visible">
          <div className="profile-mini">
            <div className="pm-avatar">{userInfo.nickname.slice(0, 1)}<div className="pm-online"></div></div>
            <div className="pm-name">{userInfo.nickname}</div>
            <div className="pm-handle">@{userInfo.nickname.toLowerCase()}</div>
            <div className="pm-stats">
              <div><div className="pm-stat-num">0</div><div className="pm-stat-label">フォロワー</div></div>
              <div><div className="pm-stat-num">{items.length}</div><div className="pm-stat-label">出品数</div></div>
              <div><div className="pm-stat-num">5.0</div><div className="pm-stat-label">評価</div></div>
            </div>
            <div className="kyc-badge">✅ 本人確認未完了</div>
          </div>

          <div className="side-nav">
            <div className={`side-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}><span className="side-nav-icon">📊</span> ダッシュボード</div>
            <div className={`side-nav-item ${activeTab === 'items' ? 'active' : ''}`} onClick={() => setActiveTab('items')}><span className="side-nav-icon">📦</span> 出品管理<span className="side-nav-badge">{items.length}</span></div>
            <div className={`side-nav-item ${activeTab === 'sales' ? 'active' : ''}`} onClick={() => setActiveTab('sales')}><span className="side-nav-icon">💰</span> 売上・振込</div>
            <div className={`side-nav-item ${activeTab === 'tweet' ? 'active' : ''}`} onClick={() => setActiveTab('tweet')}><span className="side-nav-icon">💬</span> つぶやき投稿</div>
            <div className={`side-nav-item ${activeTab === 'messages' ? 'active' : ''}`} onClick={() => setActiveTab('messages')}><span className="side-nav-icon">✉️</span> メッセージ<span className="side-nav-badge">0</span></div>
            <div className={`side-nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}><span className="side-nav-icon">⚙</span> 設定</div>
          </div>
        </aside>

        <div className="main fade-in visible">
          {/* 出品管理タブ */}
          {activeTab === 'items' && (
            <div className="panel show">
              <div className="items-toolbar">
                <div className="items-search">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <input type="text" placeholder="商品名で検索" />
                </div>
                <a href="/items/create" className="btn-new-item" style={{ textDecoration: 'none' }}>＋ 新規出品</a>
              </div>

              {items.length === 0 ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-sub)' }}>
                  まだ出品している商品はありません
                </div>
              ) : (
                <div className="my-items-list">
                  {items.map((item) => {
                    const displayImg = item.image_src || item.image_url || (item.image_urls && item.image_urls.length > 0 ? item.image_urls[0] : null);
                    const displayDate = item.created_at || item.published_at || new Date().toISOString();

                    return (
                      <a
                        key={item.id}
                        href={`/items/${item.id}`}
                        style={{ textDecoration: 'none', color: 'inherit' }}
                      >
                        <div className="my-item">
                          <div className="my-item-thumb">
                            {displayImg ? (
                              <img src={displayImg} alt={item.title} className="my-img" />
                            ) : (
                              '📦'
                            )}
                          </div>
                          <div className="my-item-info">
                            <div className="my-item-name">{item.title}</div>
                            <div className="my-item-meta">
                              <span>{item.category}</span>
                              <span>・</span>
                              <span style={{ color: 'var(--primary)' }}>{item.shipping_badge || '通常発送'}</span>
                              <span>・</span>
                              <span>{new Date(displayDate).toLocaleDateString('ja-JP')}</span>
                            </div>
                          </div>
                          <div className="my-item-price">
                            ¥{item.price ? item.price.toLocaleString() : 0}
                          </div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ダッシュボードタブ */}
          {activeTab === 'dashboard' && (
            <div className="panel show">
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-card-label">💰 今月の売上</div>
                  <div className="stat-card-num pk">¥0</div>
                </div>
                <div className="stat-card">
                  <div className="stat-card-label">📦 今月の販売数</div>
                  <div className="stat-card-num">0件</div>
                </div>
                <div className="stat-card">
                  <div className="stat-card-label">👁 出品中の商品</div>
                  <div className="stat-card-num">{items.length}件</div>
                </div>
                <div className="stat-card">
                  <div className="stat-card-label">⭐ 平均評価</div>
                  <div className="stat-card-num pk">5.0</div>
                </div>
              </div>
            </div>
          )}

          {/* つぶやきタブ */}
          {activeTab === 'tweet' && (
            <div className="panel show">
              <div style={{ background: 'var(--glass-bg)', padding: '20px', borderRadius: 'var(--r)' }}>
                <textarea
                  style={{ width: '100%', minHeight: '90px', padding: '12px', borderRadius: '12px', color: '#000' }}
                  placeholder="つぶやきを入力してください"
                  value={tweetText}
                  onChange={(e) => setTweetText(e.target.value)}
                />
                <button
                  onClick={handlePostTweet}
                  style={{ marginTop: '10px', padding: '8px 20px', borderRadius: '999px', background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 800 }}
                >
                  つぶやく
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="mypage-footer">
        <div className="footer-inner">
          <div className="footer-logo">♡ LABEL NAME</div>
          <div className="footer-copy">© 2026 LABEL NAME.</div>
        </div>
      </footer>
    </>
  );
}