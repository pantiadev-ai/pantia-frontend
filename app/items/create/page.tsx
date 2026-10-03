'use client';

import React, { useState } from 'react';

export default function CreateItemPage() {
  const [formData, setFormData] = useState({
    title: '',
    price: '',
    category: '',
    status: 'published',
    description: '',
    sellerNote: '',
  });

  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // 画像ファイル選択処理
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      setImages((prev) => [...prev, ...selectedFiles]);

      const newPreviews = selectedFiles.map((file) => URL.createObjectURL(file));
      setImagePreviews((prev) => [...prev, ...newPreviews]);
    }
  };

  // 画像削除処理
  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert(`出品情報を保存しました（画像 ${images.length} 枚選択済み）`);
    // TODO: Supabase Storage への画像アップロードおよび Railway API 呼び出し
  };

  return (
    <div className="max-w-3xl mx-auto p-6 bg-white rounded-lg shadow-md my-10">
      <h1 className="text-2xl font-bold mb-6 text-gray-800 border-b pb-3">出品情報登録・編集</h1>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">商品タイトル <span className="text-red-500">*</span></label>
          <input
            type="text"
            name="title"
            required
            value={formData.title}
            onChange={handleChange}
            className="w-full p-2.5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-black"
            placeholder="商品名を入力してください"
          />
        </div>

        {/* 商品画像アップロード */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">商品画像 (複数可)</label>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageChange}
            className="w-full p-2 border border-gray-300 rounded text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
          />
          {/* 画像プレビュー表示 */}
          {imagePreviews.length > 0 && (
            <div className="flex flex-wrap gap-3 mt-3">
              {imagePreviews.map((src, index) => (
                <div key={index} className="relative w-24 h-24 border rounded overflow-hidden shadow-sm group">
                  <img src={src} alt={`Preview ${index}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-80 hover:opacity-100"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">販売価格 (円) <span className="text-red-500">*</span></label>
            <input
              type="number"
              name="price"
              required
              value={formData.price}
              onChange={handleChange}
              className="w-full p-2.5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-black"
              placeholder="例: 3000"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">カテゴリ</label>
            <select
              name="category"
              value={formData.category}
              onChange={handleChange}
              className="w-full p-2.5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-black"
            >
              <option value="">選択してください</option>
              <option value="digital">デジタルコンテンツ</option>
              <option value="goods">グッズ・イラスト</option>
              <option value="other">その他</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">公開ステータス</label>
          <select
            name="status"
            value={formData.status}
            onChange={handleChange}
            className="w-full p-2.5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-black"
          >
            <option value="published">公開</option>
            <option value="draft">下書き</option>
            <option value="private">非公開</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">商品説明文</label>
          <textarea
            name="description"
            rows={6}
            value={formData.description}
            onChange={handleChange}
            className="w-full p-2.5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-black"
            placeholder="商品の詳細情報を入力してください"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">管理用メモ (非公開)</label>
          <textarea
            name="sellerNote"
            rows={3}
            value={formData.sellerNote}
            onChange={handleChange}
            className="w-full p-2.5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-black"
            placeholder="内部管理用のメモ"
          />
        </div>

        <button
          type="submit"
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded transition"
        >
          出品情報を保存
        </button>
      </form>
    </div>
  );
}