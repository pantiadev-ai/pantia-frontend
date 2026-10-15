"use client";
/* 商品ページの右側: 値段・オプションの選択・合計・カート／購入のボタン。
   値段の計算は DB（quote_listing）だけが行う。選び直すたびにサーバーに聞き直し、画面では足し算しない。 */
import { useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addToCart } from "@/lib/actions/cart";
import { quoteListing } from "@/lib/actions/catalogue";
import { FormMessage, useAction } from "@/components/useAction";
import { yen } from "@/lib/format";
import MessageButton from "./MessageButton";
import type { Quote, QuoteOptions } from "./types";

/** buy: 購入者 / login: ログインしていない / seller: 出品者の役割 / own: 自分の出品 / unavailable: 売り切れ・非公開 */
export type PurchaseMode = "buy" | "login" | "seller" | "own" | "unavailable";

type AddKey = "photo" | "letter" | "anonymous" | "video";

type Props = {
  listingId: string;
  sellerId: string;
  mode: PurchaseMode;
  /** unavailable のときに出す理由 */
  unavailableText?: string;
  /** 標準の着用日数（null なら日数の欄を出さない） */
  wornDays: number | null;
  /** 日数を選び直せるか（opt_extend）。選べるのは 1〜maxDays */
  extendable: boolean;
  maxDays: number;
  extendFee: number;
  videoFee: number;
  anonymousFee: number;
  supports: Record<AddKey, boolean>;
  initialQuote: Quote | null;
  /** 見積もりが取れない（売り切れ・非公開）ときに出す、出品の値段 */
  fallbackPrice: number | null;
  kycApproved: boolean;
  requestOnly: boolean;
  /** メッセージのボタンを出すか（購入者・ログインしていない人だけ） */
  canMessage: boolean;
  loggedIn: boolean;
  /** 値段の下に並べる札（即日発送など。サーバーで作る） */
  badges: ReactNode;
};

const ADDS: { key: AddKey; label: string }[] = [
  { key: "photo", label: "📸 着用写真" },
  { key: "letter", label: "💌 手紙同封" },
  { key: "anonymous", label: "📦 匿名配送" },
  { key: "video", label: "🎬 着用動画" },
];

function dayLabel(d: number, standard: number, fee: number): string {
  if (d === standard) return `${d}日 (標準)`;
  if (d < standard) return `${d}日 (+¥0)`;
  return `${d}日 (+${yen((d - standard) * fee)})`;
}

export default function PurchasePanel(p: Props) {
  const router = useRouter();
  const [days, setDays] = useState<number | null>(p.wornDays);
  const [adds, setAdds] = useState<Record<AddKey, boolean>>({ photo: false, letter: false, anonymous: false, video: false });
  const [quote, setQuote] = useState<Quote | null>(p.initialQuote);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, startQuote] = useTransition();
  const seq = useRef(0);
  const cart = useAction();

  const selectable = p.mode !== "unavailable";
  const fee = (k: AddKey) => (k === "anonymous" ? p.anonymousFee : k === "video" ? p.videoFee : 0);

  function optionsOf(d: number | null, a: Record<AddKey, boolean>): QuoteOptions {
    const o: QuoteOptions = {};
    if (d !== null) o.worn_days = d;
    for (const k of Object.keys(a) as AddKey[]) if (a[k] && p.supports[k]) o[k] = true;
    return o;
  }

  function requote(d: number | null, a: Record<AddKey, boolean>) {
    setDays(d);
    setAdds(a);
    setQuoteError(null);
    cart.setError(null);
    cart.setMessage(null);
    // 押す速さに返事が追いつかないとき、古い返事で上書きしない
    const mine = ++seq.current;
    startQuote(async () => {
      try {
        const r = await quoteListing(p.listingId, optionsOf(d, a));
        if (mine !== seq.current) return;
        if (r.ok && r.data) setQuote(r.data);
        else if (!r.ok) setQuoteError(r.error);
      } catch {
        if (mine === seq.current) setQuoteError("値段を計算できませんでした。通信の良い所でもう一度お試しください。");
      }
    });
  }

  const opts = optionsOf(days, adds);
  const canOrder = p.mode === "buy" && !!quote && !quoteError && !quoting;

  // DB の listing_quote と同じ範囲: 延長できる出品は 1〜上限、できない出品は標準の日数だけ
  const std = p.wornDays;
  const dayChoices: number[] = [];
  if (std !== null) {
    if (p.extendable) for (let d = 1; d <= Math.max(p.maxDays, std); d++) dayChoices.push(d);
    else dayChoices.push(std);
  }

  const breakdown =
    quote && (quote.wornSurcharge || quote.videoFee || quote.anonymousFee)
      ? [
          `本体 ${yen(quote.basePrice)}`,
          quote.wornSurcharge ? `日数の延長 ${yen(quote.wornSurcharge)}` : "",
          quote.videoFee ? `動画 ${yen(quote.videoFee)}` : "",
          quote.anonymousFee ? `匿名配送 ${yen(quote.anonymousFee)}` : "",
        ]
          .filter(Boolean)
          .join(" ＋ ")
      : "";

  return (
    <>
      <div className="item-price-row">
        <div className="item-price">{quote ? yen(quote.subtotal) : p.fallbackPrice != null ? yen(p.fallbackPrice) : "価格は相談"}</div>
        {quote || p.fallbackPrice != null ? <div className="item-price-tax">税込</div> : null}
      </div>
      {p.badges}

      {selectable && (dayChoices.length > 0 || ADDS.some((a) => p.supports[a.key])) ? (
        <div className="options-card">
          <div className="opt-title">オプションを選択</div>
          {dayChoices.length > 0 && std !== null ? (
            <div className="opt-group">
              <div className="opt-label">
                着用日数
                <span className="opt-required">必須</span>
              </div>
              <div className="opt-chips" role="radiogroup" aria-label="着用日数">
                {dayChoices.map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={days === d}
                    className={`opt-chip${days === d ? " selected" : ""}`}
                    onClick={() => days !== d && requote(d, adds)}
                  >
                    {dayLabel(d, std, p.extendFee)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="opt-group">
            <div className="opt-label">
              追加オプション
              <span className="opt-optional">任意・複数可</span>
            </div>
            <div className="opt-chips">
              {ADDS.map((a) => {
                const ok = p.supports[a.key];
                const on = ok && adds[a.key];
                const f = fee(a.key);
                return (
                  <button
                    key={a.key}
                    type="button"
                    aria-pressed={on}
                    disabled={!ok}
                    title={ok ? undefined : "この商品では選べません"}
                    className={`opt-chip${on ? " selected" : ""}${ok ? "" : " disabled"}`}
                    onClick={() => ok && requote(days, { ...adds, [a.key]: !adds[a.key] })}
                  >
                    {a.label} ({ok ? (f ? `+${yen(f)}` : "無料") : "対応なし"})
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      <div className="purchase-card">
        <div className="purchase-total">
          <span className="pt-label">合計金額</span>
          <span className="pt-price" aria-live="polite">
            {quoting ? "計算中…" : quote ? yen(quote.total) : "—"}
          </span>
        </div>
        {breakdown ? <div className="purchase-note">🧾 <span>{breakdown}</span></div> : null}
        {quoteError ? (
          <p className="pt-msg error" role="alert">
            {quoteError}
          </p>
        ) : null}

        {p.requestOnly && p.mode !== "own" && p.mode !== "unavailable" ? (
          <div className="cat-notice info">
            この商品は購入の前に、出品者へメッセージでの相談が必要です。希望の内容を伝えてから購入してください。
          </div>
        ) : null}

        {p.mode === "buy" ? (
          <>
            {!p.kycApproved ? (
              <div className="cat-notice">
                購入には本人確認（18歳以上の確認）が必要です。カートには先に入れておけます。
              </div>
            ) : null}
            {p.kycApproved ? (
              <button
                type="button"
                className="btn-buy"
                disabled={!canOrder || cart.pending}
                onClick={() => cart.run(() => addToCart(p.listingId, opts), () => router.push(`/checkout?items=${p.listingId}`))}
              >
                💳 今すぐ購入する
              </button>
            ) : (
              <Link href="/kyc" className="btn-buy">
                🛡 本人確認をする
              </Link>
            )}
            <button type="button" className="btn-cart" disabled={!canOrder || cart.pending} onClick={() => cart.run(() => addToCart(p.listingId, opts))}>
              🛍 カートに入れる
            </button>
            <FormMessage error={cart.error} message={cart.message} />
            {cart.message ? (
              <div className="purchase-note">
                🛒{" "}
                <span>
                  <Link href="/cart">カートを見る</Link>
                </span>
              </div>
            ) : null}
          </>
        ) : null}

        {p.mode === "login" ? (
          <>
            <Link href={`/auth?next=${encodeURIComponent(`/items/${p.listingId}`)}`} className="btn-buy">
              💳 ログインして購入する
            </Link>
            <Link href={`/auth?next=${encodeURIComponent(`/items/${p.listingId}`)}`} className="btn-cart">
              🛍 ログインしてカートに入れる
            </Link>
          </>
        ) : null}

        {p.mode === "seller" ? (
          <div className="cat-notice">出品者のアカウントでは購入できません。購入には購入者のアカウントが必要です。</div>
        ) : null}

        {p.mode === "own" ? (
          <>
            <div className="cat-notice info">あなたの出品です。</div>
            <Link href={`/listings/${p.listingId}/edit`} className="btn-buy">
              ✏️ 編集する
            </Link>
          </>
        ) : null}

        {p.mode === "unavailable" ? (
          <>
            <div className="cat-notice">{p.unavailableText ?? "この商品は今は購入できません。"}</div>
            <button type="button" className="btn-buy" disabled>
              購入できません
            </button>
          </>
        ) : null}

        {p.requestOnly && p.canMessage && (p.mode === "buy" || p.mode === "login") ? (
          <MessageButton sellerId={p.sellerId} loggedIn={p.loggedIn} className="btn-cart" label="✉ 出品者に相談する" />
        ) : null}

        <div className="purchase-notes">
          <div className="purchase-note">
            🔒 <span>決済はクレジットカード・PayPay・銀行振込に対応しています</span>
          </div>
          <div className="purchase-note">
            📦 <span>発送後に追跡番号をお知らせします</span>
          </div>
          <div className="purchase-note">
            ⚠️ <span>商品の性質上、発送後の返品はお受けできません</span>
          </div>
        </div>
      </div>
    </>
  );
}
