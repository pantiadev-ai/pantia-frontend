'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import './seller_profile.css';

export default function SellerProfilePage() {
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<'intro' | 'items' | 'tweets' | 'reviews'>('intro');
  const [isFollowing, setIsFollowing] = useState(false);
  const [hearts, setHearts] = useState<Record<number, boolean>>({});

  // ユーザー情報のステート
  const [userInfo, setUserInfo] = useState<{
    nickname: string;
    role: string;
    age: string;
    email: string;
  }>({
    nickname: 'めい', // デフォルト値
    role: 'seller',
    age: '19',
    email: '',
  });

  // ログイン中のユーザー情報を Supabase から取得
  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && user.user_metadata) {
        setUserInfo({
          nickname: user.user_metadata.nickname || 'ユーザー',
          role: user.user_metadata.role || 'seller',
          age: user.user_metadata.age || '-',
          email: user.email || '',
        });
      }
    };
    fetchUser();
  }, []);

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
          <a href="/auth" className="nav-login">ログイン</a>
        </nav>
      </header>

      {/* BREADCRUMB */}
      <div className="breadcrumb">
        <a href="#">トップ</a>
        <span className="bc-sep">›</span>
        <a href="#">出品者一覧</a>
        <span className="bc-sep">›</span>
        <span>{userInfo.nickname}</span>
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
              <div className="profile-avatar">{userInfo.nickname.slice(0, 1)}</div>
              <div className="online-badge"></div>
            </div>
            <div className="profile-name">{userInfo.nickname}</div>
            <div className="profile-handle">@{userInfo.nickname.toLowerCase()}</div>
            <div className="profile-tags">
              <span className="ptag online">🟢 オンライン</span>
              {userInfo.age !== '-' && <span className="ptag age">{userInfo.age}歳</span>}
              <span className="ptag">{userInfo.role === 'seller' ? '出品者' : '購入者'}</span>
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
                <div className="pstat-num">0</div>
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
            <div className="info-row"><span className="info-label">年齢</span><span className="info-val">{userInfo.age}歳</span></div>
            <div className="info-row"><span className="info-label">会員種別</span><span className="info-val">{userInfo.role === 'seller' ? '出品者' : '購入者'}</span></div>
            <div className="info-row"><span className="info-label">最終ログイン</span><span className="info-val green">🟢 たった今</span></div>
            <div className="info-row"><span className="info-label">配送方法</span><span className="info-val">匿名配送対応</span></div>
          </div>
        </aside>

        {/* RIGHT MAIN */}
        <div className="main-content">
          <div className="tabs">
            <div className={`tab ${activeTab === 'intro' ? 'active' : ''}`} onClick={() => setActiveTab('intro')}>自己紹介</div>
            <div className={`tab ${activeTab === 'items' ? 'active' : ''}`} onClick={() => setActiveTab('items')}>出品中 (0)</div>
            <div className={`tab ${activeTab === 'tweets' ? 'active' : ''}`} onClick={() => setActiveTab('tweets')}>つぶやき (0)</div>
          </div>

          {activeTab === 'intro' && (
            <div className="intro-card">
              <div className="sec-label"><span className="icon-pill">👋</span> 自己紹介</div>
              <div className="intro-text">
                はじめまして、{userInfo.nickname}です🌸<br/><br/>
                よろしくお願いします！
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