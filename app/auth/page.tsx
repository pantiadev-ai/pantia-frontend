'use client';

import React, { useState } from 'react';
import './auth.css';

export default function AuthPage() {
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

  // 同意チェックボックス
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeAge, setAgreeAge] = useState(false);

  // エラー状態
  const [loginEmailErr, setLoginEmailErr] = useState(false);
  const [loginPwErr, setLoginPwErr] = useState(false);
  const [regEmailErr, setRegEmailErr] = useState(false);
  const [regPwConfErr, setRegPwConfErr] = useState(false);

  // パスワード強度
  const [pwStrengthText, setPwStrengthText] = useState('英数字を含む8文字以上で設定してください');
  const [pwStrengthColor, setPwStrengthColor] = useState('var(--text-muted)');

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

  const handleLogin = () => {
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

    if (ok) {
      alert('ログインしました');
      // TODO: Supabase Auth ログイン処理
    }
  };

  const handleRegister = () => {
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

    if (ok) {
      setRegStep(3);
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

              <button className="btn-submit seller-mode" onClick={handleLogin}>
                🔑 ログイン
              </button>

              <div className="or-divider"><span>または</span></div>

              <div className="sns-btns">
                <button className="sns-btn google">
                  <span className="sns-icon">G</span> Googleでログイン
                </button>
                <button className="sns-btn x-twitter">
                  <span className="sns-icon">𝕏</span> X（Twitter）でログイン
                </button>
              </div>

              <div className="switch-link">
                アカウントをお持ちでない方は{' '}
                <a onClick={() => setCurrentMode('register')}>新規登録</a>
              </div>
            </div>
          )}

          {/* REGISTER PANEL */}
          {currentMode === 'register' && (
            <div className="register-panel show">
              {/* STEP INDICATOR */}
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
                      本サービスは<strong>18歳以上</strong>の方のみご利用いただけます。登録完了後に本人確認（eKYC）をお願いします。
                    </div>
                  </div>

                  <button
                    className={`btn-submit ${selectedRole === 'seller' ? 'seller-mode' : 'buyer-mode'}`}
                    onClick={() => setRegStep(2)}
                    style={{ marginTop: 0 }}
                  >
                    次へ進む →
                  </button>

                  <div className="or-divider"><span>または</span></div>
                  <div className="sns-btns">
                    <button className="sns-btn google"><span className="sns-icon">G</span> Googleで登録</button>
                    <button className="sns-btn x-twitter"><span className="sns-icon">𝕏</span> X（Twitter）で登録</button>
                  </div>

                  <div className="switch-link">
                    すでにアカウントをお持ちの方は{' '}
                    <a onClick={() => setCurrentMode('login')}>ログイン</a>
                  </div>
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
                    {regEmailErr && (
                      <div className="form-error show">メールアドレスを入力してください</div>
                    )}
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
                    {regPwConfErr && (
                      <div className="form-error show">パスワードが一致しません</div>
                    )}
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
                    <div className="form-hint">サービス上で表示される名前です（本名不要）</div>
                  </div>

                  {/* 出品者専用フィールド */}
                  {selectedRole === 'seller' && (
                    <div className="seller-fields show">
                      <div className="field-divider"><span>出品者の追加情報</span></div>

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
                        <div className="form-hint">18歳未満の方はご登録いただけません</div>
                      </div>

                      <div className="form-group">
                        <label className="form-label">職業</label>
                        <input className="form-input" type="text" placeholder="例：大学生、会社員、主婦 など" />
                        <div className="form-hint">プロフィールに表示されます（任意）</div>
                      </div>

                      <div className="form-group">
                        <label className="form-label">振込先口座（売上受け取り用）</label>
                        <input className="form-input" type="text" placeholder="銀行名" style={{ marginBottom: '8px' }} />
                        <input className="form-input" type="text" placeholder="支店名" />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '8px', marginTop: '8px' }}>
                          <select className="form-input" style={{ borderRadius: 'var(--r-pill)' }}>
                            <option>普通</option>
                            <option>当座</option>
                          </select>
                          <input className="form-input" type="text" placeholder="口座番号" />
                        </div>
                        <input className="form-input" type="text" placeholder="口座名義（カタカナ）" style={{ marginTop: '8px' }} />
                        <div className="form-hint">後から設定・変更も可能です</div>
                      </div>
                    </div>
                  )}

                  {/* 同意チェック */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '4px' }}>
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
                      style={{ flex: 1 }}
                    >
                      🎀 登録する
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
                    ようこそ！確認メールをご確認の上、<br />
                    {selectedRole === 'seller'
                      ? 'プロフィールを設定して出品をはじめましょう🌸'
                      : 'お気に入りの出品者を探してみましょう💕'}
                  </div>
                  <a
                    href={selectedRole === 'seller' ? '/seller/profile' : '/'}
                    className="btn-go"
                  >
                    {selectedRole === 'seller' ? 'プロフィールを設定する →' : '商品を探す →'}
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