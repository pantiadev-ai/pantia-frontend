/* 回数の上限のルール。**DBに触らない部分だけをここに置く**（テストから読めるように）。
   数えるのは DB（supabase/migrations の rate_limit_take）。呼ぶのは ./rate-limit.ts。
   手本は hudousan-tool・窓リノベPRO の rate-limit-rules.ts（表と関数は同じ）。

   ▼なぜ要るか（28 §B7）
   ログインはサーバーから Supabase Auth を呼ぶので、Auth から見えるのは Vercel のIPだけ。
   攻撃者ごとに止められないので、DB の台帳で数える。

   ▼枠の並べ方
   狭い枠（メールアドレス・利用者）を先に、広い枠（IP）を後に並べる。
   DB側は最初に超えた枠で止まるので、1つのアドレスの連打が IP の枠まで食い潰さない。 */

import { createHash } from "node:crypto";

const MIN = 60;
const HOUR = 60 * MIN;

export type LimitRule = {
  /** 台帳の名前の頭。**変えると数え直しになる** */
  name: string;
  windowSec: number;
  max: number;
};

/** 数が決まった理由は各行に書く。変えるときは理由も書き換えること。 */
export const RULES = {
  // 打ち間違いで数回やり直す人は通す。1つのアカウントへの総当たりは15分10回で止める。
  loginEmail: { name: "login.email", windowSec: 15 * MIN, max: 10 },
  // 同じ回線から家族・寮などで続けてログインしても通る数。多数のアカウントへの総当たりは止める。
  loginIp: { name: "login.ip", windowSec: 15 * MIN, max: 40 },
  // 登録は1つの回線から1時間に5件まで（捨てアカウントの量産を止める）。
  signupIp: { name: "signup.ip", windowSec: HOUR, max: 5 },
  // 再設定のメールは1つのアドレスに1時間3通まで（他人のメール箱を埋める嫌がらせを止める）。
  resetEmail: { name: "reset.email", windowSec: HOUR, max: 3 },
  resetIp: { name: "reset.ip", windowSec: HOUR, max: 10 },
  // チャットは会話が続いても困らない数。業者の一斉送信は止める。
  messageUser: { name: "message.user", windowSec: MIN, max: 20 },
  // つぶやきは連投を止める。
  postUser: { name: "post.user", windowSec: 10 * MIN, max: 10 },
  // コメント・レビューは連投を止める。
  commentUser: { name: "comment.user", windowSec: 10 * MIN, max: 30 },
  // 出品は1日50件まで（量産の業者を止める。普通の出品者はまず届かない）。
  listingUser: { name: "listing.user", windowSec: 24 * HOUR, max: 50 },
  // 通報は1時間20件まで（嫌がらせの大量通報を止める）。
  reportUser: { name: "report.user", windowSec: HOUR, max: 20 },
  // 本人確認の提出は1日5回まで（書類の差し替えは数回で足りる）。
  kycUser: { name: "kyc.user", windowSec: 24 * HOUR, max: 5 },
  // 購入の手続きは10分10回まで（カードの当てずっぽう試しを止める）。
  checkoutUser: { name: "checkout.user", windowSec: 10 * MIN, max: 10 },
  // 振込申請は1日3回まで。
  payoutUser: { name: "payout.user", windowSec: 24 * HOUR, max: 3 },
  // 画像の上げ直しは10分60枚まで。
  uploadUser: { name: "upload.user", windowSec: 10 * MIN, max: 60 },
  // フォロー・いいねの連打（業者の自動フォロー）を止める。普通の操作では届かない。
  reactUser: { name: "react.user", windowSec: 10 * MIN, max: 200 },
  // お問い合わせは1つの回線から1時間5件まで（運営のメール箱を埋める嫌がらせを止める）。
  contactIp: { name: "contact.ip", windowSec: HOUR, max: 5 },
  // ログイン中のお問い合わせは1日10件まで。
  contactUser: { name: "contact.user", windowSec: 24 * HOUR, max: 10 },
  // PayPay の通知は署名が無く、届くたびに PayPay へ聞き直す。1つの回線から10分300回まで（PayPay の再送は届かない数。
  // 偽の通知の連打で PayPay への問い合わせ枠を食い潰させない）。
  paypayHookIp: { name: "hook.paypay.ip", windowSec: 10 * MIN, max: 300 },
  // 決済から戻った画面・注文の画面を開くたびに決済会社へ聞き直す。1人10分60回まで（読み込み直しの連打で問い合わせ枠を食い潰させない）。
  paySyncUser: { name: "paysync.user", windowSec: 10 * MIN, max: 60 },
  // プロフィールの保存は10分30回まで（画像の差し替えを数回やり直しても届かない数）。
  profileUser: { name: "profile.user", windowSec: 10 * MIN, max: 30 },
  // 出品の公開・非公開・削除の切り替えは1時間120回まで（まとめて切り替える出品者は通し、自動の連打は止める）。
  listingStatusUser: { name: "listing.status.user", windowSec: HOUR, max: 120 },
  // 振込先の口座の登録・変更は1日10回まで（他人の口座を次々に試す使い方を止める）。
  bankUser: { name: "bank.user", windowSec: 24 * HOUR, max: 10 },
  // パスワードの変更（再設定のメールから・設定の画面から）は1時間5回まで。
  passwordUser: { name: "password.user", windowSec: HOUR, max: 5 },
  // 商品ページの見積もり（オプションを押すたびに1回）。普通に選ぶ人は10分で数十回。機械での総当たりだけを止める。
  quoteUser: { name: "quote.user", windowSec: 10 * MIN, max: 300 },
  // ログインしていない人も見積もれるので、回線でも数える（同じ回線の複数人を考えて本人の倍）。
  quoteIp: { name: "quote.ip", windowSec: 10 * MIN, max: 600 },
  // カートに入れる・オプションの変更は10分120回まで（カートは30点まで。入れ直しの連打で DB を叩かせない）。
  cartUser: { name: "cart.user", windowSec: 10 * MIN, max: 120 },
  // 商品の閲覧数は、同じ回線・同じ商品で6時間に1回だけ数える（読み込み直しの連打で数を水増しさせない）。
  viewIpListing: { name: "view.ip", windowSec: 6 * HOUR, max: 1 },
} as const satisfies Record<string, LimitRule>;

export type LimitCheck = { rule: LimitRule; kind: "ip" | "email" | "user"; id: string };

export type LimitDecision =
  | { ok: true }
  | { ok: false; reason: "limited" | "unavailable"; retryAfter: number; message: string };

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** 台帳に入れる名前。IP・メールアドレスは**そのまま入れない**（ハッシュの先頭32字だけ）。 */
export function bucketKey(c: LimitCheck): string {
  return `${c.rule.name}:${c.kind}:${sha(c.id.trim().toLowerCase()).slice(0, 32)}`;
}

export function tooManyMessage(retryAfter: number): string {
  const wait =
    retryAfter < MIN ? `${retryAfter}秒` : retryAfter < HOUR ? `${Math.ceil(retryAfter / MIN)}分` : `${Math.ceil(retryAfter / HOUR)}時間`;
  return `短い時間に操作が続いています。${wait}ほどおいて、もう一度お試しください。`;
}

type HeaderLike = { get(name: string): string | null };

/** 呼び手のIP。Vercel が付ける見出しを先に見る（利用者が書き換えられる x-forwarded-for は最後）。
    IPv6 は /64 にまとめる（1台が1つの /64 を丸ごと持つことが多く、末尾を変えるだけで枠を抜けられるため）。 */
export function clientIp(h: HeaderLike): string {
  // 空の見出しは「無い」と同じに扱う（?? だと空文字で止まり、次を見ない）
  const raw =
    h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip")?.trim() ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "";
  return normalizeIp(raw.trim());
}

function normalizeIp(ip: string): string {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1]!;
  if (!/^[0-9a-f:]{2,39}$/i.test(ip) || !ip.includes(":")) return "";
  const groups = expandV6(ip.toLowerCase());
  return groups ? `${groups.slice(0, 4).join(":")}::/64` : "";
}

function expandV6(ip: string): string[] | null {
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const all = [...head, ...Array<string>(fill).fill("0"), ...tail];
  if (all.length !== 8 || all.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return all.map((g) => g.replace(/^0+(?=.)/, ""));
}
