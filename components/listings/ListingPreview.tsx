"use client";
/* 出品フォームの「プレビュー確認」で出す、購入者から見た商品ページに近い形。
   入力中の内容（まだ保存していない物）をそのまま並べる。値段は見込みで、本当の値段は購入のときに DB が決める。 */
import { useState, type RefObject } from "react";
import type { UploadedImage } from "@/components/ImageUploader";
import type { ListingFormValues } from "@/components/listings/ListingForm";
import { CATEGORIES, COLORS, MATERIALS, SHIP_ESTIMATES, SIZES, labelOf } from "@/lib/labels";
import type { PaidOption } from "@/lib/paid-options";

type Props = {
  values: ListingFormValues;
  images: UploadedImage[];
  /** 決まりに合う価格（合わなければ null） */
  price: number | null;
  /** 有料オプション（決まりに合う物だけ） */
  extras: PaidOption[];
  sellerName: string;
  videoFee: number;
  extendFeePerDay: number;
  /** 出品（公開）にまだ足りない項目 */
  missing: string[];
  onBack: () => void;
  /** 開いたときに読み上げの位置を移す先（見出し） */
  headingRef: RefObject<HTMLHeadingElement | null>;
};

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

export default function ListingPreview({
  values: f,
  images,
  price,
  extras,
  sellerName,
  videoFee,
  extendFeePerDay,
  missing,
  onBack,
  headingRef,
}: Props) {
  const [shown, setShown] = useState(0);
  const main = images[Math.min(shown, images.length - 1)];
  const category = CATEGORIES.find((c) => c.value === f.category);

  const badges = [
    f.same_day && "⚡ 即日発送",
    f.opt_photo && "📸 写真付き",
    f.anonymous_ok && "📦 匿名配送可",
    f.opt_letter && "💌 手紙同封",
    f.opt_video && "🎬 動画対応",
    f.pre_message_ok && "💬 事前相談OK",
    f.cool_shipping && "❄️ 冷凍便",
    f.followers_only && "🔒 フォロワー限定",
  ].filter((b): b is string => !!b);

  const free = [
    f.opt_photo && "着用写真",
    f.opt_letter && "手紙同封",
    f.opt_ziplock && "ジップロック",
    f.opt_card && "メッセージカード",
  ].filter((b): b is string => !!b);

  const paid: { name: string; price: string }[] = [];
  if (f.opt_video) paid.push({ name: "🎬 着用動画", price: `+${yen(videoFee)}` });
  if (f.opt_extend && f.worn_days !== null && f.max_worn_days !== null && f.max_worn_days > f.worn_days) {
    paid.push({ name: `📅 着用日数の延長（${f.max_worn_days}日まで）`, price: `+${yen(extendFeePerDay)}/日` });
  }
  for (const x of extras) paid.push({ name: x.name, price: `+${yen(x.price)}` });

  const worn =
    f.worn_days === null
      ? "—"
      : f.opt_extend && f.max_worn_days !== null && f.max_worn_days > f.worn_days
        ? `${f.worn_days}日（${f.max_worn_days}日まで延長可）`
        : `${f.worn_days}日`;

  const rows: [string, string][] = [
    ["カテゴリ", category?.label ?? "—"],
    ["着用日数", worn],
    ["素材", labelOf(MATERIALS, f.material) || "—"],
    ["色", labelOf(COLORS, f.color) || "—"],
    ["サイズ", labelOf(SIZES, f.size) || "—"],
    ["発送方法", [f.anonymous_ok ? "匿名配送可" : "通常配送", f.cool_shipping ? "冷凍便" : ""].filter(Boolean).join(" / ")],
    ["発送目安", labelOf(SHIP_ESTIMATES, f.ship_estimate) || "—"],
    ["在庫", f.stock_mode === "multiple" ? "複数あり" : "1点のみ"],
  ];

  return (
    <div className="form-section lf-pv">
      <div className="lf-pv-banner">
        <h2 className="lf-pv-heading" ref={headingRef} tabIndex={-1}>
          👁 プレビュー確認
        </h2>
        <p>
          購入者には、このように見えます。入力中の内容で出しているので、保存・出品するまで商品ページは変わりません。
        </p>
        <button type="button" className="lf-pv-back" onClick={onBack}>
          ← 編集に戻る
        </button>
      </div>

      {missing.length > 0 && (
        <div className="lf-kyc-note">出品するには、あと「{missing.join("・")}」を入れてください。</div>
      )}

      <div className="form-card">
        <div className="lf-pv-gallery">
          <div className="lf-pv-main">
            {main ? (
              <img src={main.url} alt={f.title.trim() || "商品の写真"} />
            ) : (
              <span className="lf-noimg" aria-hidden="true">
                {category?.icon ?? "📷"}
              </span>
            )}
          </div>
          {images.length > 1 && (
            <div className="lf-pv-thumbs">
              {images.map((img, i) => (
                <button
                  key={img.path}
                  type="button"
                  className={`lf-pv-thumb${i === shown ? " on" : ""}`}
                  aria-label={`${i + 1}枚目の写真を見る`}
                  aria-pressed={i === shown}
                  onClick={() => setShown(i)}
                >
                  <img src={img.url} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lf-pv-cat">{category ? `${category.icon} ${category.label}` : "カテゴリ未選択"}</div>
        <div className="lf-pv-title">{f.title.trim() || "（タイトルが入っていません）"}</div>
        <div className="lf-pv-price">{price !== null ? yen(price) : "¥ ---"}</div>
        {badges.length > 0 && (
          <div className="lf-pv-badges">
            {badges.map((b) => (
              <span key={b} className="lf-pv-badge">
                {b}
              </span>
            ))}
          </div>
        )}
        <div className="lf-pv-seller">出品者：{sellerName}</div>
      </div>

      <div className="form-card">
        <div className="form-card-title">
          <span className="icon-pill">✅</span> オプション
        </div>
        <div className="lf-pv-row">
          <span className="lf-pv-dl">無料</span>
          <span className="lf-pv-dv">{free.length ? free.join("・") : "なし"}</span>
        </div>
        {paid.length === 0 ? (
          <div className="lf-pv-row">
            <span className="lf-pv-dl">有料</span>
            <span className="lf-pv-dv">なし</span>
          </div>
        ) : (
          paid.map((p, i) => (
            <div className="lf-pv-row" key={`${p.name}-${i}`}>
              <span className="lf-pv-dl">{i === 0 ? "有料" : ""}</span>
              <span className="lf-pv-dv">
                {p.name} <b className="lf-pv-fee">{p.price}</b>
              </span>
            </div>
          ))
        )}
        {f.request_only && (
          <div className="form-hint" style={{ marginTop: 8 }}>
            🔒 リクエスト専用：購入者からのリクエストを受けた人だけが購入できます。
          </div>
        )}
      </div>

      <div className="form-card">
        <div className="form-card-title">
          <span className="icon-pill">📋</span> 商品情報
        </div>
        {rows.map(([k, v]) => (
          <div className="lf-pv-row" key={k}>
            <span className="lf-pv-dl">{k}</span>
            <span className="lf-pv-dv">{v}</span>
          </div>
        ))}
      </div>

      <div className="form-card">
        <div className="form-card-title">
          <span className="icon-pill">📝</span> 商品説明
        </div>
        <div className="lf-pv-desc">{f.description.trim() || "（説明が入っていません）"}</div>
        {f.ng_note.trim() ? <div className="lf-pv-ng">NG: {f.ng_note.trim()}</div> : null}
      </div>
    </div>
  );
}
