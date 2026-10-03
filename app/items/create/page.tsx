'use client';

import React, { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import './item_form.css';

export default function CreateItemPage() {
  const supabase = createClient();

  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('ショーツ・パンティ');
  const [shippingBadge, setShippingBadge] = useState('即日発送');
  const [description, setDescription] = useState('');
  
  // 画像用ステート
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ファイル選択ハンドラ
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title || !price) {
      alert('商品名と価格は必須項目です');
      return;
    }

    setIsSubmitting(true);

    try {
      // ログインユーザーの取得
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        alert('出品するにはログインが必要です');
        window.location.href = '/auth';
        return;
      }

      let uploadedImageUrl = '';

      // 画像が選択されている場合、Supabase Storage にアップロード
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

        // 公開URLの取得
        const { data: publicUrlData } = supabase.storage
          .from('item-images')
          .getPublicUrl(fileName);

        uploadedImageUrl = publicUrlData.publicUrl;
      }

      // Supabase に商品データを保存
      const { error } = await supabase.from('items').insert([
        {
          user_id: user.id,
          title,
          price: parseInt(price, 10),
          category,
          shipping_badge: shippingBadge,
          description,
          image_url: uploadedImageUrl,
        },
      ]);

      if (error) {
        alert(`出品エラー: ${error.message}`);
        setIsSubmitting(false);
        return;
      }

      alert('出品が完了しました！');
      window.location.href = '/mypage';
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '予期せぬエラーが発生しました';
      alert(`エラー: ${message}`);
    } finally {
      setIsSubmitting(false);
    }
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
            {/* 画像アップロードエリア */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>商品写真</label>
              <div style={{ border: '2px dashed rgba(255, 75, 145, 0.3)', borderRadius: '16px', padding: '20px', textAlign: 'center', background: '#fff' }}>
                {imagePreview ? (
                  <div>
                    <img
                      src={imagePreview}
                      alt="Preview"
                      style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '12px', objectFit: 'cover' }}
                    />
                    <button
                      type="button"
                      onClick={() => { setImageFile(null); setImagePreview(null); }}
                      style={{ display: 'block', margin: '10px auto 0', padding: '6px 16px', borderRadius: '999px', background: '#FF4B91', color: '#fff', border: 'none', fontSize: '12px', cursor: 'pointer' }}
                    >
                      写真を変更する
                    </button>
                  </div>
                ) : (
                  <label style={{ cursor: 'pointer', display: 'block' }}>
                    <div style={{ fontSize: '28px', marginBottom: '8px' }}>📷</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)' }}>クリックして写真をアップロード</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>PNG, JPG 形式に対応</div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      style={{ display: 'none' }}
                    />
                  </label>
                )}
              </div>
            </div>

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
              {isSubmitting ? 'アップロード＆保存中...' : '🎀 この内容で出品する'}
            </button>
          </form>
        </div>
      </main>
    </>
  );
}