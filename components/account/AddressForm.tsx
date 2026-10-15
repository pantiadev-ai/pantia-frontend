"use client";
/* お届け先（1件）。購入の手続きで初期値に使われる */
import { useState } from "react";
import { deleteAddress, saveAddress } from "@/lib/actions/account";
import { FormMessage, useAction } from "@/components/useAction";
import { PREFECTURES } from "@/components/account/options";

export type SavedAddress = {
  name: string;
  postal: string;
  prefecture: string;
  address1: string;
  address2: string | null;
  phone: string;
};

const EMPTY = { name: "", postal: "", prefecture: "", address1: "", address2: "", phone: "" };

export default function AddressForm({ initial }: { initial: SavedAddress | null }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(initial ? { ...initial, address2: initial.address2 ?? "" } : EMPTY);
  const { pending, error, message, run } = useAction();
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-name">お届け先</div>
          <div className="setting-desc">
            {initial
              ? `〒${initial.postal} ${initial.prefecture}${initial.address1}${initial.address2 ? ` ${initial.address2}` : ""}（${initial.name}）`
              : "未登録です。購入の手続きで入力した住所を、ここに保存しておけます。"}
          </div>
        </div>
        <button type="button" className="setting-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "閉じる" : initial ? "変更" : "登録"}
        </button>
      </div>
      {!open && message && <FormMessage message={message} />}
      {open && (
        <form
          className="acc-form"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveAddress(f), () => setOpen(false));
          }}
        >
          <div className="acc-grid">
            <label className="acc-field">
              <span className="acc-label">
                氏名<span className="acc-req">必須</span>
              </span>
              <input className="acc-input" autoComplete="name" required maxLength={30} value={f.name} onChange={set("name")} />
            </label>
            <label className="acc-field">
              <span className="acc-label">
                電話番号<span className="acc-req">必須</span>
              </span>
              <input
                className="acc-input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                maxLength={20}
                placeholder="09012345678"
                value={f.phone}
                onChange={set("phone")}
              />
            </label>
            <label className="acc-field">
              <span className="acc-label">
                郵便番号<span className="acc-req">必須</span>
              </span>
              <input
                className="acc-input"
                inputMode="numeric"
                autoComplete="postal-code"
                required
                maxLength={8}
                placeholder="123-4567"
                value={f.postal}
                onChange={set("postal")}
              />
            </label>
            <label className="acc-field">
              <span className="acc-label">
                都道府県<span className="acc-req">必須</span>
              </span>
              <select className="acc-input" autoComplete="address-level1" required value={f.prefecture} onChange={set("prefecture")}>
                <option value="">選んでください</option>
                {PREFECTURES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="acc-field acc-wide">
              <span className="acc-label">
                市区町村・番地<span className="acc-req">必須</span>
              </span>
              <input
                className="acc-input"
                autoComplete="address-line1"
                required
                maxLength={100}
                value={f.address1}
                onChange={set("address1")}
              />
            </label>
            <label className="acc-field acc-wide">
              <span className="acc-label">建物名・部屋番号</span>
              <input className="acc-input" autoComplete="address-line2" maxLength={100} value={f.address2} onChange={set("address2")} />
            </label>
          </div>
          <p className="acc-note">電話番号はハイフンがあっても無くても大丈夫です。お届け先は出品者に伝わります（匿名配送を選んだときを除く）。</p>
          <FormMessage error={error} message={message} />
          <div className="acc-actions">
            {initial && (
              <button
                type="button"
                className="pt-btn acc-danger"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm("保存したお届け先を消しますか？")) return;
                  run(
                    () => deleteAddress(),
                    () => {
                      setF(EMPTY);
                      setOpen(false);
                    },
                  );
                }}
              >
                消す
              </button>
            )}
            <button type="submit" className="pt-btn primary" disabled={pending}>
              {pending ? "保存中…" : "保存する"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
