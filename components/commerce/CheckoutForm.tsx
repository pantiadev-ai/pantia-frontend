"use client";
/* お届け先と支払い方法を入れて注文する。サーバーが注文を作り、決済会社の画面の URL を返すので、そこへ移る */
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { PREFECTURES } from "@/components/account/options";
import { FormMessage, useAction } from "@/components/useAction";
import { placeOrder } from "@/lib/actions/checkout";

export type AddressValue = { name: string; postal: string; prefecture: string; address1: string; address2: string; phone: string };
export type MethodChoice = { value: "card" | "bank" | "paypay" | "mock"; label: string; note: string };

const EMPTY: AddressValue = { name: "", postal: "", prefecture: "", address1: "", address2: "", phone: "" };

export default function CheckoutForm({
  listingIds,
  methods,
  initialAddress,
  closed,
}: {
  listingIds: string[];
  methods: MethodChoice[];
  initialAddress: AddressValue | null;
  /** メンテナンス中など、受け付けないとき */
  closed: boolean;
}) {
  const { pending, error, message, run, setError } = useAction();
  const [addr, setAddr] = useState<AddressValue>(initialAddress ?? EMPTY);
  const [method, setMethod] = useState<MethodChoice["value"] | "">(methods.length === 1 ? methods[0]!.value : "");
  const [save, setSave] = useState(initialAddress === null);
  const [agree, setAgree] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const set = (k: keyof AddressValue) => (e: { target: { value: string } }) => setAddr((a) => ({ ...a, [k]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!method) {
      setError("支払い方法を選んでください。");
      return;
    }
    if (!agree) {
      setError("利用規約と特定商取引法に基づく表記を確かめて、チェックを入れてください。");
      return;
    }
    run(
      () => placeOrder({ listingIds, method, address: addr, saveAddress: save }),
      (data) => {
        if (!data?.url) return;
        setLeaving(true);
        window.location.assign(data.url);
      },
    );
  }

  const busy = pending || leaving;
  return (
    <form className="card" onSubmit={submit} noValidate>
      <h2 className="section-title">お届け先</h2>
      <div className="field">
        <label htmlFor="co-name">
          お名前<span className="req">必須</span>
        </label>
        <input id="co-name" type="text" autoComplete="name" maxLength={30} value={addr.name} onChange={set("name")} required />
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="co-postal">
            郵便番号<span className="req">必須</span>
          </label>
          <input
            id="co-postal"
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="123-4567"
            maxLength={8}
            value={addr.postal}
            onChange={set("postal")}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="co-pref">
            都道府県<span className="req">必須</span>
          </label>
          <select id="co-pref" autoComplete="address-level1" value={addr.prefecture} onChange={set("prefecture")} required>
            <option value="">選んでください</option>
            {PREFECTURES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="co-addr1">
          市区町村・番地<span className="req">必須</span>
        </label>
        <input id="co-addr1" type="text" autoComplete="address-line1" maxLength={100} value={addr.address1} onChange={set("address1")} required />
      </div>
      <div className="field">
        <label htmlFor="co-addr2">建物名・部屋番号</label>
        <input id="co-addr2" type="text" autoComplete="address-line2" maxLength={100} value={addr.address2} onChange={set("address2")} />
      </div>
      <div className="field">
        <label htmlFor="co-phone">
          電話番号<span className="req">必須</span>
        </label>
        <input id="co-phone" type="tel" autoComplete="tel" placeholder="09012345678" maxLength={15} value={addr.phone} onChange={set("phone")} required />
        <p className="hint">配送の連絡にだけ使います。匿名配送のときは、出品者には見えません。</p>
      </div>
      <label className="check">
        <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
        <span>このお届け先を次回のために保存する</span>
      </label>

      <hr className="divider" />
      <h2 className="section-title">お支払い方法</h2>
      {methods.length === 0 ? (
        <p className="notice warn">ただいま購入を受け付けていません。時間をおいてお試しください。</p>
      ) : (
        <div className="stack" role="radiogroup" aria-label="お支払い方法">
          {methods.map((m) => (
            <label className="check" key={m.value}>
              <input type="radio" name="method" value={m.value} checked={method === m.value} onChange={() => setMethod(m.value)} />
              <span>
                <span className="strong">{m.label}</span>
                <span className="hint" style={{ display: "block" }}>
                  {m.note}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}

      <hr className="divider" />
      <label className="check">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>
          <Link href="/terms" target="_blank">
            利用規約
          </Link>
          と
          <Link href="/legal" target="_blank">
            特定商取引法に基づく表記
          </Link>
          を確かめました。商品の性質上、お届け後の返品はできません。
        </span>
      </label>
      <FormMessage error={error} message={message} />
      <button type="submit" className="btn primary block" disabled={busy || closed || methods.length === 0}>
        {leaving ? "お支払いの画面へ移動しています…" : pending ? "注文を作っています…" : "注文を確定してお支払いへ"}
      </button>
    </form>
  );
}
