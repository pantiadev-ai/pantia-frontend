"use client";
/* ログインと新規登録（3段）の切り替え。形とクラス名は見本 auth.html のまま。
   チェック・役割のカードは見えない本物の入力欄を中に置き、キーボードと読み上げでも使えるようにしている。 */
import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { FormMessage, useAction } from "@/components/useAction";
import { login, signup, startOAuth } from "@/lib/actions/auth";
import { PASSWORD_MAX, isStrongPassword, passwordHint, type OAuthProvider, type SignupRole } from "./rules";

type Mode = "login" | "register";

type Props = {
  initialTab: Mode;
  /** トップの「出品者として／購入者として登録」から来たときに、先に選んでおく役割（?role=） */
  initialRole: SignupRole | null;
  /** ログインのあとに開くページ（サーバーで確かめ済み） */
  next: string;
  providers: OAuthProvider[];
  registrationOpen: boolean;
  /** メールのリンクが切れていた（/auth?error=link） */
  linkError: boolean;
};

const PROVIDERS: Record<OAuthProvider, { icon: string; name: string; className: string; iconStyle?: { color: string } }> = {
  google: { icon: "G", name: "Google", className: "sns-btn google" },
  x: { icon: "𝕏", name: "X（Twitter）", className: "sns-btn x-twitter", iconStyle: { color: "#1DA1F2" } },
};

const EMAIL_MAX = 254;
const looksLikeEmail = (s: string) => {
  const t = s.trim();
  return t.length > 2 && t.length <= EMAIL_MAX && t.includes("@");
};

export default function AuthForms({ initialTab, initialRole, next, providers, registrationOpen, linkError }: Props) {
  const [mode, setMode] = useState<Mode>(initialTab);
  // 外部アカウントのボタンでも「ログインしたままにする」を使うので、ここで持つ
  const [keep, setKeep] = useState(false);

  return (
    <>
      <div className="mode-switch" role="group" aria-label="ログインか新規登録かを選ぶ">
        <button type="button" className={`mode-btn${mode === "login" ? " active" : ""}`} aria-pressed={mode === "login"} onClick={() => setMode("login")}>
          ログイン
        </button>
        <button
          type="button"
          className={`mode-btn${mode === "register" ? " active" : ""}`}
          aria-pressed={mode === "register"}
          onClick={() => setMode("register")}
        >
          新規登録
        </button>
      </div>

      <LoginPanel
        show={mode === "login"}
        next={next}
        providers={providers}
        linkError={linkError}
        keep={keep}
        onKeep={setKeep}
        onSwitch={() => setMode("register")}
      />
      <RegisterPanel
        show={mode === "register"}
        initialRole={initialRole}
        next={next}
        providers={registrationOpen ? providers : []}
        registrationOpen={registrationOpen}
        keep={keep}
        onSwitch={() => setMode("login")}
      />
    </>
  );
}

/* ───────── 部品 ───────── */

function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  autoComplete,
  invalid,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete: "current-password" | "new-password";
  invalid?: boolean;
  describedBy?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="pw-wrap">
      <input
        id={id}
        className={`form-input${invalid ? " error" : ""}`}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        maxLength={PASSWORD_MAX}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        style={{ paddingRight: 44 }}
        required
      />
      <button
        className="pw-toggle"
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "パスワードを隠す" : "パスワードを表示する"}
        aria-pressed={visible}
      >
        {visible ? "🙈" : "👁"}
      </button>
    </div>
  );
}

function CheckRow({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="check-group">
      <input type="checkbox" className="pt-sr" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={`check-box${checked ? " checked" : ""}`} aria-hidden="true" />
      <span className="check-label">{children}</span>
    </label>
  );
}

function SnsButtons({
  providers,
  verb,
  disabled,
  onStart,
}: {
  providers: OAuthProvider[];
  verb: "ログイン" | "登録";
  disabled: boolean;
  onStart: (p: OAuthProvider) => void;
}) {
  return (
    <div className="sns-btns">
      {providers.map((p) => {
        const info = PROVIDERS[p];
        return (
          <button key={p} type="button" className={info.className} disabled={disabled} onClick={() => onStart(p)}>
            <span className="sns-icon" style={info.iconStyle} aria-hidden="true">
              {info.icon}
            </span>{" "}
            {info.name}で{verb}
          </button>
        );
      })}
    </div>
  );
}

/* ───────── ログイン ───────── */

function LoginPanel({
  show,
  next,
  providers,
  linkError,
  keep,
  onKeep,
  onSwitch,
}: {
  show: boolean;
  next: string;
  providers: OAuthProvider[];
  linkError: boolean;
  keep: boolean;
  onKeep: (v: boolean) => void;
  onSwitch: () => void;
}) {
  const { pending, error, run } = useAction();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const emailBad = touched && !looksLikeEmail(email);
  const pwBad = touched && password.length === 0;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    if (!looksLikeEmail(email) || password.length === 0) return;
    run(() => login({ email: email.trim(), password, keep, next }));
  }

  function oauth(provider: OAuthProvider) {
    run(
      () => startOAuth({ provider, keep, next }),
      (d) => {
        if (d) window.location.assign(d.url);
      },
    );
  }

  return (
    <div className={`login-panel${show ? " show" : ""}`} hidden={!show}>
      <div className="pt-auth-head">
        <h1 className="pt-auth-title">おかえりなさい 🌸</h1>
        <div className="pt-auth-sub">アカウントにログインしてください</div>
      </div>

      {linkError && !error ? (
        <p className="pt-msg error" role="alert">
          リンクの期限が切れています。もう一度ログインするか、パスワードの再設定からやり直してください。
        </p>
      ) : null}
      <FormMessage error={error} />

      <form onSubmit={submit} noValidate>
        <div className="form-group">
          <label className="form-label" htmlFor="loginEmail">
            メールアドレス <span className="required">*</span>
          </label>
          <input
            id="loginEmail"
            className={`form-input${emailBad ? " error" : ""}`}
            type="email"
            placeholder="example@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            maxLength={EMAIL_MAX}
            aria-invalid={emailBad || undefined}
            aria-describedby="loginEmailErr"
            required
          />
          <div className={`form-error${emailBad ? " show" : ""}`} id="loginEmailErr">
            メールアドレスを入力してください
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="loginPw">
            パスワード <span className="required">*</span>
          </label>
          <Link href="/auth/reset" className="forgot-link">
            パスワードを忘れた方
          </Link>
          <PasswordInput
            id="loginPw"
            value={password}
            onChange={setPassword}
            placeholder="パスワードを入力"
            autoComplete="current-password"
            invalid={pwBad}
            describedBy="loginPwErr"
          />
          <div className={`form-error${pwBad ? " show" : ""}`} id="loginPwErr">
            パスワードを入力してください
          </div>
        </div>

        <div style={{ marginBottom: 4 }}>
          <CheckRow checked={keep} onChange={onKeep}>
            ログインしたままにする
          </CheckRow>
        </div>

        <button className="btn-submit seller-mode" type="submit" disabled={pending}>
          {pending ? "確認しています…" : "🔑 ログイン"}
        </button>
      </form>

      {providers.length > 0 ? (
        <>
          <div className="or-divider">
            <span>または</span>
          </div>
          <SnsButtons providers={providers} verb="ログイン" disabled={pending} onStart={oauth} />
        </>
      ) : null}

      <div className="switch-link">
        アカウントをお持ちでない方は{" "}
        <button type="button" onClick={onSwitch}>
          新規登録
        </button>
      </div>
    </div>
  );
}

/* ───────── 新規登録（3段） ───────── */

function RegisterPanel({
  show,
  initialRole,
  next,
  providers,
  registrationOpen,
  keep,
  onSwitch,
}: {
  show: boolean;
  initialRole: SignupRole | null;
  next: string;
  providers: OAuthProvider[];
  registrationOpen: boolean;
  keep: boolean;
  onSwitch: () => void;
}) {
  const { pending, error, run, setError } = useAction();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [role, setRole] = useState<SignupRole | null>(initialRole);
  const [roleError, setRoleError] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [nickname, setNickname] = useState("");
  const [age, setAge] = useState("");
  const [occupation, setOccupation] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [adult, setAdult] = useState(false);
  const [touched, setTouched] = useState(false);

  const isSeller = role === "seller";
  const mode = isSeller ? "seller-mode" : role === "buyer" ? "buyer-mode" : "seller-mode";
  const hint = passwordHint(password);
  const ageNum = Number(age);
  const ageOk = age.trim() !== "" && Number.isInteger(ageNum) && ageNum >= 18 && ageNum <= 99;
  const nickOk = nickname.trim().length >= 1 && nickname.trim().length <= 20;

  const bad = {
    email: touched && !looksLikeEmail(email),
    password: touched && !isStrongPassword(password),
    confirm: touched && confirm !== password,
    nickname: touched && !nickOk,
    age: touched && isSeller && !ageOk,
    agree: touched && !(agreeTerms && agreePrivacy && adult),
  };

  const stepCls = (n: 1 | 2 | 3) => (step > n ? "step done" : step === n ? "step active" : "step");

  function goStep2() {
    if (!role) {
      setRoleError(true);
      return;
    }
    setError(null);
    setStep(2);
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    if (!role) {
      setStep(1);
      setRoleError(true);
      return;
    }
    const ok =
      looksLikeEmail(email) &&
      isStrongPassword(password) &&
      confirm === password &&
      nickOk &&
      (!isSeller || ageOk) &&
      occupation.trim().length <= 20 &&
      agreeTerms &&
      agreePrivacy &&
      adult;
    if (!ok) return;
    run(
      () =>
        signup({
          role,
          nickname: nickname.trim(),
          email: email.trim(),
          password,
          age: isSeller ? ageNum : null,
          occupation: isSeller && occupation.trim() ? occupation.trim() : null,
          agreeTerms: true,
          agreePrivacy: true,
          adult: true,
        }),
      () => {
        // パスワードは画面に残さない
        setPassword("");
        setConfirm("");
        setStep(3);
      },
    );
  }

  function oauth(provider: OAuthProvider) {
    run(
      () => startOAuth({ provider, keep, next }),
      (d) => {
        if (d) window.location.assign(d.url);
      },
    );
  }

  return (
    <div className={`register-panel${show ? " show" : ""}`} hidden={!show}>
      {/* STEP INDICATOR */}
      <div className="steps" aria-label="登録の手順">
        <div className={stepCls(1)} aria-current={step === 1 ? "step" : undefined}>
          <div className="step-num">{step > 1 ? "✓" : "1"}</div> ロール選択
        </div>
        <div className={`step-line${step > 1 ? " done" : ""}`} />
        <div className={stepCls(2)} aria-current={step === 2 ? "step" : undefined}>
          <div className="step-num">{step > 2 ? "✓" : "2"}</div> 基本情報
        </div>
        <div className={`step-line${step > 2 ? " done" : ""}`} />
        <div className={stepCls(3)} aria-current={step === 3 ? "step" : undefined}>
          <div className="step-num">3</div> 完了
        </div>
      </div>

      {/* STEP 1: ロール選択 */}
      {step === 1 ? (
        <div>
          <div className="pt-auth-head" style={{ marginBottom: 20 }}>
            <h1 className="pt-auth-title" style={{ fontSize: 20 }}>
              はじめまして！🎀
            </h1>
            <div className="pt-auth-sub">どちらで登録しますか？</div>
          </div>

          {!registrationOpen ? <div className="pt-closed">ただいま新規登録を止めています。再開までお待ちください。</div> : null}

          <div className="role-selector" role="radiogroup" aria-label="登録の種類">
            <div className="role-cards">
              <label className={`role-card seller${role === "seller" ? " selected" : ""}`}>
                <input
                  type="radio"
                  name="role"
                  value="seller"
                  className="pt-sr"
                  checked={role === "seller"}
                  onChange={() => {
                    setRole("seller");
                    setRoleError(false);
                  }}
                />
                <div className="role-icon" aria-hidden="true">
                  👗
                </div>
                <div className="role-name">出品者</div>
                <div className="role-desc">商品を売りたい方（女性）</div>
                <div className="role-check" aria-hidden="true">
                  {role === "seller" ? "✓" : ""}
                </div>
              </label>
              <label className={`role-card buyer${role === "buyer" ? " selected" : ""}`}>
                <input
                  type="radio"
                  name="role"
                  value="buyer"
                  className="pt-sr"
                  checked={role === "buyer"}
                  onChange={() => {
                    setRole("buyer");
                    setRoleError(false);
                  }}
                />
                <div className="role-icon" aria-hidden="true">
                  🛍
                </div>
                <div className="role-name">購入者</div>
                <div className="role-desc">商品を買いたい方（男性）</div>
                <div className="role-check" aria-hidden="true">
                  {role === "buyer" ? "✓" : ""}
                </div>
              </label>
            </div>
            <div className={`form-error${roleError ? " show" : ""}`} role={roleError ? "alert" : undefined}>
              出品者か購入者のどちらかを選んでください
            </div>
          </div>

          <div className="age-verify">
            <div className="age-verify-icon" aria-hidden="true">
              ⚠️
            </div>
            <div className="age-verify-text">
              本サービスは<strong>18歳以上</strong>の方のみご利用いただけます。登録完了後に本人確認（18歳以上の確認）をお願いします。
            </div>
          </div>

          <button className={`btn-submit ${mode}`} type="button" onClick={goStep2} style={{ marginTop: 0 }} disabled={!registrationOpen}>
            次へ進む →
          </button>

          <FormMessage error={error} />

          {providers.length > 0 ? (
            <>
              <div className="or-divider">
                <span>または</span>
              </div>
              <SnsButtons providers={providers} verb="登録" disabled={pending} onStart={oauth} />
              <p className="pt-note">
                外部アカウントで登録すると、購入者として始まります（出品者になるには、登録後に設定から役割の変更を申請してください）。
                続けると、<Link href="/terms">利用規約</Link>と<Link href="/privacy">プライバシーポリシー</Link>
                に同意し、18歳以上であることを確認したものとします。
              </p>
            </>
          ) : null}

          <div className="switch-link">
            すでにアカウントをお持ちの方は{" "}
            <button type="button" onClick={onSwitch}>
              ログイン
            </button>
          </div>
        </div>
      ) : null}

      {/* STEP 2: 基本情報 */}
      {step === 2 ? (
        <form onSubmit={submit} noValidate>
          <div className="pt-auth-head" style={{ marginBottom: 20 }}>
            <h1 className="pt-auth-title small">基本情報を入力</h1>
            <div className={`pt-auth-sub ${isSeller ? "seller" : "buyer"}`} style={{ fontSize: 12 }}>
              {isSeller ? "💗 出品者として登録します" : "🛍 購入者として登録します"}
            </div>
          </div>

          <FormMessage error={error} />

          <div className="form-group">
            <label className="form-label" htmlFor="regEmail">
              メールアドレス <span className="required">*</span>
            </label>
            <input
              id="regEmail"
              className={`form-input${bad.email ? " error" : ""}`}
              type="email"
              placeholder="example@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              maxLength={EMAIL_MAX}
              aria-invalid={bad.email || undefined}
              aria-describedby="regEmailErr"
              required
            />
            <div className={`form-error${bad.email ? " show" : ""}`} id="regEmailErr">
              メールアドレスを入力してください
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="regPw">
              パスワード <span className="required">*</span>
            </label>
            <PasswordInput
              id="regPw"
              value={password}
              onChange={setPassword}
              placeholder="8〜72文字（英字と数字）"
              autoComplete="new-password"
              invalid={bad.password}
              describedBy="pwStrength"
            />
            <div className={`form-hint${hint.ok === true ? " ok" : hint.ok === false ? " ng" : ""}`} id="pwStrength" aria-live="polite">
              {hint.text}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="regPwConf">
              パスワード確認 <span className="required">*</span>
            </label>
            <PasswordInput
              id="regPwConf"
              value={confirm}
              onChange={setConfirm}
              placeholder="もう一度入力"
              autoComplete="new-password"
              invalid={bad.confirm}
              describedBy="regPwConfErr"
            />
            <div className={`form-error${bad.confirm ? " show" : ""}`} id="regPwConfErr">
              パスワードが一致しません
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="regNick">
              ニックネーム <span className="required">*</span>
            </label>
            <input
              id="regNick"
              className={`form-input${bad.nickname ? " error" : ""}`}
              type="text"
              placeholder="例：めい"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              autoComplete="nickname"
              maxLength={20}
              aria-invalid={bad.nickname || undefined}
              aria-describedby="regNickHint"
              required
            />
            <div className="form-hint" id="regNickHint">
              サービス上で表示される名前です（本名不要・20文字まで）
            </div>
          </div>

          {/* 出品者専用フィールド */}
          {isSeller ? (
            <div className="seller-fields show">
              <div className="field-divider">
                <span>出品者の追加情報</span>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="regAge">
                  年齢 <span className="required">*</span>
                </label>
                <input
                  id="regAge"
                  className={`form-input${bad.age ? " error" : ""}`}
                  type="number"
                  inputMode="numeric"
                  placeholder="例：22"
                  min={18}
                  max={99}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  aria-invalid={bad.age || undefined}
                  aria-describedby="regAgeHint"
                  required
                />
                <div className={`form-hint${bad.age ? " ng" : ""}`} id="regAgeHint">
                  18歳未満の方はご登録いただけません（プロフィールに表示されます）
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="regJob">
                  職業
                </label>
                <input
                  id="regJob"
                  className="form-input"
                  type="text"
                  placeholder="例：大学生、会社員、主婦 など"
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                  maxLength={20}
                  aria-describedby="regJobHint"
                />
                <div className="form-hint" id="regJobHint">
                  プロフィールに表示されます（任意）
                </div>
              </div>

              <div className="form-group">
                <div className="form-label">振込先口座（売上受け取り用）</div>
                <div className="form-hint">登録のあと、マイページの「振込」から設定します（振込の申請は本人確認が済んでから）。</div>
              </div>
            </div>
          ) : null}

          {/* 同意チェック */}
          <div className="pt-agree">
            <CheckRow checked={agreeTerms} onChange={setAgreeTerms}>
              <Link href="/terms" target="_blank" rel="noopener">
                利用規約
              </Link>
              に同意する <span className="req">*</span>
            </CheckRow>
            <CheckRow checked={agreePrivacy} onChange={setAgreePrivacy}>
              <Link href="/privacy" target="_blank" rel="noopener">
                プライバシーポリシー
              </Link>
              に同意する <span className="req">*</span>
            </CheckRow>
            <CheckRow checked={adult} onChange={setAdult}>
              18歳以上であることを確認しました <span className="req">*</span>
            </CheckRow>
            <div className={`form-error${bad.agree ? " show" : ""}`}>3つすべてにチェックを入れてください</div>
          </div>

          <div className="pt-row">
            <button className="btn-back" type="button" onClick={() => setStep(1)} aria-label="ひとつ前に戻る">
              ←
            </button>
            <button className={`btn-submit ${mode}`} type="submit" disabled={pending || !registrationOpen}>
              {pending ? "登録しています…" : "🎀 登録する"}
            </button>
          </div>
        </form>
      ) : null}

      {/* STEP 3: 完了 */}
      {step === 3 ? (
        <div className="success-screen show" role="status">
          <div className="success-icon" aria-hidden="true">
            {isSeller ? "🎀" : "🛍"}
          </div>
          <h1 className="success-title">{isSeller ? "出品者の仮登録が完了しました" : "購入者の仮登録が完了しました"}</h1>
          <div className="success-sub">
            確認メールを送りました。
            <br />
            メール内のリンクを開くと登録が完了し、本人確認（18歳以上の確認）へ進みます。
            <br />
            届かないときは、迷惑メールのフォルダもご確認ください。
          </div>
          {isSeller ? (
            <Link href="/" className="btn-go seller">
              トップページへ →
            </Link>
          ) : (
            <Link href="/items" className="btn-go buyer">
              商品を探す →
            </Link>
          )}
        </div>
      ) : null}
    </div>
  );
}
