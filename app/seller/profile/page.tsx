'use client';

import React, { useState } from 'react';
import './seller_profile.css';

export default function SellerProfilePage() {
  const [activeTab, setActiveTab] = useState<'intro' | 'items' | 'tweets' | 'reviews'>('intro');
  const [isFollowing, setIsFollowing] = useState(false);
  const [hearts, setHearts] = useState<Record<number, boolean>>({});

  const toggleHeart = (index: number) => {
    setHearts((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <>
      {/* HEADER */}
      <header className="seller-header">
        <a href="#" className="logo">♡ LABEL NAME</a>
        <div className="header-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          商品・出品者を検索
        </div>
        <nav>
          <a href="#">女の子</a>
          <a href="#">商品</a>
          <a href="#">つぶやき</a>
          <a href="#">ランキング</a>
          <div className="nav-divider"></div>
          <a href="#" className="nav-login">ログイン</a>
        </nav>
      </header>

      {/* BREADCRUMB */}
      <div className="breadcrumb">
        <a href="#">トップ</a>
        <span className="bc-sep">›</span>
        <a href="#">出品者一覧</a>
        <span className="bc-sep">›</span>
        <span>めい</span>
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
              <div className="profile-avatar">め</div>
              <div className="online-badge"></div>
            </div>
            <div className="profile-name">めい</div>
            <div className="profile-handle">@mei_chan</div>
            <div className="profile-tags">
              <span className="ptag online">🟢 オンライン</span>
              <span className="ptag age">19歳</span>
              <span className="ptag job">大学生</span>
              <span className="ptag">即日発送</span>
              <span className="ptag">写真付き</span>
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
                <div className="pstat-num">312</div>
                <div className="pstat-label">フォロワー</div>
              </div>
              <div className="pstat">
                <div className="pstat-num">48</div>
                <div className="pstat-label">販売数</div>
              </div>
              <div className="pstat">
                <div className="pstat-num">4.9</div>
                <div className="pstat-label">評価</div>
              </div>
            </div>
          </div>

          <div className="info-card">
            <div className="info-title">📋 基本情報</div>
            <div className="info-row"><span className="info-label">年齢</span><span className="info-val">19歳</span></div>
            <div className="info-row"><span className="info-label">職業</span><span className="info-val">大学生</span></div>
            <div className="info-row"><span className="info-label">身長</span><span className="info-val">158cm</span></div>
            <div className="info-row"><span className="info-label">体型</span><span className="info-val">スリム</span></div>
            <div className="info-row"><span className="info-label">登録日</span><span className="info-val">2024年11月</span></div>
            <div className="info-row"><span className="info-label">最終ログイン</span><span className="info-val green">🟢 たった今</span></div>
            <div className="info-row"><span className="info-label">発送目安</span><span className="info-val pk">即日〜翌日</span></div>
            <div className="info-row"><span className="info-label">配送方法</span><span className="info-val">匿名配送対応</span></div>
          </div>

          <div className="info-card">
            <div className="info-title">⭐ 評価・レビュー</div>
            <div className="review-score-row">
              <div className="big-score">4.9</div>
              <div>
                <div className="stars">
                  <span className="star full">★</span><span className="star full">★</span><span className="star full">★</span><span className="star full">★</span><span className="star full">★</span>
                </div>
                <div className="review-count">38件のレビュー</div>
              </div>
            </div>
            <div className="review-bars">
              <div className="rbar-row"><span class="rbar-label">5</span><div className="rbar-track"><div className="rbar-fill" style={{ width: '86%' }}></div></div><span className="rbar-count">33</span></div>
              <div className="rbar-row"><span class="rbar-label">4</span><div className="rbar-track"><div className="rbar-fill" style={{ width: '10%', background: 'var(--pk2)' }}></div></div><span className="rbar-count">4</span></div>
              <div className="rbar-row"><span class="rbar-label">3</span><div className="rbar-track"><div className="rbar-fill" style={{ width: '3%', background: 'var(--primary-light)' }}></div></div><span className="rbar-count">1</span></div>
              <div className="rbar-row"><span class="rbar-label">2</span><div className="rbar-track"></div><span className="rbar-count">0</span></div>
              <div className="rbar-row"><span class="rbar-label">1</span><div className="rbar-track"></div><span className="rbar-count">0</span></div>
            </div>
          </div>

          <div className="report-link"><a href="#">🚩 このユーザーを通報する</a></div>
        </aside>

        {/* RIGHT MAIN */}
        <div className="main-content">
          <div className="tabs">
            <div className={`tab ${activeTab === 'intro' ? 'active' : ''}`} onClick={() => setActiveTab('intro')}>自己紹介</div>
            <div className={`tab ${activeTab === 'items' ? 'active' : ''}`} onClick={() => setActiveTab('items')}>出品中 (12)</div>
            <div className={`tab ${activeTab === 'tweets' ? 'active' : ''}`} onClick={() => setActiveTab('tweets')}>つぶやき (24)</div>
            <div className={`tab ${activeTab === 'reviews' ? 'active' : ''}`} onClick={() => setActiveTab('reviews')}>レビュー (38)</div>
          </div>

          {activeTab === 'intro' && (
            <div className="intro-card">
              <div className="sec-label"><span className="icon-pill">👋</span> 自己紹介</div>
              <div className="intro-text">
                はじめまして、めいです🌸<br/><br/>
                都内の大学に通っています。バイト帰りや講義終わりのものが多めです。清潔感を大切にしていて、毎回丁寧に梱包してお送りします📦<br/><br/>
                写真は必ず撮って添付しますので安心してください。リクエストやオプション相談もお気軽にメッセージください💕<br/><br/>
                はじめての方も歓迎です！ぜひフォローしてみてください🎀
              </div>
              <div style={{ marginTop: '20px' }}>
                <div className="sec-label"><span className="icon-pill">✅</span> 対応オプション</div>
                <div className="intro-options">
                  <div className="opt-tag">📸 着用写真あり</div>
                  <div className="opt-tag">📅 着用日数指定</div>
                  <div className="opt-tag">⚡ 即日発送</div>
                  <div className="opt-tag">📦 匿名配送</div>
                  <div className="opt-tag">💌 手紙同封</div>
                  <div className="opt-tag">🔒 リクエスト相談可</div>
                  <div className="opt-tag">🧴 複数まとめ売り</div>
                </div>
              </div>
              <div style={{ marginTop: '20px' }}>
                <div className="sec-label"><span className="icon-pill">❌</span> NGオプション</div>
                <div className="intro-options">
                  <div className="opt-tag" style={{ background: 'var(--err-bg)', color: 'var(--err)', borderColor: 'rgba(239, 68, 68, 0.3)' }}>顔写真</div>
                  <div className="opt-tag" style={{ background: 'var(--err-bg)', color: 'var(--err)', borderColor: 'rgba(239, 68, 68, 0.3)' }}>7日以上の着用</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'items' && (
            <div>
              <div className="items-grid">
                {[
                  { title: 'コットンショーツ 2日着用', price: '¥1,800', tag: 'パンティ', badge: '即日', img: 'https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?auto=format&fit=crop&w=400&q=80' },
                  { title: 'レースショーツ 1日着用', price: '¥2,000', tag: 'パンティ', badge: '即日', img: 'https://images.unsplash.com/photo-1617396900799-f4ec2b43c7ae?auto=format&fit=crop&w=400&q=80' },
                  { title: '黒のブラ&ショーツセット', price: '¥3,200', tag: 'B&Pセット', badge: '相談可', img: 'https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?auto=format&fit=crop&w=400&q=80' },
                  { title: 'ピンクのTバック 着用写真付', price: '¥2,200', tag: 'パンティ', badge: '写真付', img: 'https://images.unsplash.com/photo-1516575334481-f85287c2c82d?auto=format&fit=crop&w=400&q=80' },
                ].map((item, idx) => (
                  <div className="item-card" key={idx}>
                    <div className="item-thumb">
                      <img src={item.img} alt={item.title} className="item-img" />
                      <div className="item-tag">{item.tag}</div>
                      <div
                        className="item-heart"
                        style={{
                          color: hearts[idx] ? '#FF4B91' : '',
                          borderColor: hearts[idx] ? '#FF4B91' : '',
                        }}
                        onClick={() => toggleHeart(idx)}
                      >
                        {hearts[idx] ? '♥' : '♡'}
                      </div>
                    </div>
                    <div className="item-info">
                      <div className="item-name">{item.title}</div>
                      <div className="item-footer">
                        <div className="item-price">{item.price}</div>
                        <div className="item-badge">{item.badge}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="pagination" style={{ marginTop: '16px' }}>
                <div className="page-btn active">1</div>
                <div className="page-btn">2</div>
                <div className="page-btn">›</div>
              </div>
            </div>
          )}

          {activeTab === 'tweets' && (
            <div className="tweet-list">
              <div className="tweet-item">
                <div className="tweet-item-header">
                  <div className="tweet-item-name">めい <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 500 }}>大学生 19歳</span></div>
                  <div className="tweet-item-time">2分前</div>
                </div>
                <div className="tweet-item-body">今日パンツ新しく出品しました♡ 講義終わりにすぐ撮影したのでフレッシュです🌸 プロフィールから見てみてね！</div>
                <div className="tweet-item-footer">
                  <div className="ti-action">♡ 28</div>
                  <div className="ti-action">💬 7</div>
                  <div className="ti-action">🔗 シェア</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'reviews' && (
            <div className="review-list">
              <div className="review-item">
                <div className="review-header">
                  <div className="reviewer">
                    <div className="reviewer-icon">K</div>
                    <div>
                      <div className="reviewer-name">K***さん</div>
                      <div className="reviewer-date">2026年8月28日</div>
                    </div>
                  </div>
                  <div className="review-stars">
                    <span className="star full">★</span><span className="star full">★</span><span className="star full">★</span><span className="star full">★</span><span className="star full">★</span>
                  </div>
                </div>
                <div className="review-body">梱包がとても丁寧でびっくりしました。写真も複数枚送ってくれて大満足です。発送も翌日で早かったです。またリピートします！</div>
                <div className="review-item-name">🩲 コットンショーツ 2日着用</div>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="seller-footer">
        <div className="footer-inner">
          <div className="footer-logo">♡ LABEL NAME</div>
          <div className="footer-links">
            <a href="#">利用規約</a>
            <a href="#">プライバシーポリシー</a>
            <a href="#">特定商取引法</a>
            <a href="#">お問い合わせ</a>
          </div>
          <div className="footer-copy">© 2026 LABEL NAME.</div>
        </div>
      </footer>
    </>
  );
}