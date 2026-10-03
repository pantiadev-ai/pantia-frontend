'use client';

import React, { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import './item_form.css';

const CATEGORY_MAP: Record<string, string> = {
  panty: '🩲 パンティ',
  bra: '👙 ブラジャー',
  set: '💞 B&Pセット',
  fluid: '🧴 体液系',
  clothes: '👗 衣類系',
  other: '✨ その他',
};

export default function CreateItemPage() {
  const supabase = createClient();

  // フォーム用ステート
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [days, setDays] = useState('');
  const [material, setMaterial] = useState('');
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState<string>('');
  
  // フラグ・トグルステート
  const [isInstant, setIsInstant] = useState(true);
  const [isAnon, setIsAnon] = useState(false);
  
  // オプション用ステート
  const [freeOpts, setFreeOpts] = useState<string[]>(['📸 着用写真', '💌 手紙同封']);
  const [paidOpts, setPaidOpts] = useState<string[]>([]);

  // 画像アップロード用ステート
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // 画像選択処理
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const removeImg = (e: React.MouseEvent) => {
    e.stopPropagation();
    setImageFile(null);
    setImagePreview(null);
  };

  // オプション選択切替
  const toggleFreeOpt = (opt: string) => {
    setFreeOpts((prev) =>
      prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]
    );
  };

  const togglePaidOpt = (opt: string) => {
    setPaidOpts((prev) =>
      prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]
    );
  };

  // 計算
  const numPrice = parseInt(price, 10) || 0;
  const fee = Math.round(numPrice * 0.15);
  const net = numPrice - fee;

  // 出品処理（Supabase連携）
  const handleSubmit = async () => {
    if (!title || !category || !numPrice) {
      alert('必須項目（タイトル・カテゴリ・価格）を入力してください');
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        alert('出品するにはログインが必要です');
        window.location.href = '/auth';
        return;
      }

      let uploadedImageUrl = '';

      // 画像アップロード
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;

        const { error: storageError } = await supabase.storage
          .from('item-images')
          .upload(fileName, imageFile);

        if (storageError) {
          alert(`画像のアップロードに失敗しました: ${storageError.message}`);
          setIsSubmitting(false);
          return;
        }

        const { data: publicUrlData } = supabase.storage
          .from('item-images')
          .getPublicUrl(fileName);

        uploadedImageUrl = publicUrlData.publicUrl;
      }

      // データベース保存
      const { error } = await supabase.from('items').insert([
        {
          user_id: user.id,
          title,
          price: numPrice,
          category: CATEGORY_MAP[category] || category,
          shipping_badge: isInstant ? '即日発送' : '通常発送',
          description,
          image_url: uploadedImageUrl,
        },
      ]);

      if (error) {
        alert(`出品エラー: ${error.message}`);
        setIsSubmitting(false);
        return;
      }

      setShowModal(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'エラーが発生しました';
      alert(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* HEADER */}
      <header className="form-header">
        <a href="/" className="logo">♡ LABEL NAME</a>
        <nav>
          <a href="/mypage">マイページ</a>
          <a href="/mypage">出品管理</a>
          <div className="nav-divider"></div>
          <a href="/auth" className="nav-login">ログイン</a>
        </nav>
      </header>

      {/* BREADCRUMB */}
      <div className="breadcrumb">
        <a href="#">トップ</a>
        <span className="bc-sep">›</span>
        <a href="/mypage">マイページ</a>
        <span className="bc-sep">›</span>
        <span>商品を出品する</span>
      </div>

      {/* STEP BAR */}
      <div className="step-bar">
        <div className="steps">
          <div className="step active"><div className="step-circle">1</div> 商品情報</div>
          <div className="step-line"></div>
          <div className="step"><div className="step-circle">2</div> オプション設定</div>
          <div className="step-line"></div>
          <div className="step"><div className="step-circle">3</div> 確認・出品</div>
        </div>
      </div>

      {/* LAYOUT */}
      <main className="layout">
        {/* LEFT FORM */}
        <div className="form-section fade-in visible">
          {/* 1. 写真アップロード */}
          <div className="form-card">
            <div className="form-card-title"><span className="icon-pill">📸</span> 商品写真</div>

            <div className="img-upload-area">
              <label className={`img-slot main-slot ${imagePreview ? 'filled' : ''}`}>
                <div className="img-main-badge">メイン</div>
                {imagePreview ? (
                  <>
                    <img src={imagePreview} alt="Preview" className="uploaded-img" />
                    <div className="img-remove" onClick={removeImg}>✕</div>
                  </>
                ) : (
                  <>
                    <div className="img-slot-icon">📷</div>
                    <div>追加</div>
                  </>
                )}
                <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
              </label>

              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="img-slot" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                  <div className="img-slot-icon">＋</div>
                  <div>追加</div>
                </div>
              ))}
            </div>
            <div className="img-note">
              ⚠️ 顔・個人情報が映り込まないようご注意ください。写真のEXIF情報（位置情報）は自動で削除されます。
            </div>
          </div>

          {/* 2. 基本情報 */}
          <div className="form-card">
            <div className="form-card-title"><span className="icon-pill">📝</span> 基本情報</div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">商品タイトル <span className="req">必須</span></label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="例：コットンショーツ 2日着用 着用写真付き"
                  maxLength={40}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <div className="char-count">{title.length}/40</div>
              </div>
            </div>

            <div className="form-row cols2">
              <div className="form-group">
                <label className="form-label">カテゴリ <span className="req">必須</span></label>
                <select className="form-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">選択してください</option>
                  <option value="panty">🩲 パンティ</option>
                  <option value="bra">👙 ブラジャー</option>
                  <option value="set">💞 B&Pセット</option>
                  <option value="fluid">🧴 体液系</option>
                  <option value="clothes">👗 衣類系</option>
                  <option value="other">✨ その他</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">着用日数 <span className="req">必須</span></label>
                <select className="form-select" value={days} onChange={(e) => setDays(e.target.value)}>
                  <option value="">選択してください</option>
                  <option value="1">1日</option>
                  <option value="2">2日</option>
                  <option value="3">3日</option>
                  <option value="4">4日</option>
                  <option value="5">5日</option>
                  <option value="6">6日</option>
                </select>
              </div>
            </div>

            <div className="form-row cols3">
              <div className="form-group">
                <label className="form-label">素材</label>
                <select className="form-select" value={material} onChange={(e) => setMaterial(e.target.value)}>
                  <option value="">未選択</option>
                  <option>コットン</option>
                  <option>レース</option>
                  <option>シルク</option>
                  <option>ナイロン</option>
                  <option>その他</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">カラー</label>
                <select className="form-select" value={color} onChange={(e) => setColor(e.target.value)}>
                  <option value="">未選択</option>
                  <option>ホワイト</option>
                  <option>ブラック</option>
                  <option>ピンク</option>
                  <option>ベージュ</option>
                  <option>ブルー</option>
                  <option>その他</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">サイズ</label>
                <select className="form-select" value={size} onChange={(e) => setSize(e.target.value)}>
                  <option value="">未選択</option>
                  <option>S</option>
                  <option>M</option>
                  <option>L</option>
                  <option>LL</option>
                  <option>フリー</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">商品説明 <span className="req">必須</span></label>
                <textarea
                  className="form-textarea"
                  placeholder="商品の詳細、着用シーン、状態などを記入してください🌸"
                  maxLength={500}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <div className="char-count">{description.length}/500</div>
              </div>
            </div>
          </div>

          {/* 3. 価格設定 */}
          <div className="form-card">
            <div className="form-card-title"><span className="icon-pill">💰</span> 価格設定</div>

            <div className="form-row cols2">
              <div className="form-group">
                <label className="form-label">販売価格（円） <span className="req">必須</span></label>
                <input
                  className="form-input"
                  type="number"
                  placeholder="例：1800"
                  min="500"
                  step="100"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
                <div className="form-hint">最低価格：¥500</div>
              </div>
              <div className="form-group">
                <label className="form-label">在庫数</label>
                <select className="form-select">
                  <option>1点のみ</option>
                  <option>複数対応可</option>
                </select>
                <div className="form-hint">使用済み品は基本1点のみ推奨</div>
              </div>
            </div>

            <div className="price-preview">
              <div className="pp-row"><span>販売価格</span><span>{numPrice ? `¥${numPrice.toLocaleString()}` : '¥ ---'}</span></div>
              <div className="pp-row"><span>手数料（15%）</span><span style={{ color: 'var(--err)' }}>{numPrice ? `- ¥${fee.toLocaleString()}` : '- ¥ ---'}</span></div>
              <hr className="pp-divider" />
              <div className="pp-row"><span style={{ fontWeight: 600 }}>あなたの受け取り額</span><span className="pp-total">{numPrice ? `¥${net.toLocaleString()}` : '¥ ---'}</span></div>
            </div>
          </div>

          {/* 4. オプション設定 */}
          <div className="form-card">
            <div className="form-card-title"><span className="icon-pill">✅</span> 対応オプション</div>

            <div className="form-row" style={{ marginBottom: '16px' }}>
              <div className="form-group">
                <label className="form-label">無料オプション <span className="opt-tag-label">複数選択可</span></label>
                <div className="option-chips">
                  {['📸 着用写真', '💌 手紙同封', '📦 匿名配送', '🧴 ジップロック梱包', '✉️ メッセージカード'].map((opt) => (
                    <div
                      key={opt}
                      className={`opt-chip ${freeOpts.includes(opt) ? 'selected' : ''}`}
                      onClick={() => toggleFreeOpt(opt)}
                    >
                      {opt}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">有料オプション <span className="opt-tag-label">任意</span></label>
                <div className="option-chips">
                  {['🎬 着用動画（+¥800）', '📅 着用日数延長（+¥500/日）', '🔒 リクエスト専用'].map((opt) => (
                    <div
                      key={opt}
                      className={`opt-chip ${paidOpts.includes(opt) ? 'selected' : ''}`}
                      onClick={() => togglePaidOpt(opt)}
                    >
                      {opt}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 5. 発送・配送 */}
          <div className="form-card">
            <div className="form-card-title"><span className="icon-pill">🚚</span> 発送・配送設定</div>

            <div className="toggle-row">
              <div className="toggle-info">
                <div className="toggle-name">⚡ 即日発送対応</div>
                <div className="toggle-desc">購入後24時間以内に発送できる場合はON</div>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" checked={isInstant} onChange={(e) => setIsInstant(e.target.checked)} />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="toggle-row">
              <div className="toggle-info">
                <div className="toggle-name">📦 匿名配送対応</div>
                <div className="toggle-desc">住所を秘匿して発送（別途送料+¥300）</div>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" checked={isAnon} onChange={(e) => setIsAnon(e.target.checked)} />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>
        </div>

        {/* RIGHT SIDEBAR PREVIEW */}
        <aside className="sidebar fade-in visible" style={{ transitionDelay: '0.1s' }}>
          <div className="preview-card">
            <div className="preview-thumb">
              {imagePreview ? (
                <img src={imagePreview} alt="プレビュー" className="preview-img" />
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>📷 写真未選択</div>
              )}
            </div>
            <div className="preview-info">
              <div className="preview-tag">{CATEGORY_MAP[category] || 'カテゴリ未選択'}</div>
              <div className="preview-title">{title || '商品タイトルがここに表示されます'}</div>
              <div className="preview-seller">
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green2)' }}></div>
                マイページ連携中
              </div>
              <div className="preview-price">{numPrice ? `¥${numPrice.toLocaleString()}` : '¥ ---'}</div>
              <div className="preview-badges">
                {isInstant && <span className="preview-badge">即日</span>}
                <span className="preview-badge">写真付</span>
              </div>
            </div>
          </div>

          <div className="action-card">
            <button className="btn-publish" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? '処理中...' : '🎀 出品する'}
            </button>
          </div>

          <div className="tips-card">
            <div className="tips-title">💡 売れやすくするコツ</div>
            <div className="tip-item"><span className="tip-icon">📸</span><span>明るい場所で複数枚撮影すると購入率UP</span></div>
            <div className="tip-item"><span className="tip-icon">⚡</span><span>即日発送対応にすると上位表示</span></div>
            <div className="tip-item"><span className="tip-icon">💰</span><span>価格は¥1,500〜¥3,000が一番人気</span></div>
          </div>
        </aside>
      </main>

      {/* SUCCESS MODAL */}
      <div className={`modal-overlay ${showModal ? 'show' : ''}`}>
        <div className="modal">
          <div className="modal-icon">🎀</div>
          <div className="modal-title">出品完了！</div>
          <div className="modal-sub">
            商品が出品されました🌸<br />
            マイページから確認できます！
          </div>
          <button className="modal-btn" onClick={() => window.location.href = '/mypage'}>マイページへ戻る →</button>
        </div>
      </div>
    </>
  );
}