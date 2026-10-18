/* 管理画面の入口の確認と、管理画面だけで使う小道具（サーバーだけ）。

   ▼守り（28 §B1・§B6）
   ・管理者であること（admin_users）は requireAdmin()／actionAdmin() が確かめる。
   ・そのうえで、二段階認証（TOTP）を済ませたセッション（aal2）であることをここで確かめる。
     パスワードだけ盗まれても管理画面には入れない。
   ・aal はクッキーの中身をそのまま信じず、アクセストークンを Auth に照合してから読む（getAuthenticatorAssuranceLevel(jwt) が getUser(jwt) を呼ぶ）。
   ・/admin/mfa だけは requireAdmin()（aal1 で来て、ここで aal2 に上げる）。ほかの管理画面のページ・action は必ず requireAdminPage()／actionAdminStrict() を通す。
   ・RLS を通らない createServiceClient() は、これらの確認の後だけで使う。 */
import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { actionAdmin, ActionError, requireAdmin, type Viewer } from "@/lib/auth";
import { dbCode, throwDb, type DbError } from "@/lib/db-errors";
import { serverEnv } from "@/lib/env";
import { takeRateLimit } from "@/lib/rate-limit";
import type { LimitRule } from "@/lib/rate-limit-rules";
import { SITE_NAME } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import type { createServiceClient } from "@/lib/supabase/service";

type Service = ReturnType<typeof createServiceClient>;

/** 今のセッションの認証の強さ（aal1 / aal2）。読めないときは null。
    1回の表示・操作の中では1度だけ Auth に問い合わせる（ページと外枠の両方で確かめても重くしない） */
const sessionAal = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;
  // トークンを渡すと Auth に照合してから読む（クッキーを書き換えた aal2 を信じない）
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel(session.access_token);
  if (error || !data) return null;
  return data.currentLevel ?? null;
});

/** 二段階認証まで済んでいるか（/admin/mfa で「もう済んでいる」の判定に使う） */
export async function isAal2(): Promise<boolean> {
  return (await sessionAal()) === "aal2";
}

/** 管理画面のページの入口。管理者でなければ 404、二段階認証がまだなら /admin/mfa へ */
export async function requireAdminPage(): Promise<Viewer> {
  const v = await requireAdmin();
  if ((await sessionAal()) !== "aal2") redirect("/admin/mfa");
  return v;
}

/** 管理画面の server action の入口。管理者で、二段階認証まで済んだセッションだけ通す */
export async function actionAdminStrict(): Promise<Viewer> {
  const v = await actionAdmin();
  if ((await sessionAal()) !== "aal2") {
    throw new ActionError("二段階認証が切れました。画面を読み込み直して、認証コードを入れ直してください。");
  }
  return v;
}

/* ── 回数の上限（管理画面だけの枠。共通の表 RULES には無いのでここに置く） ── */

export const ADMIN_RULES = {
  // 認証コードの総当たり（6桁）を止める。打ち間違いで数回やり直す分は通す。
  mfa: { name: "admin.mfa", windowSec: 15 * 60, max: 10 },
  // 管理の操作。人の手では届かない数。乗っ取られたセッションでの一斉操作を止める。
  op: { name: "admin.op", windowSec: 10 * 60, max: 300 },
} as const satisfies Record<string, LimitRule>;

export async function adminLimit(rule: LimitRule, userId: string): Promise<void> {
  const d = await takeRateLimit([{ rule, kind: "user", id: userId }], { failClosed: true });
  if (!d.ok) throw new ActionError(d.message);
}

/* ── DB のエラー（管理画面の言い方に直す。知らない物は共通の表へ） ── */

const ADMIN_MESSAGES: Record<string, string> = {
  bad_state: "今の状態ではこの操作はできません（ほかの管理者が先に処理した可能性があります）。画面を読み込み直してください。",
  open_orders: "この利用者には取引中の注文があります。取引が終わってから行ってください。",
  payout_open: "この利用者には処理中の振込申請があります。先に振込申請を処理してください。",
  balance_left: "この利用者には売上の残高があります。先に振込か台帳の調整をしてください。",
  bad_kyc: "18歳未満にチェックを入れたまま承認はできません。",
  bad_request: "入力の内容を確かめてください（自分自身への操作はできません）。",
};

export function adminThrowDb(error: DbError, fallback?: string): void {
  if (!error) return;
  const code = dbCode(error);
  if (code && ADMIN_MESSAGES[code]) throw new ActionError(ADMIN_MESSAGES[code]);
  throwDb(error, fallback);
}

/* ── 画面の小道具 ── */

export const PAGE_SIZE = 20;

type SP = Record<string, string | string[] | undefined>;

/** searchParams の1つ（文字だけ。長すぎる物は切る） */
export function param(sp: SP, key: string, max = 100): string {
  const v = sp[key];
  const s = typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? "") : "";
  return s.trim().slice(0, max);
}

/** 決まった値のどれかなら、その値。それ以外は既定の値 */
export function pick<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** ?page= を 1 以上の整数に */
export function pageOf(sp: SP): number {
  const n = Number.parseInt(param(sp, "page", 6), 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 10_000) : 1;
}

export function rangeOf(page: number, size = PAGE_SIZE): [number, number] {
  const from = (page - 1) * size;
  return [from, from + size - 1];
}

/** 利用者の名前をまとめて引く（一覧の1行ごとに問い合わせない） */
export async function nicknamesOf(service: Service, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  const map = new Map<string, string>();
  for (let i = 0; i < uniq.length; i += 200) {
    const { data } = await service
      .from("profiles")
      .select("id, nickname")
      .in("id", uniq.slice(i, i + 200));
    for (const p of data ?? []) map.set(p.id, p.nickname);
  }
  return map;
}

/** 左のメニューの数（未処理の件数） */
export type NavCounts = { kyc: number; reports: number; held: number; roles: number; refunds: number; payouts: number };

export async function navCounts(service: Service): Promise<NavCounts> {
  const head = { count: "exact" as const, head: true };
  const [kyc, reports, posts, comments, messages, roles, refunds, payouts] = await Promise.all([
    service.from("kyc_applications").select("id", head).in("status", ["pending", "reviewing"]),
    service.from("reports").select("id", head).in("status", ["open", "reviewing"]),
    service.from("posts").select("id", head).eq("status", "held"),
    service.from("post_comments").select("id", head).eq("status", "held"),
    service.from("messages").select("id", head).eq("status", "held"),
    service.from("role_change_requests").select("id", head).eq("status", "pending"),
    service.from("orders").select("id", head).eq("needs_refund", true).is("refunded_at", null),
    service.from("payouts").select("id", head).eq("status", "requested"),
  ]);
  return {
    kyc: kyc.count ?? 0,
    reports: reports.count ?? 0,
    held: (posts.count ?? 0) + (comments.count ?? 0) + (messages.count ?? 0),
    roles: roles.count ?? 0,
    refunds: refunds.count ?? 0,
    payouts: payouts.count ?? 0,
  };
}

/** 本番なのにメールが mock（送らずに控えだけ）か。管理画面の上に警告を出す */
export function mailMockInProduction(): boolean {
  try {
    return serverEnv.isProduction && serverEnv.mailMode === "mock";
  } catch {
    // MAIL_MODE の値がおかしいときも警告を出す側に倒す
    return serverEnv.isProduction;
  }
}

/** 環境変数で決まる設定（管理画面では見るだけ）。鍵の値は出さず「設定あり／なし」だけ */
export type EnvRow = { label: string; value: string; ok: boolean };

function has(read: () => unknown): boolean {
  try {
    const v = read();
    return typeof v === "string" ? v.trim() !== "" : v != null;
  } catch {
    return false;
  }
}

function safeValue(read: () => string, fallback = "未設定"): string {
  try {
    return read();
  } catch {
    return fallback;
  }
}

export function envRows(): EnvRow[] {
  const mailMode = safeValue(() => serverEnv.mailMode, "値が不正");
  const paymentMode = safeValue(() => serverEnv.paymentMode, "値が不正");
  const kycMode = safeValue(() => serverEnv.kycMode, "値が不正");
  const keyRow = (label: string, read: () => unknown): EnvRow => {
    const ok = has(read);
    return { label, value: ok ? "設定あり" : "設定なし", ok };
  };
  return [
    { label: "サービス名", value: SITE_NAME, ok: true },
    { label: "本番の環境か", value: serverEnv.isProduction ? "本番" : "本番以外（プレビュー・手元）", ok: true },
    { label: "送信元メールアドレス", value: safeValue(() => serverEnv.mailFrom), ok: has(() => serverEnv.mailFrom) },
    { label: "メールの仕組み", value: mailMode === "live" ? "live（SendGrid で送る）" : mailMode === "mock" ? "mock（送らずに控えだけ残す）" : mailMode, ok: mailMode === "live" || mailMode === "mock" },
    keyRow("SendGrid の鍵", () => serverEnv.sendgridApiKey),
    { label: "お問い合わせの届け先", value: has(() => serverEnv.contactTo) ? "設定あり" : "設定なし（受け付けない）", ok: has(() => serverEnv.contactTo) },
    { label: "決済の仕組み", value: paymentMode === "live" ? "live（本物の決済）" : paymentMode === "mock" ? "mock（テスト決済）" : paymentMode, ok: paymentMode === "live" || paymentMode === "mock" },
    { label: "使える支払い方法", value: safeValue(() => serverEnv.paymentMethods.join("・") || "なし"), ok: true },
    keyRow("Stripe の鍵", () => serverEnv.stripeSecretKey),
    keyRow("Stripe の webhook の鍵", () => serverEnv.stripeWebhookSecret),
    keyRow("PayPay の鍵", () => serverEnv.paypayApiKey),
    { label: "PayPay の接続先", value: serverEnv.paypayProduction ? "本番" : "試験環境（sandbox）", ok: true },
    { label: "本人確認の仕組み", value: kycMode === "trustdock" ? "TRUSTDOCK" : kycMode === "manual" ? "manual（運営が書類を見る）" : kycMode, ok: kycMode === "manual" || kycMode === "trustdock" },
    keyRow("TRUSTDOCK の鍵", () => serverEnv.trustdockApiToken),
    keyRow("定期処理（cron）の鍵", () => serverEnv.cronSecret),
  ];
}

/** メールアドレスを伏せる（送信の控えの一覧用。a***@example.com） */
export function maskEmail(s: string | null | undefined): string {
  const v = (s ?? "").trim();
  const at = v.indexOf("@");
  if (at <= 0) return v ? "***" : "";
  return `${Array.from(v)[0]}***${v.slice(at)}`;
}

/** 生年月日から、今日（日本時間）の年齢 */
export function ageOf(birth: string | null | undefined): number | null {
  if (!birth || !/^\d{4}-\d{2}-\d{2}$/.test(birth)) return null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  const [by, bm, bd] = birth.split("-").map(Number) as [number, number, number];
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}
