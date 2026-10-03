'use client';

import React, { useState } from 'react';
import './mypage.css';

export default function MyPage() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'items' | 'sales' | 'tweet' | 'messages' | 'settings'>('dashboard');
  const [tweetText, setTweetText] = useState('');
  const [tweetList, setTweetList] = useState<string[]>([
    '今日も新しいパンツ出品しました🌸 ぜひプロフィールからチェックしてね💕 #新着出品 #パンティ',
    '今日はゼミが長かった〜😂 帰ってすぐ出品準備しました！オプション希望の方はメッセージください💕 #大学生',
  ]);

  const handlePostTweet = () => {
    if (!tweetText.trim()) return;
    setTweetList([tweetText, ...tweetList]);
    setTweetText('');
  };

  return (
    <>
      {/* HEADER */}
      <header className="mypage-header">
        <a href="#" className="logo">♡ LABEL NAME</a>
        <nav>
          <a href="#">商品一覧</a>
          <a href="#">つぶやき</a>
          <a href="#" className="notif-btn">🔔<span className="notif-dot"></span></a>
          <div className="nav-divider"></div>
          <a href="#" className="nav-active">マイページ</a>
          <a href="#" style={{ padding: '7px 10px' }}>⚙</a>
        </nav>
      </header>

      {/* LAYOUT */}
      <main className="layout">
        {/* SIDEBAR */}
        <aside className="sidebar fade-in visible">
          <div className="profile-mini">
            <div className="pm-avatar">め<div className="pm-online"></div></div>
            <div className="pm-name">めい</div>
            <div className="pm-handle">@mei_chan</div>
            <div className="pm-stats">
              <div><div className="pm-stat-num">312</div><div className="pm-stat-label">フォロワー</div></div>
              <div><div className="pm-stat-num">48</div><div className="pm-stat-label">販売数</div></div>
              <div><div className="pm-stat-num">4.9</div><div className="pm-stat-label">評価</div></div>
            </div>
            <div className="kyc-badge">✅ 本人確認済み</div>
          </div>

          <div className="side-nav">
            <a className={`side-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}><span className="side-nav-icon">📊</span> ダッシュボード</a>
            <a className={`side-nav-item ${activeTab === 'items' ? 'active' : ''}`} onClick={() => setActiveTab('items')}><span className="side-nav-icon">📦</span> 出品管理<span className="side-nav-badge">12</span></a>
            <a className={`side-nav-item ${activeTab === 'sales' ? 'active' : ''}`} onClick={() => setActiveTab('sales')}><span className="side-nav-icon">💰</span> 売上・振込</a>
            <a className={`side-nav-item ${activeTab === 'tweet' ? 'active' : ''}`} onClick={() => setActiveTab('tweet')}><span className="side-nav-icon">💬</span> つぶやき投稿</a>
            <a className={`side-nav-item ${activeTab === 'messages' ? 'active' : ''}`} onClick={() => setActiveTab('messages')}><span className="side-nav-icon">✉️</span> メッセージ<span className="side-nav-badge">3</span></a>
            <a className={`side-nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}><span className="side-nav-icon">⚙️</span> 設定</a>
          </div>
        </aside>

        {/* MAIN */}
        <div className="main fade-in visible" style={{ transitionDelay: '0.08s' }}>
          {/* DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="panel show">
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-card-label">💰 今月の売上</div>
                  <div className="stat-card-num pk">¥38,400</div>
                  <div className="stat-card-sub"><span className="stat-up">↑ 12%</span> 先月比</div>
                </div>
                <div className="stat-card">
                  <div className="stat-card-label">📦 今月の販売数</div>
                  <div className="stat-card-num">14件</div>
                  <div className="stat-card-sub"><span className="stat-up">↑ 3件</span> 先月比</div>
                </div>
                <div className="stat-card">
                  <div className="stat-card-label">👁 出品中の商品</div>
                  <div className="stat-card-num">12件</div>
                  <div className="stat-card-sub">うち即日対応 <strong style={{ color: 'var(--primary)' }}>8件</strong></div>
                </div>
                <div className="stat-card">
                  <div className="stat-card-label">⭐ 平均評価</div>
                  <div className="stat-card-num pk">4.9</div>
                  <div className="stat-card-sub">38件のレビュー</div>
                </div>
              </div>
            </div>
          )}

          {/* ITEMS */}
          {activeTab === 'items' && (
            <div className="panel show">
              <div className="items-toolbar">
                <div className="items-search">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <input type="text" placeholder="商品名で検索" />
                </div>
                <a href="/items/create" className="btn-new-item" style={{ textDecoration: 'none' }}>＋ 新規出品</a>
              </div>
              <div className="my-items-list" style={{ marginTop: '16px' }}>
                <div className="my-item">
                  <div className="my-item-thumb">
                    <img src="https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?auto=format&fit=crop&w=100&q=80" alt="商品" className="my-img" />
                  </div>
                  <div className="my-item-info">
                    <div className="my-item-name">コットンショーツ 2日着用</div>
                    <div className="my-item-meta">
                      <span>👁 124</span><span>♡ 18</span><span>📦 パンティ</span>
                      <span className="item-pub-toggle"><span className="pub-dot"></span>公開中</span>
                    </div>
                  </div>
                  <div className="my-item-price">¥1,800</div>
                  <div className="my-item-actions">
                    <button className="ia-btn">編集</button>
                    <button className="ia-btn danger">削除</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SALES */}
          {activeTab === 'sales' && (
            <div className="panel show">
              <div className="sales-summary">
                <div className="ss-card"><div className="ss-label">今月の売上</div><div className="ss-num">¥38,400</div></div>
                <div className="ss-card"><div className="ss-label">累計売上</div><div className="ss-num">¥284,700</div></div>
                <div className="ss-card"><div className="ss-label">振込申請可能額</div><div className="ss-num">¥61,200</div></div>
              </div>
              <div className="payout-card" style={{ marginTop: '16px' }}>
                <div className="payout-header"><div className="payout-title"><span className="icon-pill">🏦</span> 振込申請</div></div>
                <div className="balance-big">¥61,200</div>
                <button className="btn-payout">🏦 振込申請する</button>
              </div>
            </div>
          )}

          {/* TWEET */}
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
              <div style={{ marginTop: '20px' }}>
                {tweetList.map((t, idx) => (
                  <div key={idx} className="tweet-log-item" style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-sub)' }}>{t}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MESSAGES */}
          {activeTab === 'messages' && (
            <div className="panel show">
              <div className="msg-list">
                <div className="msg-item unread">
                  <div className="msg-avatar">K</div>
                  <div className="msg-info">
                    <div className="msg-name">K***さん</div>
                    <div className="msg-preview">着用日数を3日に変更できますか？</div>
                  </div>
                  <div className="msg-time">14:22</div>
                </div>
              </div>
            </div>
          )}

          {/* SETTINGS */}
          {activeTab === 'settings' && (
            <div className="panel show">
              <div className="settings-section">
                <div className="settings-title"><span className="icon-pill">👤</span> アカウント情報</div>
                <div className="setting-row"><div className="setting-info"><div className="setting-name">ニックネーム</div></div><div className="setting-val">めい</div><button className="setting-btn">変更</button></div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* FOOTER */}
      <footer className="mypage-footer">
        <div className="footer-inner">
          <div className="footer-logo">♡ LABEL NAME</div>
          <div className="footer-copy">© 2026 LABEL NAME.</div>
        </div>
      </footer>
    </>
  );
}