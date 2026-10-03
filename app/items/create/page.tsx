'use client';

import React, { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import './items_create.css';

export default function CreateItemPage() {
  const supabase = createClient();

  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('ショーツ・パンティ');
  const [shippingBadge, setShippingBadge] = useState('即日発送');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title || !price) {
      alert('商品名と価格は必須項目です');
      return;
    }

    setIsSubmitting(true);

    // ログインユーザーの取得
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      alert('出品するにはログインが必要です');
      window.location.href = '/auth';
      return;
    }

    // Supabase に商品データを保存
    const { data, error } = await supabase.from('items').insert([
      {
        user_id: user.id,
        title,
        price: parseInt(price, 10),
        category,
        shipping_badge: shippingBadge,
        description,
        image_url: 'https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?auto=format&fit=crop&w=400&q=80', // ダミー画像
      },
    ]);

    setIsSubmitting(false);

    if (error) {
      alert(`出品エラー: ${error.message}`);
      return;
    }

    alert('出品が完了しました！');
    window.location.href = '/mypage';
  };

  return (
    <>
      <header className="create-header">
        <a href="#" className="logo">♡ LABEL NAME</a>
        <div style={{ fontSize: '13px', color: 'var(--text-sub)' }}>商品出品</div>
      </header>

      <main className="page" style={{ maxWidth: '600px', margin: '40px auto', padding: '0 16px' }}>
        <div className="card" style={{ background: 'rgba(255,255,255,0.85)', padding: '32px', borderRadius: '24px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '20px', textAlign: 'center' }}>新規商品を出品</h1>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>商品名 *</label>
              <input
                type="text"
                className="form-input"
                placeholder="例: コットンショーツ 2日着用"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '999px', border: '1px solid #ccc' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>価格 (円) *</label>
              <input
                type="number"
                className="form-input"
                placeholder="例: 2000"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '999px', border: '1px solid #ccc' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>カテゴリ</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '999px', border: '1px solid #ccc' }}
              >
                <option>ショーツ・パンティ</option>
                <option>ブラ＆ショーツセット</option>
                <option>靴下・ソックス</option>
                <option>その他</option>
              </select>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>発送バッジ</label>
              <select
                value={shippingBadge}
                onChange={(e) => setShippingBadge(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '999px', border: '1px solid #ccc' }}
              >
                <option>即日発送</option>
                <option>翌日発送</option>
                <option>相談可</option>
                <option>写真付き</option>
              </select>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>商品説明</label>
              <textarea
                placeholder="商品の詳細や着用状況について記載してください"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ width: '100%', minHeight: '100px', padding: '12px', borderRadius: '12px', border: '1px solid #ccc' }}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '999px',
                background: 'linear-gradient(135deg, #FF4B91, #FF75A0)',
                color: '#fff',
                border: 'none',
                fontWeight: 800,
                fontSize: '15px',
                cursor: 'pointer',
              }}
            >
              {isSubmitting ? '出品処理中...' : '🎀 この内容で出品する'}
            </button>
          </form>
        </div>
      </main>
    </>
  );
}