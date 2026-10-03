'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import './item_detail.css';

interface ItemDetail {
  id: string;
  user_id: string;
  seller_id?: string;
  title: string;
  price: number;
  category: string;
  shipping_badge?: string;
  description?: string;
  image_url?: string;
  image_urls?: string[];
  created_at: string;
}

export default function ItemDetailPage() {
  const params = useParams();
  const itemId = params.id as string;
  const supabase = createClient();

  const [item, setItem] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState<string>('');
  const [isLiked, setIsLiked] = useState(false);

  // オプション計算用ステート
  const [extraDaysPrice, setExtraDaysPrice] = useState(0);
  const [selectedAdds, setSelectedAdds] = useState<string[]>([]);
  const [cartAdded, setCartAdded] = useState(false);

  useEffect(() => {
    const fetchItem = async () => {
      if (!itemId) return;

      const { data, error } = await supabase
        .from('items')
        .select('*')
        .eq('id', itemId)
        .single();

      if (error) {
        console.error('Error fetching item:', error.message);
      } else if (data) {
        setItem(data as ItemDetail);
        // メイン画像の設定（image_urls の先頭、または image_url）
        const primaryImg = (data.image_urls && data.image_urls.length > 0)
          ? data.image_urls[0]
          : (data.image_url || '');
        setActiveImage(primaryImg);
      }
      setLoading(false);
    };

    fetchItem();
  }, [itemId]);

  // オプション加算計算
  const calcTotalAdds = () => {
    let sum = 0;
    if (selectedAdds.includes('anon')) sum += 300;
    if (selectedAdds.includes('video')) sum += 800;
    return sum;
  };

  const basePrice = item?.price || 0;
  const totalPrice = basePrice + extraDaysPrice + calcTotalAdds();

  const toggleAddOption = (optKey: string) => {
    setSelectedAdds((prev) =>
      prev.includes(optKey) ? prev.filter((k) => k !== optKey) : [...prev, optKey]
    );
  };

  const handleCart = () => {
    setCartAdded(true);
    setTimeout(() => setCartAdded(false), 2000);
  };

  const handleBuy = () => {
    alert(`¥${totalPrice.toLocaleString()} の購入手続きへ進みます🌸`);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontWeight: 700 }}>
        商品情報を読み込み中...🌸
      </div>
    );
  }

  if (!item) {
    return (
      <div style={{ padding: '80px 20px', textAlign: 'center' }}>
        <h2>商品が見つかりませんでした</h2>
        <a href="/" style={{ color: 'var(--primary)', marginTop: '16px', display: 'inline-block' }}>トップページへ戻る</a>
      </div>
    );
  }

  // 画像一覧（配列がない場合は単体画像を使用）
  const images = (item.image_urls && item.image_urls.length > 0)
    ? item.image_urls
    : (item.image_url ? [item.image_url] : []);

  return (
    <>
      {/* HEADER */}
      <header className="detail-header">
        <a href="/" className="logo">♡ LABEL NAME</a>
        <div className="header-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          商品・出品者を検索
        </div>
        <nav>
          <a href="#">商品一覧</a>
          <a href="#">つぶやき</a>
          <div className="nav-divider"></div>
          <a href="/mypage" className="nav-login">マイページ</a>
        </nav>
      </header>

      {/* BREADCRUMB */}
      <div className="breadcrumb">
        <a href="/">トップ</a>
        <span className="bc-sep">›</span>
        <a href="#">{item.category || 'カテゴリ'}</a>
        <span className="bc-sep">›</span>
        <span>{item.title}</span>
      </div>

      {/* MAIN */}
      <main className="main fade-in visible">
        {/* LEFT: GALLERY & SELLER & DETAILS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="gallery">
            <div className="main-img">
              {activeImage ? (
                <img src={activeImage} alt={item.title} className="gallery-main-img" />
              ) : (
                <div style={{ color: 'var(--text-muted)' }}>📷 画像なし</div>
              )}
              <div className="img-badge">{item.category}</div>
              <div
                className="img-heart"
                style={{ color: isLiked ? '#FF4B91' : '', borderColor: isLiked ? '#FF4B91' : '' }}
                onClick={() => setIsLiked(!isLiked)}
              >
                {isLiked ? '♥' : '♡'}
              </div>
            </div>

            {/* サムネイル一覧 */}
            {images.length > 1 && (
              <div className="thumbs">
                {images.map((img, idx) => (
                  <div
                    key={idx}
                    className={`thumb ${activeImage === img ? 'active' : ''}`}
                    onClick={() => setActiveImage(img)}
                  >
                    <img src={img} alt={`Thumb ${idx + 1}`} className="thumb-img" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 出品者ミニカード */}
          <a href="/mypage" className="seller-mini">
            <div className="sm-avatar">
              め
              <div className="sm-online"></div>
            </div>
            <div className="sm-info">
              <div className="sm-name">出品者ユーザー</div>
              <div className="sm-meta">
                <span className="sm-stat">⭐ 5.0</span>
                <span className="sm-stat">🟢 オンライン</span>
              </div>
            </div>
            <div className="sm-arrow">›</div>
          </a>

          {/* 商品スペック情報 */}
          <div className="detail-card">
            <div className="detail-card-title"><span className="icon-pill">📋</span> 商品情報</div>
            <div className="detail-row"><span className="dl">カテゴリ</span><span className="dv">{item.category}</span></div>
            <div className="detail-row"><span className="dl">発送バッジ</span><span className="dv pk">{item.shipping_badge || '通常発送'}</span></div>
            <div className="detail-row"><span className="dl">出品日</span><span className="dv">{new Date(item.created_at).toLocaleDateString('ja-JP')}</span></div>
          </div>

          {/* 商品説明 */}
          <div className="detail-card">
            <div className="detail-card-title"><span className="icon-pill">📝</span> 商品説明</div>
            <div className="desc-text" style={{ whiteSpace: 'pre-wrap' }}>
              {item.description || '商品説明はありません。'}
            </div>
          </div>
        </div>

        {/* RIGHT: PURCHASE AREA */}
        <div className="detail">
          <div><div className="item-category">{item.category}</div></div>
          <div><div className="item-title">{item.title}</div></div>

          <div className="item-price-row">
            <div className="item-price">¥{basePrice.toLocaleString()}</div>
            <div className="item-price-tax">税込</div>
          </div>

          <div className="badges-row">
            <span className="badge badge-green">⚡ {item.shipping_badge || '通常発送'}</span>
            <span className="badge badge-pk">📸 写真付き</span>
            <span className="badge badge-lilac">📦 匿名配送可</span>
          </div>

          {/* オプション選択 */}
          <div className="options-card">
            <div className="opt-title">オプションを選択</div>

            <div className="opt-group">
              <div className="opt-label">着用日数 <span className="opt-required">必須</span></div>
              <div className="opt-chips">
                <div className={`opt-chip ${extraDaysPrice === 0 ? 'selected' : ''}`} onClick={() => setExtraDaysPrice(0)}>2日 (標準)</div>
                <div className={`opt-chip ${extraDaysPrice === 500 ? 'selected' : ''}`} onClick={() => setExtraDaysPrice(500)}>3日 (+¥500)</div>
                <div className={`opt-chip ${extraDaysPrice === 1000 ? 'selected' : ''}`} onClick={() => setExtraDaysPrice(1000)}>5日 (+¥1,000)</div>
              </div>
            </div>

            <div className="opt-group">
              <div className="opt-label">追加オプション <span className="opt-optional">任意・複数可</span></div>
              <div className="opt-chips">
                <div className={`opt-chip ${selectedAdds.includes('photo') ? 'selected' : ''}`} onClick={() => toggleAddOption('photo')}>📸 着用写真 (無料)</div>
                <div className={`opt-chip ${selectedAdds.includes('letter') ? 'selected' : ''}`} onClick={() => toggleAddOption('letter')}>💌 手紙同封 (無料)</div>
                <div className={`opt-chip ${selectedAdds.includes('anon') ? 'selected' : ''}`} onClick={() => toggleAddOption('anon')}>📦 匿名配送 (+¥300)</div>
                <div className={`opt-chip ${selectedAdds.includes('video') ? 'selected' : ''}`} onClick={() => toggleAddOption('video')}>🎬 着用動画 (+¥800)</div>
              </div>
            </div>
          </div>

          {/* 購入カード */}
          <div className="purchase-card">
            <div className="purchase-total">
              <span className="pt-label">合計金額</span>
              <span className="pt-price">¥{totalPrice.toLocaleString()}</span>
            </div>
            <button className="btn-buy" onClick={handleBuy}>💳 今すぐ購入する</button>
            <button
              className="btn-cart"
              onClick={handleCart}
              style={{
                background: cartAdded ? 'var(--green)' : '',
                color: cartAdded ? 'var(--green2)' : '',
                borderColor: cartAdded ? 'rgba(16, 185, 129, 0.4)' : ''
              }}
            >
              {cartAdded ? '✓ カートに追加しました' : '🛍 カートに入れる'}
            </button>
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="detail-footer">
        <div className="footer-inner">
          <div className="footer-logo">♡ LABEL NAME</div>
          <div className="footer-copy">© 2026 LABEL NAME.</div>
        </div>
      </footer>
    </>
  );
}