"use client";
/* 注文の詳細の操作。出品者: 発送の準備・発送の連絡・取り消し／購入者: 受け取り・レビュー。
   出せるかどうかは画面が決めるが、本当の確認は DB の関数（状態・当事者）がする */
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FormMessage, useAction } from "@/components/useAction";
import { startThread } from "@/lib/actions/chat";
import { completeOrder, postReview, prepareOrder, sellerCancelOrder, shipOrder } from "@/lib/actions/orders";
import { CARRIERS } from "@/lib/labels";

export function SellerActions({ orderId, status }: { orderId: string; status: string }) {
  const router = useRouter();
  const { pending, error, message, run, setError } = useAction();
  const [carrier, setCarrier] = useState<string>("");
  const [tracking, setTracking] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const refresh = () => router.refresh();

  function ship(e: FormEvent) {
    e.preventDefault();
    if (!carrier) return setError("配送会社を選んでください。");
    if (!tracking.trim()) return setError("追跡番号を入れてください。");
    if (!window.confirm("発送の連絡をします。購入者にお知らせが届きます。よろしいですか？")) return;
    run(() => shipOrder(orderId, carrier, tracking), refresh);
  }

  function cancel(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return setError("取り消す理由を書いてください。");
    if (!window.confirm("この注文を取り消して、購入者に全額を返金します。元に戻せません。よろしいですか？")) return;
    run(() => sellerCancelOrder(orderId, reason.trim()), refresh);
  }

  return (
    <div className="card">
      <h2 className="section-title">出品者の手続き</h2>
      <FormMessage error={error} message={message} />
      {status === "paid" && (
        <div className="stack">
          <p className="sub">支払いが済みました。発送の準備を始めたら、購入者に知らせましょう。</p>
          <button type="button" className="btn" disabled={pending} onClick={() => run(() => prepareOrder(orderId), refresh)}>
            発送の準備を始める
          </button>
        </div>
      )}
      {(status === "paid" || status === "preparing") && (
        <>
          <hr className="divider" />
          <form className="stack" onSubmit={ship} noValidate>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="ship-carrier">
                  配送会社<span className="req">必須</span>
                </label>
                <select id="ship-carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)}>
                  <option value="">選んでください</option>
                  {CARRIERS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="ship-tracking">
                  追跡番号<span className="req">必須</span>
                </label>
                <input
                  id="ship-tracking"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  maxLength={40}
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value)}
                />
                <p className="hint">英数字とハイフン（4〜30文字）。</p>
              </div>
            </div>
            <button type="submit" className="btn primary" disabled={pending}>
              発送を連絡する
            </button>
          </form>
          <hr className="divider" />
          {cancelOpen ? (
            <form className="stack" onSubmit={cancel} noValidate>
              <div className="field">
                <label htmlFor="cancel-reason">
                  取り消す理由<span className="req">必須</span>
                </label>
                <textarea id="cancel-reason" rows={3} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
                <p className="hint">購入者に見えます（200文字まで）。取り消すと全額を返金し、商品は非公開に戻ります。</p>
              </div>
              <div className="row wrap">
                <button type="submit" className="btn danger" disabled={pending}>
                  取り消して返金する
                </button>
                <button type="button" className="btn" disabled={pending} onClick={() => setCancelOpen(false)}>
                  やめる
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="link-btn" onClick={() => setCancelOpen(true)}>
              この注文を取り消す（在庫切れなど）
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function BuyerReceive({ orderId, autoCompleteNote }: { orderId: string; autoCompleteNote: string }) {
  const router = useRouter();
  const { pending, error, message, run } = useAction();
  return (
    <div className="card">
      <h2 className="section-title">受け取りの手続き</h2>
      <p className="sub">商品が届いて中身を確かめたら、受け取りを連絡してください。出品者に売上が入ります。</p>
      <p className="hint">{autoCompleteNote}</p>
      <FormMessage error={error} message={message} />
      <button
        type="button"
        className="btn primary"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("受け取りを連絡して、取引を完了します。よろしいですか？")) return;
          run(() => completeOrder(orderId), () => router.refresh());
        }}
      >
        受け取りました
      </button>
    </div>
  );
}

export function ReviewForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { pending, error, message, run, setError } = useAction();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (rating < 1) return setError("星の数を選んでください。");
    run(() => postReview(orderId, rating, body.trim()), () => router.refresh());
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <h2 className="section-title">レビューを書く</h2>
      <div className="field">
        <span id="rv-rating">評価</span>
        <div className="row" role="radiogroup" aria-labelledby="rv-rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`星${n}つ`}
              className={`btn small${rating >= n ? " primary" : ""}`}
              onClick={() => setRating(n)}
            >
              ★
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="rv-body">感想（任意・500文字まで）</label>
        <textarea id="rv-body" rows={4} maxLength={500} value={body} onChange={(e) => setBody(e.target.value)} />
        <p className="hint">出品者のページなどに表示されます。送ったあとは直せません。</p>
      </div>
      <FormMessage error={error} message={message} />
      <button type="submit" className="btn primary" disabled={pending}>
        レビューを送る
      </button>
    </form>
  );
}

export function ContactButton({ otherUserId, label }: { otherUserId: string; label: string }) {
  const { pending, error, run } = useAction();
  return (
    <>
      <button type="button" className="btn small" disabled={pending} onClick={() => run(() => startThread(otherUserId))}>
        {label}
      </button>
      <FormMessage error={error} />
    </>
  );
}
