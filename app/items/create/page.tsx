'use client';

import React, { useState, ChangeEvent, FormEvent } from 'react';
import './item_form.css';

export default function CreateItemPage() {
  // フォームステート
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [days, setDays] = useState('');
  const [material, setMaterial] = useState('');
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState<number | ''>('');
  const [stock, setStock] = useState('1点のみ');
  const [shippingTime, setShippingTime] = useState('即日〜翌日');
  const [ngNote, setNgNote] = useState('');

  // トグルスイッチ
  const [toggleInstant, setToggleInstant] = useState(true);
  const [toggleAnon, setToggleAnon] = useState(false);
  const [toggleMsg, setToggleMsg] = useState(true);
  const [toggleFollower, setToggleFollower] = useState(false);

  // オプション選択ステート
  const [selectedFreeOpts, setSelectedFreeOpts] = useState<string[]>([
    '📸 着用写真',
    '💌 手紙同封',
  ]);
  const [selectedPaidOpts, setSelectedPaidOpts] = useState<string[]>([]);

  // モーダル
  const [showModal, setShowModal] = useState(false);
  const [draftStatus, setDraftStatus] = useState('💾 下書き保存');

  // 無料オプションの切り替え
  const toggleFreeOpt = (opt: string) => {
    setSelectedFreeOpts((prev) =>
      prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]
    );
  };

  // 有料オプションの切り替え
  const togglePaidOpt = (opt: string) => {
    setSelectedPaidOpts((prev) =>
      prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]
    );
  };

  // カテゴリ表示ラベルマッピング
  const CATEGORY_LABELS: Record<string, string> = {
    panty: '🩲 パンティ',
    bra: '👙 ブラジャー',
    set: '💞 B&Pセット',
    fluid: '🧴 体液系',
    clothes: '👗 衣類系',
    other: '✨ その他',
  };

  // 手数料・受取額計算
  const priceNum = typeof price === 'number' ? price : 0;
  const fee = priceNum > 0 ? Math.round(priceNum * 0.15) : 0;
  const net = priceNum > 0 ? priceNum - fee : 0;

  // 出品処理
  const handlePublish = (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!title || !category || !price) {
      alert('必須項目（タイトル・カテゴリ・価格）を入力してください');
      return;
    }
    setShowModal(true);
  };

  // 下書き保存処理
  const handleDraft = () => {
    setDraftStatus('✓ 下書き保存しました');
    setTimeout(() => {
      setDraftStatus('💾 下書き保存');
    }, 2200);
  };

  return (
    <>
      {/* HEADER */}
      <header className="form-header">
        <a href="#" className="logo">
          ♡ LABEL NAME
        </a>
        <nav>
          <a href="#">マイページ</a>
          <a href="#">出品管理</a>
          <div className="nav-divider"></div>
          <a href="#" className="nav-login">
            めい ▾
          </a>
        </nav>
      </header>

      {/* BREADCRUMB */}
      <div className="breadcrumb">
        <a href="#">トップ</a>
        <span className="bc-sep">›</span>
        <a href="#">マイページ</a>
        <span className="bc-sep">›</span>
        <span>商品を出品する</span>
      </div>

      {/* STEP BAR */}
      <div className="step-bar">
        <div className="steps">
          <div className="step active" id="s1">
            <div className="step-circle" id="sc1">
              1
            </div>{' '}
            商品情報
          </div>
          <div className="step-line" id="sl1"></div>
          <div className="step" id="s2">
            <div className="step-circle" id="sc2">
              2
            </div>{' '}
            オプション設定
          </div>
          <div className="step-line" id="sl2"></div>
          <div className="step" id="s3">
            <div className="step-circle" id="sc3">
              3
            </div>{' '}
            確認・出品
          </div>
        </div>
      </div>

      {/* LAYOUT */}
      <main className="layout">
        {/* LEFT: FORM */}
        <div className="form-section fade-in visible">
          {/* 1. 写真アップロード */}
          <div className="form-card">
            <div className="form-card-title">
              <span className="icon-pill">📸</span> 商品写真
            </div>

            <div className="img-upload-area">
              <div className="img-slot main-slot filled">
                <div className="img-main-badge">メイン</div>
                <img
                  src="https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?auto=format&fit=crop&w=200&q=80"
                  alt="プレビュー1"
                  className="uploaded-img"
                />
                <div className="img-remove">✕</div>
              </div>
              <div className="img-slot filled">
                <img
                  src="https://images.unsplash.com/photo-1516575334481-f85287c2c82d?auto=format&fit=crop&w=200&q=80"
                  alt="プレビュー2"
                  className="uploaded-img"
                />
                <div className="img-remove">✕</div>
              </div>
              <div className="img-slot filled">
                <img
                  src="https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=200&q=80"
                  alt="プレビュー3"
                  className="uploaded-img"
                />
                <div className="img-remove">✕</div>
              </div>
              <div className="img-slot">
                <div className="img-slot-icon">＋</div>
                <div>追加</div>
              </div>
              <div className="img-slot">
                <div className="img-slot-icon">＋</div>
                <div>追加</div>
              </div>
            </div>
            <div className="img-note">
              ⚠️
              顔・個人情報が映り込まないようご注意ください。写真のEXIF情報（位置情報）は自動で削除されます。最大5枚まで。
            </div>
          </div>

          {/* 2. 基本情報 */}
          <div className="form-card">
            <div className="form-card-title">
              <span className="icon-pill">📝</span> 基本情報
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">
                  商品タイトル <span className="req">必須</span>
                </label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="例：コットンショーツ 2日着用 着用写真付き"
                  maxLength={40}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <div className="char-count">
                  <span>{title.length}</span>/40
                </div>
              </div>
            </div>

            <div className="form-row cols2">
              <div className="form-group">
                <label className="form-label">
                  カテゴリ <span className="req">必須</span>
                </label>
                <select
                  className="form-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
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
                <label className="form-label">
                  着用日数 <span className="req">必須</span>
                </label>
                <select
                  className="form-select"
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                >
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
                <select
                  className="form-select"
                  value={material}
                  onChange={(e) => setMaterial(e.target.value)}
                >
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
                <select
                  className="form-select"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                >
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
                <select
                  className="form-select"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                >
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
                <label className="form-label">
                  商品説明 <span className="req">必須</span>
                </label>
                <textarea
                  className="form-textarea"
                  placeholder="商品の詳細、着用シーン、状態などを記入してください。購入者が安心して購入できるよう、丁寧に書きましょう🌸"
                  maxLength={500}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                ></textarea>
                <div className="char-count">
                  <span>{description.length}</span>/500
                </div>
              </div>
            </div>
          </div>

          {/* 3. 価格設定 */}
          <div className="form-card">
            <div className="form-card-title">
              <span className="icon-pill">💰</span> 価格設定
            </div>

            <div className="form-row cols2">
              <div className="form-group">
                <label className="form-label">
                  販売価格（円） <span className="req">必須</span>
                </label>
                <input
                  className="form-input"
                  type="number"
                  placeholder="例：1800"
                  min="500"
                  max="100000"
                  step="100"
                  value={price}
                  onChange={(e) =>
                    setPrice(e.target.value ? parseInt(e.target.value) : '')
                  }
                />
                <div className="form-hint">最低価格：¥500</div>
              </div>
              <div className="form-group">
                <label className="form-label">在庫数</label>
                <select
                  className="form-select"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                >
                  <option>1点のみ</option>
                  <option>複数対応可</option>
                </select>
                <div className="form-hint">使用済み品は基本1点のみ推奨</div>
              </div>
            </div>

            <div className="price-preview">
              <div className="pp-row">
                <span>販売価格</span>
                <span>{priceNum ? `¥ ${priceNum.toLocaleString()}` : '¥ ---'}</span>
              </div>
              <div className="pp-row">
                <span>手数料（15%）</span>
                <span style={{ color: 'var(--err)' }}>
                  {priceNum ? `- ¥ ${fee.toLocaleString()}` : '- ¥ ---'}
                </span>
              </div>
              <hr className="pp-divider" />
              <div className="pp-row">
                <span style={{ fontWeight: 600 }}>あなたの受け取り額</span>
                <span className="pp-total">
                  {priceNum ? `¥ ${net.toLocaleString()}` : '¥ ---'}
                </span>
              </div>
            </div>
          </div>

          {/* 4. オプション設定 */}
          <div className="form-card">
            <div className="form-card-title">
              <span className="icon-pill">✅</span> 対応オプション
            </div>

            <div className="form-row" style={{ marginBottom: '16px' }}>
              <div className="form-group">
                <label className="form-label">
                  無料オプション <span className="opt-tag-label">複数選択可</span>
                </label>
                <div className="option-chips">
                  {[
                    '📸 着用写真',
                    '💌 手紙同封',
                    '📦 匿名配送',
                    '🧴 ジップロック梱包',
                    '✉️️ メッセージカード',
                  ].map((opt) => (
                    <div
                      key={opt}
                      className={`opt-chip ${
                        selectedFreeOpts.includes(opt) ? 'selected' : ''
                      }`}
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
                <label className="form-label">
                  有料オプション <span className="opt-tag-label">任意</span>
                </label>
                <div className="option-chips">
                  {[
                    '🎬 着用動画（+¥800）',
                    '📅 着用日数延長（+¥500/日）',
                    '🔒 リクエスト専用',
                  ].map((opt) => (
                    <div
                      key={opt}
                      className={`opt-chip ${
                        selectedPaidOpts.includes(opt) ? 'selected' : ''
                      }`}
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
            <div className="form-card-title">
              <span className="icon-pill">🚚</span> 発送・配送設定
            </div>

            <div className="toggle-row">
              <div className="toggle-info">
                <div className="toggle-name">⚡ 即日発送対応</div>
                <div className="toggle-desc">
                  購入後24時間以内に発送できる場合はONにしてください
                </div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={toggleInstant}
                  onChange={(e) => setToggleInstant(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="toggle-row">
              <div className="toggle-info">
                <div className="toggle-name">📦 匿名配送対応</div>
                <div className="toggle-desc">
                  会社経由の転送便で住所を秘匿できます（別途送料+¥300）
                </div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={toggleAnon}
                  onChange={(e) => setToggleAnon(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="toggle-row">
              <div className="toggle-info">
                <div className="toggle-name">💬 購入前メッセージ可</div>
                <div className="toggle-desc">
                  購入前に購入者からメッセージを受け付けます
                </div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={toggleMsg}
                  onChange={(e) => setToggleMsg(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="toggle-row">
              <div className="toggle-info">
                <div className="toggle-name">🔒 フォロワー限定公開</div>
                <div className="toggle-desc">
                  フォロワーのみに商品を表示します
                </div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={toggleFollower}
                  onChange={(e) => setToggleFollower(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="form-row" style={{ marginTop: '16px' }}>
              <div className="form-group">
                <label className="form-label">発送目安</label>
                <select
                  className="form-select"
                  value={shippingTime}
                  onChange={(e) => setShippingTime(e.target.value)}
                >
                  <option>即日〜翌日</option>
                  <option>1〜2日</option>
                  <option>2〜3日</option>
                  <option>3〜5日</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">
                  NGオプション・注意事項 <span className="opt-tag-label">任意</span>
                </label>
                <textarea
                  className="form-textarea"
                  placeholder="例：顔写真はお断りしています。7日以上の着用はNG。"
                  style={{ minHeight: '70px' }}
                  value={ngNote}
                  onChange={(e) => setNgNote(e.target.value)}
                ></textarea>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: SIDEBAR */}
        <aside className="sidebar fade-in visible" style={{ transitionDelay: '0.1s' }}>
          {/* プレビュー */}
          <div className="preview-card">
            <div className="preview-thumb">
              <img
                src="https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?auto=format&fit=crop&w=400&q=80"
                alt="プレビュー"
                className="preview-img"
              />
            </div>
            <div className="preview-info">
              <div className="preview-tag">
                {category ? CATEGORY_LABELS[category] : 'カテゴリ未選択'}
              </div>
              <div className="preview-title">
                {title || '商品タイトルがここに表示されます'}
              </div>
              <div className="preview-seller">
                <div
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: 'var(--green2)',
                  }}
                ></div>
                めい
              </div>
              <div className="preview-price">
                {priceNum ? `¥ ${priceNum.toLocaleString()}` : '¥ ---'}
              </div>
              <div className="preview-badges">
                {toggleInstant && <span className="preview-badge">即日</span>}
                <span className="preview-badge">写真付</span>
              </div>
            </div>
          </div>

          {/* アクションボタン */}
          <div className="action-card">
            <button className="btn-publish" onClick={() => handlePublish()}>
              🎀 出品する
            </button>
            <button
              className="btn-draft"
              onClick={handleDraft}
              style={{
                background:
                  draftStatus.includes('✓') ? 'var(--green)' : undefined,
                color: draftStatus.includes('✓') ? 'var(--green2)' : undefined,
                borderColor: draftStatus.includes('✓')
                  ? 'rgba(16, 185, 129, 0.4)'
                  : undefined,
              }}
            >
              {draftStatus}
            </button>
            <button className="btn-preview">👁 プレビュー確認</button>
            <div className="action-note">
              出品後は商品一覧ページに即時反映されます。
              <br />
              内容はいつでも編集できます。
            </div>
          </div>

          {/* 出品のコツ */}
          <div className="tips-card">
            <div className="tips-title">💡 売れやすくするコツ</div>
            <div className="tip-item">
              <span className="tip-icon">📸</span>
              <span>写真は明るい場所で複数枚撮影すると購入率UP</span>
            </div>
            <div className="tip-item">
              <span className="tip-icon">📝</span>
              <span>着用シーンや状態を丁寧に書くと信頼感アップ</span>
            </div>
            <div className="tip-item">
              <span className="tip-icon">⚡</span>
              <span>即日発送対応にすると検索結果で上位表示</span>
            </div>
            <div className="tip-item">
              <span className="tip-icon">💬</span>
              <span>つぶやきで告知すると出品直後の閲覧数が増える</span>
            </div>
            <div className="tip-item">
              <span className="tip-icon">💰</span>
              <span>価格は¥1,500〜¥3,000が最も売れやすい帯域</span>
            </div>
          </div>
        </aside>
      </main>

      {/* SUCCESS MODAL */}
      <div className={`modal-overlay ${showModal ? 'show' : ''}`}>
        <div className="modal">
          <div className="modal-icon">🎀</div>
          <div className="modal-title">出品完了！</div>
          <div className="modal-sub">
            商品が出品されました🌸
            <br />
            つぶやきで告知して
            <br />
            もっと多くの人に見てもらいましょう！
          </div>
          <button className="modal-btn" onClick={() => setShowModal(false)}>
            商品ページを見る →
          </button>
        </div>
      </div>
    </>
  );
}