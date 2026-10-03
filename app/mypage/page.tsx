'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import './mypage.css';

interface Item {
  id: string;
  title: string;
  price: number;
  category: string;
  shipping_badge: string;
  created_at: string;
}

export default function MyPage() {
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState('dashboard');
  const [tweetText, setTweetText] = useState('');
  const [tweetList, setTweetList] = useState<string[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<{
    nickname: string;
    role: string;
    email: string;
    age: string;
  }>({
    nickname: 'ユーザー',
    role: 'seller',
    email: '',
    age: '-',
  });

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user }, error } = await supabase.auth.getUser();

      if (error || !user) {
        window.location.href = '/auth';
        return;
      }

      const meta = user.user_metadata || {};
      setUserInfo({
        nickname: meta.nickname || 'ユーザー',
        role: meta.role || 'seller',
        email: user.email || '',
        age: meta.age || '-',
      });

      // 自分の出品商品を Supabase から取得
      const { data: itemData } = await supabase
        .from('items')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (itemData) {
        setItems(itemData as Item[]);
      }

      setLoading(false);
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
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
        読み込み中...🌸
      </div>
    );
  }

  return (
    <>
      <header className="mypage-header">
        <a href="#" className="logo">♡ LABEL NAME</a>
        <nav>
          <a href="#">商品一覧</a>
          <a href="#">つぶやき</a>
          <a href="#" className="notif-btn">🔔<span className="notif-dot"></span></a>
          <div className="nav-divider"></div>
          <a href="#" className="nav-active">マイページ</a>
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
              <div><div className="pm-stat-num">0</div><div className="pm-stat-label">販売数</div></div>
              <div><div className="pm-stat-num">5.0</div><div className="pm-stat-label">評価</div></div>
            </div>
            <div className="kyc-badge">✅ 本人確認未完了</div>
          </div>

          <div className="side-nav">
            <a className={`side-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}><span className="side-nav-icon">📊</span> ダッシュボード</a>
            <a className={`side-nav-item ${activeTab === 'items' ? 'active' : ''}`} onClick={() => setActiveTab('items')}><span className="side-nav-icon">📦</span> 出品管理<span className="side-nav-badge">{items.length}</span></a>
            <a className={`side-nav-item ${activeTab === 'sales' ? 'active' : ''}`} onClick={() => setActiveTab('sales')}><span className="side-nav-icon">💰</span> 売上・振込</a>
            <a className={`side-nav-item ${activeTab === 'tweet' ? 'active' : ''}`} onClick={() => setActiveTab('tweet')}><span className="side-nav-icon">💬</span> つぶやき投稿</a>
            <a className={`side-nav-item ${activeTab === 'messages' ? 'active' : ''}`} onClick={() => setActiveTab('messages')}><span className="side-nav-icon">✉️</span> メッセージ<span className="side-nav-badge">0</span></a>
            <a className={`side-nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}><span className="side-nav-icon">⚙</span> 設定</a>
          </div>
        </aside>

        <div className="main fade-in visible" style={{ transitionDelay: '0.08s' }}>
          {activeTab === 'dashboard' && (
            <div className="panel show">
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-card-label">💰 今月の売上</div>
                  <div className="stat-card-num pk">¥0</div>
                  <div className="stat-card-sub"><span className="stat-up">--</span> 先月比</div>
                </div>
                <div className="stat-card">
                  <div className="stat-card-label">📦 今月の販売数</div>
                  <div className="stat-card-num">0件</div>
                  <div className="stat-card-sub"><span className="stat-up">--</span> 先月比</div>
                </div>
                <div className="stat-card">
                  <div className="stat-card-label">👁 出品中の商品</div>
                  <div className="stat-card-num">{items.length}件</div>
                  <div className="stat-card-sub">うち即日対応 <strong style={{ color: 'var(--primary)' }}>{items.filter(i => i.shipping_badge === '即日発送').length}件</strong></div>
                </div>
                <div className="stat-card">
                  <div className="stat-card-label">⭐ 平均評価</div>
                  <div className="stat-card-num pk">5.0</div>
                  <div className="stat-card-sub">0件のレビュー</div>
                </div>
              </div>
            </div>
          )}

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
                <div style={{ marginTop: '30px', textAlign: 'center', color: 'var(--text-sub)' }}>
                  まだ出品している商品はありません
                </div>
              ) : (
                <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {items.map((item) => (
                    <div key={item.id} style={{ background: '#fff', padding: '16px', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '15px' }}>{item.title}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-sub)', marginTop: '4px' }}>
                          ¥{item.price.toLocaleString()} ・ {item.category} ・ <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{item.shipping_badge}</span>
                        </div>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {new Date(item.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'sales' && (
            <div className="panel show">
              <div className="sales-summary">
                <div className="ss-card"><div className="ss-label">今月の売上</div><div className="ss-num">¥0</div></div>
                <div className="ss-card"><div className="ss-label">累計売上</div><div className="ss-num">¥0</div></div>
                <div className="ss-card"><div className="ss-label">振込申請可能額</div><div className="ss-num">¥0</div></div>
              </div>
            </div>
          )}

          {activeTab === 'tweet' && (
            <div className="panel show">
              <div style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', borderRadius: 'var(--r)', padding: '20px' }}>
                <div style={{ fontSize: '14px', fontWeight: 800, marginBottom: '14px' }}>✏️ 新しいつぶやき</div>
                <textarea
                  style={{ width: '100%', minHeight: '90px', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255, 75, 145, 0.2)', color: 'black' }}
                  placeholder="つぶやきを入力してください"
                  value={tweetText}
                  onChange={(e) => setTweetText(e.target.value)}
                />
                <button
                  onClick={handlePostTweet}
                  style={{ marginTop: '10px', padding: '8px 20px', borderRadius: '999px', background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 800 }}
                >
                  つぶやく
                </button>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="panel show">
              <div className="settings-section">
                <div className="settings-title"><span className="icon-pill">👤</span> アカウント情報</div>
                <div className="setting-row">
                  <div className="setting-info"><div className="setting-name">ニックネーム</div></div>
                  <div className="setting-val">{userInfo.nickname}</div>
                </div>
                <div className="setting-row">
                  <div className="setting-info"><div className="setting-name">メールアドレス</div></div>
                  <div className="setting-val">{userInfo.email}</div>
                </div>
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