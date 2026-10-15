"use client";
/* カートの中身。買うものを選んで購入の手続きへ（1回に10点まで）。値段はサーバーが DB で見積もった値を出すだけ */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormMessage, useAction } from "@/components/useAction";
import { removeFromCart } from "@/lib/actions/cart";
import { yen } from "@/lib/format";

export type CartRow = {
  listingId: string;
  title: string;
  imageUrl: string | null;
  sellerName: string;
  optionText: string[];
  total: number | null;
  problem: string | null;
};

export default function CartList({ rows, max, canBuy }: { rows: CartRow[]; max: number; canBuy: boolean }) {
  const router = useRouter();
  const { pending, error, message, run, setError } = useAction();
  const buyable = rows.filter((r) => !r.problem && r.total !== null);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(buyable.slice(0, max).map((r) => r.listingId)));
  const chosen = buyable.filter((r) => picked.has(r.listingId));
  const sum = chosen.reduce((s, r) => s + (r.total ?? 0), 0);

  function toggle(id: string) {
    setError(null);
    if (!picked.has(id) && picked.size >= max) {
      setError(`1回に購入できるのは${max}点までです。`);
      return;
    }
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function remove(id: string) {
    run(
      () => removeFromCart(id),
      () => {
        setPicked((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        router.refresh();
      },
    );
  }

  function proceed() {
    if (chosen.length === 0) {
      setError("購入する商品を選んでください。");
      return;
    }
    router.push(`/checkout?items=${chosen.map((r) => r.listingId).join(",")}`);
  }

  return (
    <div className="grid-side">
      <div className="card">
        {rows.map((r) => (
          <div className="list-row" key={r.listingId}>
            <input
              type="checkbox"
              aria-label={`${r.title}を購入する`}
              checked={picked.has(r.listingId)}
              disabled={!!r.problem || pending}
              onChange={() => toggle(r.listingId)}
            />
            {r.imageUrl ? (
              <img className="thumb" src={r.imageUrl} alt="" />
            ) : (
              <span className="thumb" aria-hidden="true" />
            )}
            <div className="grow">
              <Link className="strong ellipsis" href={`/items/${r.listingId}`}>
                {r.title}
              </Link>
              <div className="muted">
                {r.sellerName}
                {r.optionText.length > 0 && `　${r.optionText.join("・")}`}
              </div>
              {r.problem ? <div className="chip danger">{r.problem}</div> : <div className="price">{yen(r.total)}</div>}
            </div>
            <button type="button" className="btn small" disabled={pending} onClick={() => remove(r.listingId)}>
              削除
            </button>
          </div>
        ))}
      </div>
      <aside className="card">
        <h2 className="section-title">お支払い金額</h2>
        <div className="row between">
          <span className="sub">選んだ商品（{chosen.length}点）</span>
          <span className="price">{yen(sum)}</span>
        </div>
        <p className="hint">オプションを変えるときは、商品のページで選び直してカートに入れてください。</p>
        <hr className="divider" />
        <FormMessage error={error} message={message} />
        {canBuy ? (
          <button type="button" className="btn primary block" disabled={pending || chosen.length === 0} onClick={proceed}>
            購入手続きへ
          </button>
        ) : (
          <p className="notice warn">購入は、本人確認（18歳以上の確認）が済んだ購入者のアカウントでできます。</p>
        )}
      </aside>
    </div>
  );
}
