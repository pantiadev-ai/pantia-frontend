/* 環境変数。未設定なら予備値で素通りさせず、その場で止める（28 §C5）。
   NEXT_PUBLIC_ はブラウザにも配られる。秘密は入れない（28 §C1）。

   外のサービス（決済・メール）は、契約前は "mock" で動く。鍵を入れて "live" に替えれば本物につながる。
   本人確認は manual（運営が書類を見る）で動く。TRUSTDOCK と契約したら KYC_MODE=trustdock。
   mock のまま本番に出さないよう、本番（VERCEL_ENV=production）では mock の決済を受け付けない（lib/adapters/payment.ts）。
   メールの mock は本番でも動く（送らずに控えだけ残す）が、/admin の上に警告を出す。 */

function need(name: string, value: string | undefined): string {
  const v = (value ?? "").trim();
  if (!v) throw new Error(`環境変数 ${name} が未設定です（.env.example を参照）`);
  return v;
}

/** ブラウザでも読む値。process.env.X の形で書かないと Next.js が埋め込まない */
export const publicEnv = {
  get supabaseUrl() {
    return need("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  get supabaseAnonKey() {
    return need("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  },
  get siteUrl() {
    return need("NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL).replace(/\/+$/, "");
  },
  /** 外部アカウントでのログイン（カンマ区切り。google・x）。既定は無し。Supabase Auth 側でも有効にしてから足す */
  get oauthProviders(): ("google" | "x")[] {
    const v = (process.env.NEXT_PUBLIC_OAUTH_PROVIDERS ?? "").split(",").map((s) => s.trim());
    return v.filter((p): p is "google" | "x" => p === "google" || p === "x");
  },
};

export type AdapterMode = "mock" | "live";
function mode(name: string): AdapterMode {
  const v = (process.env[name] ?? "mock").trim();
  if (v !== "mock" && v !== "live") throw new Error(`環境変数 ${name} は mock か live です`);
  return v;
}

/** サーバーだけで読む値。クライアント部品から読むと undefined になり、need() で止まる */
export const serverEnv = {
  get supabaseServiceRoleKey() {
    return need("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
  },
  get cronSecret() {
    return need("CRON_SECRET", process.env.CRON_SECRET);
  },
  get paymentMode(): AdapterMode {
    return mode("PAYMENT_MODE");
  },
  get stripeSecretKey() {
    return need("STRIPE_SECRET_KEY", process.env.STRIPE_SECRET_KEY);
  },
  get stripeWebhookSecret() {
    return need("STRIPE_WEBHOOK_SECRET", process.env.STRIPE_WEBHOOK_SECRET);
  },
  /** 本人確認の受け方。manual（既定）= 書類の写真を受け取り、管理画面で運営が見る／trustdock = TRUSTDOCK に回す */
  get kycMode(): "manual" | "trustdock" {
    const v = (process.env.KYC_MODE ?? "manual").trim();
    if (v !== "manual" && v !== "trustdock") throw new Error("環境変数 KYC_MODE は manual か trustdock です");
    return v;
  },
  get trustdockApiBase() {
    return need("TRUSTDOCK_API_BASE", process.env.TRUSTDOCK_API_BASE).replace(/\/+$/, "");
  },
  get trustdockApiToken() {
    return need("TRUSTDOCK_API_TOKEN", process.env.TRUSTDOCK_API_TOKEN);
  },
  get trustdockWebhookSecret() {
    return need("TRUSTDOCK_WEBHOOK_SECRET", process.env.TRUSTDOCK_WEBHOOK_SECRET);
  },
  get paypayApiKey() {
    return need("PAYPAY_API_KEY", process.env.PAYPAY_API_KEY);
  },
  get paypayApiSecret() {
    return need("PAYPAY_API_SECRET", process.env.PAYPAY_API_SECRET);
  },
  get paypayMerchantId() {
    return need("PAYPAY_MERCHANT_ID", process.env.PAYPAY_MERCHANT_ID);
  },
  /** PayPay の本番につなぐか。既定は試験環境（sandbox）。本番の鍵を入れたら PAYPAY_PRODUCTION=1 */
  get paypayProduction() {
    return process.env.PAYPAY_PRODUCTION === "1";
  },
  /** 使える支払い方法（カンマ区切り）。既定は card,bank,paypay。契約が下りない方法は外す */
  get paymentMethods(): string[] {
    const v = (process.env.PAYMENT_METHODS ?? "card,bank,paypay").split(",").map((s) => s.trim()).filter(Boolean);
    return v.filter((m) => m === "card" || m === "bank" || m === "paypay");
  },
  get mailMode(): AdapterMode {
    return mode("MAIL_MODE");
  },
  get sendgridApiKey() {
    return need("SENDGRID_API_KEY", process.env.SENDGRID_API_KEY);
  },
  get mailFrom() {
    return need("MAIL_FROM", process.env.MAIL_FROM);
  },
  /** お問い合わせの届け先。未設定なら受け付けない（画面にその旨を出す） */
  get contactTo(): string | null {
    const v = (process.env.CONTACT_TO ?? "").trim();
    return v || null;
  },
  get isProduction() {
    return process.env.VERCEL_ENV === "production";
  },
};
