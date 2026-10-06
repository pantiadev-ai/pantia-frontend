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

interface SellerProfile {
  nickname: string;
  bio?: string;
  profile_image_url?: string;
  profile_image_urls?: string[];
}

export default function MyPage() {
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState('items');
  const [tweetText, setTweetText] = useState('');
  const [tweetList, setTweetList] = useState<string[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const [sellerProfile, setSellerProfile] = useState<SellerProfile>({
    nickname: 'こはる',
    bio: 'プロフィールが未設定です。',
    profile_image_url: '',
    profile_image_urls: [],
  });

  const [userInfo, setUserInfo] = useState({
    id: '',
    email: '',
  });

  // プロフィール編集用ステート
  const [editNickname, setEditNickname] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editImageFiles, setEditImageFiles] = useState<(File | null)[]>([null, null, null, null, null]);
  const [editImagePreviews, setEditImagePreviews] = useState<(string | null)[]>([null, null, null, null, null]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
          window.location.href = '/auth';
          return;
        }

        setUserInfo({ id: user.id, email: user.email || '' });

        // sellers テーブルからプロフィールを取得
        const { data: profileData } = await supabase
          .from('sellers')
          .select('*')
          .eq('id', user.id)
          .single();

        if (profileData) {
          const profile = {
            nickname: profileData.nickname || user.user_metadata?.nickname || 'こはる',
            bio: profileData.bio || '自己紹介文が未設定です🌸',
            profile_image_url: profileData.profile_image_url || '',
            profile_image_urls: profileData.profile_image_urls || [],
          };
          setSellerProfile(profile);

          setEditNickname(profile.nickname);
          setEditBio(profile.bio);

          const initialPreviews: (string | null)[] = [null, null, null, null, null];
          if (profile.profile_image_urls && profile.profile_image_urls.length > 0) {
            profile.profile_image_urls.forEach((url: string, i: number) => {
              if (i < 5) initialPreviews[i] = url;
            });
          } else if (profile.profile_image_url) {
            initialPreviews[0] = profile.profile_image_url;
          }
          setEditImagePreviews(initialPreviews);
        } else {
          setSellerProfile((prev) => ({
            ...prev,
            nickname: user.user_metadata?.nickname || 'こはる',
          }));
        }

        // 出品商品を全取得
        const { data: itemData } = await supabase
          .from('items')
          .select('*')
          .or(`user_id.eq.${user.id},seller_id.eq.${user.id}`);

        if (itemData) {
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

  const handleEditImageChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const newFiles = [...editImageFiles];
      newFiles[index] = file;
      setEditImageFiles(newFiles);

      const newPreviews = [...editImagePreviews];
      newPreviews[index] = URL.createObjectURL(file);
      setEditImagePreviews(newPreviews);
    }
  };

  const handleSaveProfile = async () => {
    if (!userInfo.id) return;
    setIsSaving(true);

    try {
      const uploadedUrls: string[] = [];

      for (let i = 0; i < 5; i++) {
        const file = editImageFiles[i];
        if (file) {
          const fileExt = file.name.split('.').pop();
          const fileName = `${userInfo.id}/profile_${Date.now()}_${i}.${fileExt}`;

          const { error: uploadError } = await supabase.storage
            .from('profile-images')
            .upload(fileName, file);

          if (!uploadError) {
            const { data: pubData } = supabase.storage
              .from('profile-images')
              .getPublicUrl(fileName);
            uploadedUrls.push(pubData.publicUrl);
          }
        } else if (editImagePreviews[i] && editImagePreviews[i]?.startsWith('http')) {
          uploadedUrls.push(editImagePreviews[i]!);
        }
      }

      const { error: updateError } = await supabase
        .from('sellers')
        .upsert({
          id: userInfo.id,
          nickname: editNickname,
          bio: editBio,
          profile_image_url: uploadedUrls[0] || '',
          profile_image_urls: uploadedUrls,
        });

      if (updateError) {
        alert(`更新エラー: ${updateError.message}`);
        return;
      }

      setSellerProfile({
        nickname: editNickname,
        bio: editBio,
        profile_image_url: uploadedUrls[0] || '',
        profile_image_urls: uploadedUrls,
      });

      alert('プロフィールを更新しました！🌸');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '保存に失敗しました';
      alert(msg);
    } finally {
      setIsSaving(false);
    }
  };

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
            <div className="pm-avatar" style={{ overflow: 'hidden' }}>
              {sellerProfile.profile_image_url ? (
                <img src={sellerProfile.profile_image_url} alt={sellerProfile.nickname} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                sellerProfile.nickname.slice(0, 1)
              )}
              <div className="pm-online"></div>
            </div>
            <div className="pm-name">{sellerProfile.nickname}</div>
            <div className="pm-handle">@{sellerProfile.nickname.toLowerCase()}</div>

            {sellerProfile.profile_image_urls && sellerProfile.profile_image_urls.length > 1 && (
              <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', marginTop: '8px' }}>
                {sellerProfile.profile_image_urls.map((url, i) => (
                  <img key={i} src={url} alt={`sub_${i}`} style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #fff' }} />
                ))}
              </div>
            )}

            <div style={{ fontSize: '12px', color: 'var(--text-sub)', marginTop: '10px', textAlign: 'left', background: 'rgba(255,255,255,0.6)', padding: '10px', borderRadius: '12px', whiteSpace: 'pre-wrap' }}>
              {sellerProfile.bio}
            </div>

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
            <div className={`side-nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}><span className="side-nav-icon">⚙</span> 設定</div>
          </div>
        </aside>

        <div className="main fade-in visible">
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

          {activeTab === 'settings' && (
            <div className="panel show">
              <div className="settings-section">
                <div className="settings-title"><span className="icon-pill">✏️</span> プロフィール編集</div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-sub)' }}>ニックネーム</label>
                    <input
                      type="text"
                      value={editNickname}
                      onChange={(e) => setEditNickname(e.target.value)}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '999px', border: '1px solid rgba(255, 75, 145, 0.3)', marginTop: '4px', outline: 'none' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-sub)' }}>自己紹介文</label>
                    <textarea
                      value={editBio}
                      onChange={(e) => setEditBio(e.target.value)}
                      rows={4}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(255, 75, 145, 0.3)', marginTop: '4px', outline: 'none', resize: 'vertical' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-sub)' }}>プロフィール写真（最大5枚）</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', marginTop: '6px' }}>
                      {[0, 1, 2, 3, 4].map((idx) => (
                        <label
                          key={idx}
                          style={{
                            aspectRatio: '1/1',
                            border: '1.5px dashed var(--primary)',
                            borderRadius: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            overflow: 'hidden',
                            background: '#fff',
                          }}
                        >
                          {editImagePreviews[idx] ? (
                            <img src={editImagePreviews[idx]!} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <span style={{ fontSize: '14px', color: 'var(--primary)', fontWeight: 800 }}>＋</span>
                          )}
                          <input type="file" accept="image/*" onChange={(e) => handleEditImageChange(idx, e)} style={{ display: 'none' }} />
                        </label>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={handleSaveProfile}
                    disabled={isSaving}
                    style={{
                      padding: '12px',
                      borderRadius: '999px',
                      background: 'linear-gradient(135deg, var(--primary), #FF75A0)',
                      color: '#fff',
                      border: 'none',
                      fontWeight: 800,
                      cursor: 'pointer',
                      marginTop: '8px',
                      boxShadow: '0 4px 12px rgba(255, 75, 145, 0.3)',
                    }}
                  >
                    {isSaving ? '保存中...' : '🎀 プロフィール変更を保存'}
                  </button>
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