'use client';

import React, { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import './auth.css';

export default function AuthPage() {
  const supabase = createClient();

  const [currentMode, setCurrentMode] = useState<'login' | 'register'>('login');
  const [selectedRole, setSelectedRole] = useState<'seller' | 'buyer'>('seller');
  const [regStep, setRegStep] = useState<1 | 2 | 3>(1);

  // フォーム用ステート
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPw, setLoginPw] = useState('');
  const [showLoginPw, setShowLoginPw] = useState(false);
  const [stayLoggedIn, setStayLoggedIn] = useState(false);

  const [regEmail, setRegEmail] = useState('');
  const [regPw, setRegPw] = useState('');
  const [regPwConf, setRegPwConf] = useState('');
  const [showRegPw, setShowRegPw] = useState(false);
  const [showRegPwConf, setShowRegPwConf] = useState(false);
  const [regNick, setRegNick] = useState('');
  const [regAge, setRegAge] = useState('');
  const [regBio, setRegBio] = useState('');

  // プロフィール画像（最大5枚）
  const [imageFiles, setImageFiles] = useState<(File | null)[]>([null, null, null, null, null]);
  const [imagePreviews, setImagePreviews] = useState<(string | null)[]>([null, null, null, null, null]);

  // 同意チェックボックス
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeAge, setAgreeAge] = useState(false);

  // エラー状態・送信状態
  const [loginEmailErr, setLoginEmailErr] = useState(false);
  const [loginPwErr, setLoginPwErr] = useState(false);
  const [regEmailErr, setRegEmailErr] = useState(false);
  const [regPwConfErr, setRegPwConfErr] = useState(false);
  const [loading, setLoading] = useState(false);

  // パスワード強度
  const [pwStrengthText, setPwStrengthText] = useState('英数字を含む8文字以上で設定してください');
  const [pwStrengthColor, setPwStrengthColor] = useState('var(--text-muted)');

  const handleImageChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const newFiles = [...imageFiles];
      newFiles[index] = file;
      setImageFiles(newFiles);

      const newPreviews = [...imagePreviews];
      newPreviews[index] = URL.createObjectURL(file);
      setImagePreviews(newPreviews);
    }
  };

  const handlePwStrength = (val: string) => {
    setRegPw(val);
    if (val.length === 0) {
      setPwStrengthText('英数字を含む8文字以上で設定してください');
      setPwStrengthColor('var(--text-muted)');
    } else if (val.length < 8) {
      setPwStrengthText('⚠ もう少し長くしてください');
      setPwStrengthColor('#F39C12');
    } else if (!/[0-9]/.test(val) || !/[a-zA-Z]/.test(val)) {
      setPwStrengthText('⚠ 英字と数字を両方含めてください');
      setPwStrengthColor('#F39C12');
    } else {
      setPwStrengthText('✓ 安全なパスワードです');
      setPwStrengthColor('var(--green2)');
    }
  };

  // ── ログイン処理 ──
  const handleLogin = async () => {
    let ok = true;
    if (!loginEmail.includes('@')) {
      setLoginEmailErr(true);
      ok = false;
    } else {
      setLoginEmailErr(false);
    }

    if (loginPw.length < 1) {
      setLoginPwErr(true);
      ok = false;
    } else {
      setLoginPwErr(false);
    }

    if (!ok) return;

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPw,
    });
    setLoading(false);

    if (error) {
      alert(`ログインエラー: ${error.message}`);
      return;
    }

    alert('ログインに成功しました！');
    window.location.href = '/mypage';
  };

  // ── 新規登録処理 ──
  const handleRegister = async () => {
    let ok = true;
    if (!regEmail.includes('@')) {
      setRegEmailErr(true);
      ok = false;
    } else {
      setRegEmailErr(false);
    }

    if (regPw !== regPwConf || regPwConf.length < 1) {
      setRegPwConfErr(true);
      ok = false;
    } else {
      setRegPwConfErr(false);
    }

    if (!agreeTerms || !agreePrivacy || !agreeAge) {
      alert('必須項目にすべて同意してください');
      ok = false;
    }

    if (!ok) return;

    setLoading(true);

    try {
      // 1. Auth 登録
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: regEmail,
        password: regPw,
        options: {
          data: {
            nickname: regNick,
            role: selectedRole,
            age: regAge,
          },
        },
      });

      if (signUpError) throw signUpError;
      const user = authData.user;

      if (user) {
        const uploadedUrls: string[] = [];

        // 2. プロフィール画像アップロード
        for (let i = 0; i < imageFiles.length; i++) {
          const file = imageFiles[i];
          if (file) {
            const fileExt = file.name.split('.').pop();
            const fileName = `${user.id}/profile_${Date.now()}_${i}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
              .from('profile-images')
              .upload(fileName, file);

            if (!uploadError) {
              const { data: pubData } = supabase.storage
                .from('profile-images')
                .getPublicUrl(fileName);
              uploadedUrls.push(pubData.publicUrl);
            }
          }
        }

        // 3. sellers テーブルに登録（自己紹介文・画像URL付き）
        await supabase.from('sellers').insert([
          {
            id: user.id,
            nickname: regNick,
            age: parseInt(regAge, 10) || null,
            bio: regBio,
            profile_image_url: uploadedUrls[0] || '',
            profile_image_urls: uploadedUrls,
          },
        ]);
      }

      setRegStep(3);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '登録エラーが発生しました';
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <header className="auth-header">
        <a href="#" className="logo">♡ LABEL NAME</a>
        <div className="header-help">
          困ったことがあれば <a href="#">ヘルプ</a>
        </div>
      </header>

      <main className="page">
        <div className="card">
          {/* MODE SWITCH */}
          <div className="mode-switch">
            <button
              className={`mode-btn ${currentMode === 'login' ? 'active' : ''}`}
              onClick={() => setCurrentMode('login')}
            >
              ログイン
            </button>
            <button
              className={`mode-btn ${currentMode === 'register' ? 'active' : ''}`}
              onClick={() => setCurrentMode('register')}
            >
              新規登録
            </button>
          </div>

          {/* LOGIN PANEL */}
          {currentMode === 'login' && (
            <div className="login-panel show">
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <div style={{ fontSize: '22px', fontWeight: 800 }}>おかえりなさい 🌸</div>
                <div style={{ fontSize: '13px', color: 'var(--text-sub)', marginTop: '4px' }}>
                  アカウントにログインしてください
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">
                  メールアドレス <span className="required">*</span>
                </label>
                <input
                  className={`form-input ${loginEmailErr ? 'error' : ''}`}
                  type="email"
                  placeholder="example@email.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                />
                {loginEmailErr && (
                  <div className="form-error show">メールアドレスを入力してください</div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">
                  パスワード <span className="required">*</span>
                </label>
                <a href="#" className="forgot-link">パスワードを忘れた方</a>
                <div className="pw-wrap">
                  <input
                    className={`form-input ${loginPwErr ? 'error' : ''}`}
                    type={showLoginPw ? 'text' : 'password'}
                    placeholder="パスワードを入力"
                    style={{ paddingRight: '44px' }}
                    value={loginPw}
                    onChange={(e) => setLoginPw(e.target.value)}
                  />
                  <button
                    className="pw-toggle"
                    type="button"
                    onClick={() => setShowLoginPw(!showLoginPw)}
                  >
                    {showLoginPw ? '🙈' : '👁'}
                  </button>
                </div>
                {loginPwErr && (
                  <div className="form-error show">パスワードを入力してください</div>
                )}
              </div>

              <div style={{ marginBottom: '4px' }}>
                <div
                  className="check-group"
                  onClick={() => setStayLoggedIn(!stayLoggedIn)}
                >
                  <div className={`check-box ${stayLoggedIn ? 'checked' : ''}`}></div>
                  <span className="check-label">ログイン状態を保持する</span>
                </div>
              </div>

              <button className="btn-submit seller-mode" onClick={handleLogin} disabled={loading}>
                {loading ? '処理中...' : '🔑 ログイン'}
              </button>
            </div>
          )}

          {/* REGISTER PANEL */}
          {currentMode === 'register' && (
            <div className="register-panel show">
              <div className="steps">
                <div className={`step ${regStep === 1 ? 'active' : regStep > 1 ? 'done' : ''}`}>
                  <div className="step-num">{regStep > 1 ? '✓' : '1'}</div> ロール選択
                </div>
                <div className={`step-line ${regStep > 1 ? 'done' : ''}`}></div>
                <div className={`step ${regStep === 2 ? 'active' : regStep > 2 ? 'done' : ''}`}>
                  <div className="step-num">{regStep > 2 ? '✓' : '2'}</div> 基本情報
                </div>
                <div className={`step-line ${regStep > 2 ? 'done' : ''}`}></div>
                <div className={`step ${regStep === 3 ? 'active' : ''}`}>
                  <div className="step-num">3</div> 完了
                </div>
              </div>

              {/* STEP 1 */}
              {regStep === 1 && (
                <div>
                  <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <div style={{ fontSize: '20px', fontWeight: 800 }}>はじめまして！🎀</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-sub)', marginTop: '4px' }}>
                      どちらで登録しますか？
                    </div>
                  </div>

                  <div className="role-selector">
                    <div className="role-cards">
                      <div
                        className={`role-card seller ${selectedRole === 'seller' ? 'selected' : ''}`}
                        onClick={() => setSelectedRole('seller')}
                      >
                        <div className="role-icon">👗</div>
                        <div className="role-name">出品者</div>
                        <div className="role-desc">商品を売りたい方</div>
                        <div className="role-check">
                          {selectedRole === 'seller' ? '✓' : ''}
                        </div>
                      </div>
                      <div
                        className={`role-card buyer ${selectedRole === 'buyer' ? 'selected' : ''}`}
                        onClick={() => setSelectedRole('buyer')}
                      >
                        <div className="role-icon">🛍</div>
                        <div className="role-name">購入者</div>
                        <div className="role-desc">商品を買いたい方</div>
                        <div className="role-check">
                          {selectedRole === 'buyer' ? '✓' : ''}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="age-verify">
                    <div className="age-verify-icon">⚠️</div>
                    <div className="age-verify-text">
                      本サービスは<strong>18歳以上</strong>の方のみご利用いただけます。
                    </div>
                  </div>

                  <button
                    className={`btn-submit ${selectedRole === 'seller' ? 'seller-mode' : 'buyer-mode'}`}
                    onClick={() => setRegStep(2)}
                  >
                    次へ進む →
                  </button>
                </div>
              )}

              {/* STEP 2 */}
              {regStep === 2 && (
                <div>
                  <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <div style={{ fontSize: '18px', fontWeight: 800 }}>基本情報を入力</div>
                    <div
                      style={{
                        fontSize: '12px',
                        marginTop: '4px',
                        color: selectedRole === 'seller' ? 'var(--primary)' : 'var(--secondary)',
                      }}
                    >
                      {selectedRole === 'seller' ? '💗 出品者として登録します' : '🛍 購入者として登録します'}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      メールアドレス <span className="required">*</span>
                    </label>
                    <input
                      className={`form-input ${regEmailErr ? 'error' : ''}`}
                      type="email"
                      placeholder="example@email.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      パスワード <span className="required">*</span>
                    </label>
                    <div className="pw-wrap">
                      <input
                        className="form-input"
                        type={showRegPw ? 'text' : 'password'}
                        placeholder="8文字以上"
                        style={{ paddingRight: '44px' }}
                        value={regPw}
                        onChange={(e) => handlePwStrength(e.target.value)}
                      />
                      <button
                        className="pw-toggle"
                        type="button"
                        onClick={() => setShowRegPw(!showRegPw)}
                      >
                        {showRegPw ? '🙈' : '👁'}
                      </button>
                    </div>
                    <div className="form-hint" style={{ color: pwStrengthColor }}>
                      {pwStrengthText}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      パスワード確認 <span className="required">*</span>
                    </label>
                    <div className="pw-wrap">
                      <input
                        className={`form-input ${regPwConfErr ? 'error' : ''}`}
                        type={showRegPwConf ? 'text' : 'password'}
                        placeholder="もう一度入力"
                        style={{ paddingRight: '44px' }}
                        value={regPwConf}
                        onChange={(e) => setRegPwConf(e.target.value)}
                      />
                      <button
                        className="pw-toggle"
                        type="button"
                        onClick={() => setShowRegPwConf(!showRegPwConf)}
                      >
                        {showRegPwConf ? '🙈' : '👁'}
                      </button>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      ニックネーム <span className="required">*</span>
                    </label>
                    <input
                      className="form-input"
                      type="text"
                      placeholder="例：めい"
                      value={regNick}
                      onChange={(e) => setRegNick(e.target.value)}
                    />
                  </div>

                  {selectedRole === 'seller' && (
                    <div className="seller-fields show">
                      <div className="field-divider"><span>プロフィール設定</span></div>

                      <div className="form-group">
                        <label className="form-label">
                          年齢 <span className="required">*</span>
                        </label>
                        <input
                          className="form-input"
                          type="number"
                          placeholder="例：22"
                          min="18"
                          max="99"
                          value={regAge}
                          onChange={(e) => setRegAge(e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">自己紹介文</label>
                        <textarea
                          className="form-input"
                          placeholder="はじめまして！よろしくお願いします🌸"
                          style={{ minHeight: '80px', borderRadius: '12px', resize: 'vertical' }}
                          value={regBio}
                          onChange={(e) => setRegBio(e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">プロフィール写真（最大5枚）</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', marginTop: '6px' }}>
                          {[0, 1, 2, 3, 4].map((idx) => (
                            <label
                              key={idx}
                              style={{
                                aspectRatio: '1/1',
                                border: '1.5px dashed var(--primary)',
                                borderRadius: '12px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                overflow: 'hidden',
                                background: '#fff',
                              }}
                            >
                              {imagePreviews[idx] ? (
                                <img src={imagePreviews[idx]!} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <span style={{ fontSize: '14px', color: 'var(--primary)', fontWeight: 800 }}>＋</span>
                              )}
                              <input type="file" accept="image/*" onChange={(e) => handleImageChange(idx, e)} style={{ display: 'none' }} />
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', margin: '16px 0 12px' }}>
                    <div className="check-group" onClick={() => setAgreeTerms(!agreeTerms)}>
                      <div className={`check-box ${agreeTerms ? 'checked' : ''}`}></div>
                      <span className="check-label">
                        <a href="#">利用規約</a>に同意する <span style={{ color: 'var(--primary)' }}>*</span>
                      </span>
                    </div>
                    <div className="check-group" onClick={() => setAgreePrivacy(!agreePrivacy)}>
                      <div className={`check-box ${agreePrivacy ? 'checked' : ''}`}></div>
                      <span className="check-label">
                        <a href="#">プライバシーポリシー</a>に同意する <span style={{ color: 'var(--primary)' }}>*</span>
                      </span>
                    </div>
                    <div className="check-group" onClick={() => setAgreeAge(!agreeAge)}>
                      <div className={`check-box ${agreeAge ? 'checked' : ''}`}></div>
                      <span className="check-label">
                        18歳以上であることを確認しました <span style={{ color: 'var(--primary)' }}>*</span>
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn-back" onClick={() => setRegStep(1)}>←</button>
                    <button
                      className={`btn-submit ${selectedRole === 'seller' ? 'seller-mode' : 'buyer-mode'}`}
                      onClick={handleRegister}
                      disabled={loading}
                      style={{ flex: 1 }}
                    >
                      {loading ? '登録中...' : '🎀 登録する'}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3 */}
              {regStep === 3 && (
                <div className="success-screen show">
                  <div className="success-icon">
                    {selectedRole === 'seller' ? '🎀' : '🛍'}
                  </div>
                  <div className="success-title">
                    {selectedRole === 'seller' ? '出品者登録完了！' : '購入者登録完了！'}
                  </div>
                  <div className="success-sub">
                    登録が完了しました🌸<br />
                    さっそくマイページを開いてみましょう！
                  </div>
                  <a href="/mypage" className="btn-go">
                    マイページへ進む →
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="auth-footer">
        <a href="#">利用規約</a>
        <a href="#">プライバシーポリシー</a>
        <a href="#">特定商取引法</a>
        <a href="#">お問い合わせ</a>
        <a href="#">© 2026 LABEL NAME</a>
      </footer>
    </>
  );
}