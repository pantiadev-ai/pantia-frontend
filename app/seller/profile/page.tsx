'use client';

import React, { useState } from 'react';

export default function SellerProfilePage() {
  const [profile, setProfile] = useState({
    sellerName: '',
    displayName: '',
    email: '',
    website: '',
    twitter: '',
    bio: '',
  });

  const [avatarImage, setAvatarImage] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
  };

  // プロフィール画像選択
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAvatarImage(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert('プロフィール情報を更新しました');
    // TODO: Supabase Storage へのアバター画像アップロードおよび Railway API 呼び出し
  };

  return (
    <div className="max-w-3xl mx-auto p-6 bg-white rounded-lg shadow-md my-10">
      <h1 className="text-2xl font-bold mb-6 text-gray-800 border-b pb-3">出品者プロフィール設定</h1>
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* プロフィールアイコン画像 */}
        <div className="flex items-center space-x-6">
          <div className="relative w-20 h-20 rounded-full border-2 border-gray-300 overflow-hidden bg-gray-100 flex items-center justify-center">
            {avatarPreview ? (
              <img src={avatarPreview} alt="Avatar Preview" className="w-full h-full object-cover" />
            ) : (
              <span className="text-gray-400 text-xs text-center px-1">画像なし</span>
            )}
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">プロフィール画像 / アイコン</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="p-1 border border-gray-300 rounded text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100 cursor-pointer"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">出品者ID / アカウント名 <span className="text-red-500">*</span></label>
            <input
              type="text"
              name="sellerName"
              required
              value={profile.sellerName}
              onChange={handleChange}
              className="w-full p-2.5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-black"
              placeholder="例: seller_01"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">表示名（ショップ名・屋号） <span className="text-red-500">*</span></label>
            <input
              type="text"
              name="displayName"
              required
              value={profile.displayName}
              onChange={handleChange}
              className="w-full p-2.5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-black"
              placeholder="例: パンティア公式ショップ"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">連絡用メールアドレス</label>
          <input
            type="email"
            name="email"
            value={profile.email}
            onChange={handleChange}
            className="w-full p-2.5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-black"
            placeholder="example@domain.com"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Webサイト / ポートフォリオ URL</label>
            <input
              type="url"
              name="website"
              value={profile.website}
              onChange={handleChange}
              className="w-full p-2.5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-black"
              placeholder="https://..."
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">X (旧Twitter) アカウント</label>
            <input
              type="text"
              name="twitter"
              value={profile.twitter}
              onChange={handleChange}
              className="w-full p-2.5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-black"
              placeholder="@username"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">自己紹介・プロフィール詳細</label>
          <textarea
            name="bio"
            rows={5}
            value={profile.bio}
            onChange={handleChange}
            className="w-full p-2.5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-black"
            placeholder="ブランド概要や自己紹介を入力してください"
          />
        </div>

        <button
          type="submit"
          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded transition"
        >
          プロフィールを更新
        </button>
      </form>
    </div>
  );
}