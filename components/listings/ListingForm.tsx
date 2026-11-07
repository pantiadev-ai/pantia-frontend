"use client";
/* 出品のフォーム（見本 item_form.html）。新規と編集の両方で使う。
   保存は saveListing（下書き・出品する・今の状態のまま）。公開には本人確認が要る（ここでは押せなくし、action と DB でも止める）。
   受け取り額の見込みは lib/price-estimate（DB の注文と同じ式）。有料オプションは1行ずつ出し、選ばれ方の幅で出す。
   「プレビュー確認」で、フォームを隠して購入者から見た形（ListingPreview）に切り替える。 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ImageUploader, { type UploadedImage } from "@/components/ImageUploader";
import { useAction, FormMessage } from "@/components/useAction";
import { saveListing, type ListingInput, type ListingIntent } from "@/lib/actions/listings";
import ListingPreview from "@/components/listings/ListingPreview";
import { CATEGORIES, COLORS, MATERIALS, SHIP_ESTIMATES, SIZES } from "@/lib/labels";
import {
  PAID_OPTION_MAX,
  PAID_OPTION_NAME_MAX,
  PAID_OPTION_PRICE_MAX,
  PAID_OPTION_PRICE_MIN,
  PAID_OPTION_SUGGESTIONS,
  newPaidOptionId,
  paidOptionsError,
  type PaidOption,
} from "@/lib/paid-options";
import { priceEstimate, rangeText } from "@/lib/price-estimate";

export type ListingFormValues = Omit<ListingInput, "image_paths">;
export type ListingFormStatus = "draft" | "published" | "private";

type Props = {
  listingId: string | null;
  status: ListingFormStatus | null;
  initial: ListingFormValues;
  initialImages: UploadedImage[];
  kycOk: boolean;
  feeRate: number;
  anonymousFee: number;
  videoFee: number;
  extendFeePerDay: number;
  sellerName: string;
  /** 新しい出品を下書きで保存して、編集の画面へ移ってきたとき（?saved=draft）。「✓」を出す */
  justSaved?: "draft" | null;
};

type BoolKey = {
  [K in keyof ListingFormValues]: ListingFormValues[K] extends boolean ? K : never;
}[keyof ListingFormValues];

const WORN_DAYS = [1, 2, 3, 4, 5, 6] as const;

/** 自分で決める有料オプションの入力中の行（料金は欄の文字のまま持つ） */
type CustomRow = { id: string; name: string; price: string };

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

/** 価格の欄の文字を数に。空なら null、形が違えば NaN */
function parsePrice(text: string): number | null {
  const t = text.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[,\s円¥]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isInteger(n) ? n : Number.NaN;
}
const priceOk = (n: number | null) => n !== null && !Number.isNaN(n) && n >= 500 && n <= 100000 && n % 100 === 0;

export default function ListingForm({
  listingId,
  status: initialStatus,
  initial,
  initialImages,
  kycOk,
  feeRate,
  anonymousFee,
  videoFee,
  extendFeePerDay,
  sellerName,
  justSaved = null,
}: Props) {
  const router = useRouter();
  const { pending, error, message, run, setError } = useAction();
  const [id, setId] = useState<string | null>(listingId);
  const [status, setStatus] = useState<ListingFormStatus | null>(initialStatus);
  const [f, setF] = useState<ListingFormValues>(initial);
  const [images, setImages] = useState<UploadedImage[]>(initialImages);
  const [priceText, setPriceText] = useState(initial.price == null ? "" : String(initial.price));
  const [done, setDone] = useState<null | "published">(null);
  const [draftSaved, setDraftSaved] = useState(justSaved === "draft");
  const modalBtnRef = useRef<HTMLAnchorElement>(null);
  const [custom, setCustom] = useState<CustomRow[]>(() =>
    initial.paid_options.map((o) => ({ id: o.id, name: o.name, price: String(o.price) })),
  );
  const [view, setView] = useState<"edit" | "preview">("edit");
  const previewHeadingRef = useRef<HTMLHeadingElement>(null);
  const editScroll = useRef(0);
  const firstView = useRef(true);

  function set<K extends keyof ListingFormValues>(key: K, value: ListingFormValues[K]) {
    setF((cur) => ({ ...cur, [key]: value }));
  }
  function toggle(key: BoolKey) {
    setF((cur) => ({ ...cur, [key]: !cur[key] }));
  }
  function addCustom(name: string) {
    setCustom((cur) =>
      cur.length >= PAID_OPTION_MAX ? cur : [...cur, { id: newPaidOptionId(new Set(cur.map((r) => r.id))), name, price: "" }],
    );
  }
  function editCustom(rowId: string, patch: Partial<Omit<CustomRow, "id">>) {
    setCustom((cur) => cur.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
  }
  function removeCustom(rowId: string) {
    setCustom((cur) => cur.filter((r) => r.id !== rowId));
  }

  // 下書き保存の「✓」を少しの間だけ出す（見本の handleDraft と同じ）
  useEffect(() => {
    if (!draftSaved) return;
    const t = window.setTimeout(() => setDraftSaved(false), 2200);
    return () => window.clearTimeout(t);
  }, [draftSaved]);

  // 完了の窓：開いたら中のボタンへ、Esc で閉じる
  useEffect(() => {
    if (!done) return;
    modalBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDone();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- closeDone は id と listingId しか見ない
  }, [done]);

  // プレビューを開いたら上から見せ、戻ったら元の位置へ（読み上げの位置も見出しへ移す）
  useEffect(() => {
    if (firstView.current) {
      firstView.current = false;
      return;
    }
    if (view === "preview") {
      window.scrollTo({ top: 0 });
      previewHeadingRef.current?.focus({ preventScroll: true });
    } else {
      window.scrollTo({ top: editScroll.current });
    }
  }, [view]);

  function openPreview() {
    editScroll.current = window.scrollY;
    setError(null);
    setView("preview");
  }

  // 新しい出品は、完了の窓を閉じるまで URL を /listings/new のままにする。
  // 先に URL を編集の画面に替えると、保存の後の読み直しで画面ごと作り直され、窓が消える。
  function closeDone() {
    setDone(null);
    setView("edit");
    if (listingId === null && id) router.replace(`/listings/${id}/edit`, { scroll: false });
  }

  const price = parsePrice(priceText);
  const feePct = Math.round(feeRate * 1000) / 10;
  const category = CATEGORIES.find((c) => c.value === f.category);
  const titleLen = Array.from(f.title).length;
  const descLen = Array.from(f.description).length;
  const ngLen = Array.from(f.ng_note).length;

  const basicDone =
    images.length >= 1 &&
    f.title.trim() !== "" &&
    f.description.trim() !== "" &&
    f.category !== null &&
    f.worn_days !== null &&
    priceOk(price);

  // 延長できる最大の日数は、着用日数より後ろの日だけ選べる
  const extendChoices = WORN_DAYS.filter((d) => d > (f.worn_days ?? 0));

  // 自分で決める有料オプション：空の行は除き、名前の前後の空白を落とす（料金が数でなければ NaN にして、確かめで止める）
  const extras: PaidOption[] = custom
    .filter((r) => r.name.trim() !== "" || r.price.trim() !== "")
    .map((r) => ({ id: r.id, name: r.name.trim(), price: parsePrice(r.price) ?? Number.NaN }));
  const extrasError = paidOptionsError(extras);
  // 決まりに合う有料オプションだけを見込みとプレビューに入れる
  const validExtras = extras.filter((x) => paidOptionsError([x]) === null);
  const estimate = priceOk(price)
    ? priceEstimate({
        price: price as number,
        feeRate,
        videoFee: f.opt_video ? videoFee : null,
        extend:
          f.opt_extend && f.max_worn_days !== null && f.worn_days !== null
            ? { feePerDay: extendFeePerDay, days: f.max_worn_days - f.worn_days }
            : null,
        extras: validExtras,
      })
    : null;

  /** 公開するときに足りない項目（DB の listings_complete と同じ） */
  function missing(): string[] {
    const m: string[] = [];
    if (images.length < 1) m.push("写真（1枚以上）");
    if (!f.title.trim()) m.push("タイトル");
    if (!f.category) m.push("カテゴリ");
    if (f.worn_days === null) m.push("着用日数");
    if (!f.description.trim()) m.push("商品説明");
    if (price === null) m.push("販売価格");
    return m;
  }

  function save(intent: ListingIntent) {
    if (pending) return;
    if (price !== null && !priceOk(price)) {
      setError("販売価格は¥500〜¥100,000の間で、100円単位で入れてください。");
      return;
    }
    const willBeOpen = intent === "publish" || (intent === "keep" && status !== "draft");
    if (willBeOpen) {
      const m = missing();
      if (m.length > 0) {
        setError(`${m.join("・")}を入れてください。`);
        return;
      }
    }
    if (intent === "publish" && status !== "published" && !kycOk) {
      setError("出品（公開）するには、本人確認を済ませてください。下書きは保存できます。");
      return;
    }
    if (f.opt_extend && willBeOpen && (f.max_worn_days === null || f.worn_days === null || f.max_worn_days <= f.worn_days)) {
      setError("着用日数延長をつけるときは、延長できる最大の日数を着用日数より長くしてください。");
      return;
    }
    if (extrasError) {
      setError(extrasError);
      return;
    }

    const input: ListingInput = {
      ...f,
      title: f.title.trim(),
      description: f.description.trim(),
      ng_note: f.ng_note.trim(),
      price,
      max_worn_days: f.opt_extend ? f.max_worn_days : null,
      paid_options: extras,
      image_paths: images.map((i) => i.path),
    };
    run(
      () => saveListing(id, input, intent),
      (data) => {
        if (!data) return;
        const wasNew = id === null;
        setId(data.id);
        setStatus(data.status);
        if (intent === "publish") setDone("published");
        if (intent === "draft") {
          // 新しい下書きは編集の画面へ移る（「✓」は移った先で ?saved=draft から出す）
          if (wasNew) router.replace(`/listings/${data.id}/edit?saved=draft`, { scroll: false });
          else setDraftSaved(true);
        }
      },
    );
  }

  // 段の進み具合：必須がそろえば 1・2 は済み、3（確認・出品）へ
  const s1 = basicDone ? "step done" : "step active";
  const s2 = basicDone ? "step done" : "step";
  const s3 = basicDone || view === "preview" ? "step active" : "step";

  const badges: string[] = [];
  if (f.same_day) badges.push("即日");
  if (f.opt_photo) badges.push("写真付");
  if (f.opt_video) badges.push("動画");
  if (f.anonymous_ok) badges.push("匿名");
  if (f.followers_only) badges.push("フォロワー限定");

  const isNew = status === null;
  const canPublish = kycOk || status === "published";

  const freeOptions: { key: BoolKey; label: string }[] = [
    { key: "opt_photo", label: "📸 着用写真" },
    { key: "opt_letter", label: "💌 手紙同封" },
    { key: "opt_ziplock", label: "🧴 ジップロック梱包" },
    { key: "opt_card", label: "✉️ メッセージカード" },
  ];
  const paidOptions: { key: BoolKey; label: string }[] = [
    { key: "opt_video", label: `🎬 着用動画（+${yen(videoFee)}）` },
    { key: "opt_extend", label: `📅 着用日数延長（+${yen(extendFeePerDay)}/日）` },
    { key: "request_only", label: "🔒 リクエスト専用" },
  ];
  const toggles: { key: BoolKey; name: string; desc: string }[] = [
    { key: "same_day", name: "⚡ 即日発送対応", desc: "購入後24時間以内に発送できる場合はONにしてください" },
    {
      key: "anonymous_ok",
      name: "📦 匿名配送対応",
      desc: `会社経由の転送便で住所を秘匿できます（別途送料+${yen(anonymousFee)}）`,
    },
    { key: "pre_message_ok", name: "💬 購入前メッセージ可", desc: "購入前に購入者からメッセージを受け付けます" },
    { key: "followers_only", name: "🔒 フォロワー限定公開", desc: "フォロワーのみに商品を表示します" },
    { key: "cool_shipping", name: "❄️ クール便で発送", desc: "冷蔵・冷凍が必要な商品（体液系など）はONにしてください" },
  ];

  // 保存のボタンと文は、フォームの横と確認の画面の両方で使う
  const saveButtons = (
    <>
      {status === "published" ? (
        <button type="button" className="btn-publish" onClick={() => save("keep")} disabled={pending}>
          {pending ? "保存しています…" : "💾 変更を保存する"}
        </button>
      ) : (
        <button type="button" className="btn-publish" onClick={() => save("publish")} disabled={pending || !canPublish}>
          {pending ? "保存しています…" : status === "private" ? "🎀 公開する" : "🎀 出品する"}
        </button>
      )}
      {(isNew || status === "draft") && (
        <button
          type="button"
          className={`btn-draft${draftSaved ? " lf-saved" : ""}`}
          onClick={() => save("draft")}
          disabled={pending}
        >
          {draftSaved ? "✓ 下書き保存しました" : "💾 下書き保存"}
        </button>
      )}
      {status === "private" && (
        <button type="button" className="btn-draft" onClick={() => save("keep")} disabled={pending}>
          💾 非公開のまま保存
        </button>
      )}
    </>
  );
  const notes = (
    <>
      <FormMessage error={error} message={draftSaved ? null : message} />
      {!canPublish && (
        <div className="lf-kyc-note">
          出品（公開）するには本人確認が必要です。下書きは今すぐ保存できます。
          <br />
          <Link href="/kyc">本人確認へ →</Link>
        </div>
      )}
    </>
  );
  const previewMissing = missing();
  if (price !== null && !priceOk(price)) previewMissing.push("販売価格（¥500〜¥100,000・100円単位）");

  return (
    <>
      {/* STEP BAR */}
      <div className="step-bar">
        <div className="steps">
          <div className={s1}>
            <div className="step-circle">{basicDone ? "✓" : "1"}</div> 商品情報
          </div>
          <div className={`step-line${basicDone ? " done" : ""}`}></div>
          <div className={s2}>
            <div className="step-circle">{basicDone ? "✓" : "2"}</div> オプション設定
          </div>
          <div className={`step-line${basicDone ? " done" : ""}`}></div>
          <div className={s3}>
            <div className="step-circle">3</div> 確認・出品
          </div>
        </div>
      </div>

      <main className="layout" hidden={view === "preview"}>
        {/* ── 左：フォーム ── */}
        <div className="form-section fade-in">
          {/* 1. 写真 */}
          <div className="form-card">
            <div className="form-card-title">
              <span className="icon-pill">📸</span> 商品写真 <span className="req">必須</span>
            </div>
            <ImageUploader
              kind="listing"
              max={5}
              value={images}
              onChange={setImages}
              label="写真を追加"
              disabled={pending}
            />
            <div className="img-note">
              ⚠️ 顔・個人情報が映り込まないようご注意ください。写真のEXIF情報（位置情報）は自動で削除されます。最大5枚まで。
            </div>
            <div className="img-note">
              📐 一覧や検索では、1枚目の写真の上下・左右の端が切れて表示されます。大事な所は写真の真ん中に入れてください（商品ページでは切れずに全体が出ます）。
            </div>
          </div>

          {/* 2. 基本情報 */}
          <div className="form-card">
            <div className="form-card-title">
              <span className="icon-pill">📝</span> 基本情報
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="lf-title">
                  商品タイトル <span className="req">必須</span>
                </label>
                <input
                  id="lf-title"
                  className="form-input"
                  type="text"
                  placeholder="例：コットンショーツ 2日着用 着用写真付き"
                  maxLength={40}
                  value={f.title}
                  onChange={(e) => set("title", e.target.value.replace(/[\r\n\t]/g, " "))}
                />
                <div className="char-count">
                  <span>{titleLen}</span>/40
                </div>
              </div>
            </div>

            <div className="form-row cols2">
              <div className="form-group">
                <label className="form-label" htmlFor="lf-category">
                  カテゴリ <span className="req">必須</span>
                </label>
                <select
                  id="lf-category"
                  className="form-select"
                  value={f.category ?? ""}
                  onChange={(e) => {
                    const c = CATEGORIES.find((x) => x.value === e.target.value);
                    set("category", c ? c.value : null);
                  }}
                >
                  <option value="">選択してください</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.icon} {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="lf-days">
                  着用日数 <span className="req">必須</span>
                </label>
                <select
                  id="lf-days"
                  className="form-select"
                  value={f.worn_days ?? ""}
                  onChange={(e) => {
                    const d = e.target.value ? Number(e.target.value) : null;
                    setF((cur) => ({
                      ...cur,
                      worn_days: d,
                      // 延長の上限が着用日数以下になったら、選び直してもらう
                      max_worn_days: cur.max_worn_days !== null && d !== null && cur.max_worn_days <= d ? null : cur.max_worn_days,
                    }));
                  }}
                >
                  <option value="">選択してください</option>
                  {WORN_DAYS.map((d) => (
                    <option key={d} value={d}>
                      {d}日
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row cols3">
              <div className="form-group">
                <label className="form-label" htmlFor="lf-material">
                  素材
                </label>
                <select
                  id="lf-material"
                  className="form-select"
                  value={f.material ?? ""}
                  onChange={(e) => set("material", MATERIALS.find((x) => x.value === e.target.value)?.value ?? null)}
                >
                  <option value="">未選択</option>
                  {MATERIALS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="lf-color">
                  カラー
                </label>
                <select
                  id="lf-color"
                  className="form-select"
                  value={f.color ?? ""}
                  onChange={(e) => set("color", COLORS.find((x) => x.value === e.target.value)?.value ?? null)}
                >
                  <option value="">未選択</option>
                  {COLORS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="lf-size">
                  サイズ
                </label>
                <select
                  id="lf-size"
                  className="form-select"
                  value={f.size ?? ""}
                  onChange={(e) => set("size", SIZES.find((x) => x.value === e.target.value)?.value ?? null)}
                >
                  <option value="">未選択</option>
                  {SIZES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="lf-desc">
                  商品説明 <span className="req">必須</span>
                </label>
                <textarea
                  id="lf-desc"
                  className="form-textarea"
                  placeholder="商品の詳細、着用シーン、状態などを記入してください。購入者が安心して購入できるよう、丁寧に書きましょう🌸"
                  maxLength={500}
                  value={f.description}
                  onChange={(e) => set("description", e.target.value)}
                />
                <div className="char-count">
                  <span>{descLen}</span>/500
                </div>
              </div>
            </div>
          </div>

          {/* 3. 価格設定 */}
          <div className="form-card">
            <div className="form-card-title">
              <span className="icon-pill">💰</span> 価格設定
            </div>

            <div className="form-row cols2">
              <div className="form-group">
                <label className="form-label" htmlFor="lf-price">
                  販売価格（円） <span className="req">必須</span>
                </label>
                <input
                  id="lf-price"
                  className="form-input"
                  type="number"
                  inputMode="numeric"
                  placeholder="例：1800"
                  min={500}
                  max={100000}
                  step={100}
                  value={priceText}
                  onChange={(e) => setPriceText(e.target.value)}
                />
                <div className="form-hint">最低価格：¥500（100円単位・上限¥100,000）</div>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="lf-stock">
                  在庫数
                </label>
                <select
                  id="lf-stock"
                  className="form-select"
                  value={f.stock_mode}
                  onChange={(e) => set("stock_mode", e.target.value === "multiple" ? "multiple" : "single")}
                >
                  <option value="single">1点のみ</option>
                  <option value="multiple">複数対応可</option>
                </select>
                <div className="form-hint">使用済み品は基本1点のみ推奨</div>
              </div>
            </div>

            <div className="price-preview">
              <div className="pp-row">
                <span>販売価格</span>
                <span>{estimate ? yen(estimate.subtotal.min) : "¥ ---"}</span>
              </div>
              {estimate?.lines.map((l, i) => (
                <div className="pp-row lf-pp-option" key={i}>
                  <span>
                    {l.label}
                    {l.note && <span className="lf-pp-note">（{l.note}）</span>}
                  </span>
                  <span>+ {yen(l.amount)}</span>
                </div>
              ))}
              {estimate && estimate.lines.length > 0 && (
                <div className="pp-row lf-pp-sum">
                  <span>合計（オプション込み）</span>
                  <span>{rangeText(estimate.subtotal)}</span>
                </div>
              )}
              <div className="pp-row">
                <span>手数料（{feePct}%）</span>
                <span style={{ color: "var(--err)" }}>{estimate ? `- ${rangeText(estimate.fee)}` : "- ¥ ---"}</span>
              </div>
              <hr className="pp-divider" />
              <div className="pp-row">
                <span style={{ fontWeight: 600 }}>あなたの受け取り額</span>
                <span className="pp-total">{estimate ? rangeText(estimate.net) : "¥ ---"}</span>
              </div>
            </div>
            <div className="form-hint" style={{ marginTop: 8 }}>
              {estimate && estimate.lines.length > 0
                ? "※ 見込みの額です。有料オプションは購入者が選んだ分だけ足され、同じ率の手数料がかかります（左はオプションなし、右は全部選ばれたとき）。"
                : "※ 見込みの額です。下の「対応オプション」で有料オプションをつけると、ここに足されます。"}
            </div>
          </div>

          {/* 4. オプション設定 */}
          <div className="form-card">
            <div className="form-card-title">
              <span className="icon-pill">✅</span> 対応オプション
            </div>

            <div className="form-row" style={{ marginBottom: 16 }}>
              <div className="form-group">
                <span className="form-label">
                  無料オプション <span className="opt-tag-label">複数選択可</span>
                </span>
                <div className="option-chips" role="group" aria-label="無料オプション">
                  {freeOptions.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      className={`opt-chip${f[o.key] ? " selected" : ""}`}
                      aria-pressed={f[o.key]}
                      onClick={() => toggle(o.key)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <span className="form-label">
                  有料オプション <span className="opt-tag-label">任意</span>
                </span>
                <div className="option-chips" role="group" aria-label="有料オプション">
                  {paidOptions.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      className={`opt-chip${f[o.key] ? " selected" : ""}`}
                      aria-pressed={f[o.key]}
                      onClick={() => {
                        if (o.key === "opt_extend" && !f.opt_extend && f.max_worn_days === null) {
                          // つけたときは、延長できる最大の日数を一番長い日にしておく
                          setF((cur) => ({ ...cur, opt_extend: true, max_worn_days: 6 > (cur.worn_days ?? 0) ? 6 : null }));
                          return;
                        }
                        toggle(o.key);
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                {f.request_only && (
                  <div className="form-hint" style={{ marginTop: 8 }}>
                    リクエスト専用：購入者からのリクエストを受けた人だけが購入できます。
                  </div>
                )}
              </div>
            </div>

            {f.opt_extend && (
              <div className="form-row" style={{ marginTop: 16 }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="lf-maxdays">
                    延長できる最大の日数
                  </label>
                  {f.worn_days === null ? (
                    <div className="form-hint">先に「着用日数」を選んでください。</div>
                  ) : extendChoices.length === 0 ? (
                    <div className="form-hint">着用日数が6日のときは、延長はつけられません。</div>
                  ) : (
                    <select
                      id="lf-maxdays"
                      className="form-select"
                      value={f.max_worn_days ?? ""}
                      onChange={(e) => set("max_worn_days", e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">選択してください</option>
                      {extendChoices.map((d) => (
                        <option key={d} value={d}>
                          {d}日まで（+{yen((d - (f.worn_days ?? 0)) * extendFeePerDay)}まで）
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            )}

            <div className="form-row" style={{ marginTop: 16 }}>
              <div className="form-group" role="group" aria-labelledby="lf-po-title">
                <span className="form-label" id="lf-po-title">
                  自分で決める有料オプション <span className="opt-tag-label">任意・{PAID_OPTION_MAX}件まで</span>
                </span>
                <div className="form-hint">
                  名前と料金（¥{PAID_OPTION_PRICE_MIN}〜¥{PAID_OPTION_PRICE_MAX.toLocaleString("ja-JP")}・100円単位）を自由に決められます。候補を押すと名前が入ります。
                </div>
                {custom.length > 0 && (
                  <ul className="lf-po-list">
                    {custom.map((r, i) => (
                      <li className="lf-po-row" key={r.id}>
                        <input
                          className="form-input lf-po-name"
                          aria-label={`有料オプション${i + 1}の名前`}
                          placeholder="オプションの名前"
                          maxLength={PAID_OPTION_NAME_MAX}
                          list="lf-po-suggest"
                          value={r.name}
                          onChange={(e) => editCustom(r.id, { name: e.target.value })}
                        />
                        <div className="lf-po-price">
                          <span aria-hidden="true">+¥</span>
                          <input
                            className="form-input"
                            aria-label={`有料オプション${i + 1}の料金（円）`}
                            inputMode="numeric"
                            placeholder="1000"
                            value={r.price}
                            onChange={(e) => editCustom(r.id, { price: e.target.value })}
                          />
                        </div>
                        <button
                          type="button"
                          className="lf-po-del"
                          aria-label={`有料オプション${i + 1}を消す`}
                          onClick={() => removeCustom(r.id)}
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <datalist id="lf-po-suggest">
                  {PAID_OPTION_SUGGESTIONS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
                {extras.length > 0 && extrasError && <div className="lf-po-err">{extrasError}</div>}
                {custom.length < PAID_OPTION_MAX ? (
                  <>
                    <div className="option-chips lf-po-suggest" role="group" aria-label="有料オプションの候補">
                      {PAID_OPTION_SUGGESTIONS.filter((s) => !custom.some((r) => r.name.trim() === s)).map((s) => (
                        <button key={s} type="button" className="opt-chip" onClick={() => addCustom(s)}>
                          ＋ {s}
                        </button>
                      ))}
                    </div>
                    <button type="button" className="lf-po-add" onClick={() => addCustom("")}>
                      ＋ 自由に追加する
                    </button>
                  </>
                ) : (
                  <div className="form-hint">有料オプションは{PAID_OPTION_MAX}件までです。</div>
                )}
              </div>
            </div>
          </div>

          {/* 5. 発送・配送 */}
          <div className="form-card">
            <div className="form-card-title">
              <span className="icon-pill">🚚</span> 発送・配送設定
            </div>

            {toggles.map((t) => (
              <div className="toggle-row" key={t.key}>
                <div className="toggle-info">
                  <div className="toggle-name">{t.name}</div>
                  <div className="toggle-desc">{t.desc}</div>
                </div>
                <label className="toggle-switch">
                  <input type="checkbox" checked={f[t.key]} onChange={() => toggle(t.key)} aria-label={t.name} />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            ))}

            <div className="form-row" style={{ marginTop: 16 }}>
              <div className="form-group">
                <label className="form-label" htmlFor="lf-ship">
                  発送目安
                </label>
                <select
                  id="lf-ship"
                  className="form-select"
                  value={f.ship_estimate}
                  onChange={(e) => {
                    const s = SHIP_ESTIMATES.find((x) => x.value === e.target.value);
                    if (s) set("ship_estimate", s.value);
                  }}
                >
                  {SHIP_ESTIMATES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="lf-ng">
                  NGオプション・注意事項 <span className="opt-tag-label">任意</span>
                </label>
                <textarea
                  id="lf-ng"
                  className="form-textarea"
                  placeholder="例：顔写真はお断りしています。7日以上の着用はNG。"
                  style={{ minHeight: 70 }}
                  maxLength={200}
                  value={f.ng_note}
                  onChange={(e) => set("ng_note", e.target.value)}
                />
                <div className="char-count">
                  <span>{ngLen}</span>/200
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── 右：プレビューとボタン ── */}
        <aside className="sidebar fade-in" style={{ transitionDelay: "0.1s" }}>
          <div className="preview-card">
            <div className="preview-thumb">
              {images[0] ? (
                <img src={images[0].url} alt="プレビュー" className="preview-img" />
              ) : (
                <span className="lf-noimg" aria-hidden="true">
                  {category?.icon ?? "📷"}
                </span>
              )}
            </div>
            <div className="preview-info">
              <div className="preview-tag">{category ? `${category.icon} ${category.label}` : "カテゴリ未選択"}</div>
              <div className="preview-title">{f.title.trim() || "商品タイトルがここに表示されます"}</div>
              <div className="preview-seller">
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green2)" }}></div>
                {sellerName}
              </div>
              <div className="preview-price">{priceOk(price) ? yen(price as number) : "¥ ---"}</div>
              {estimate && estimate.lines.length > 0 && (
                <div className="lf-preview-sum">オプション込み {rangeText(estimate.subtotal)}</div>
              )}
              {badges.length > 0 && (
                <div className="preview-badges">
                  {badges.map((b) => (
                    <span className="preview-badge" key={b}>
                      {b}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="action-card">
            {saveButtons}
            <button type="button" className="btn-preview" onClick={openPreview}>
              👁 プレビュー確認
            </button>
            {view === "edit" && notes}
            <div className="action-note">
              {status === "published" ? (
                <>
                  公開中の商品です。保存すると、すぐに商品ページへ反映されます。
                  <br />
                  非公開・削除は <Link href="/mypage/items">出品管理</Link> から行えます。
                </>
              ) : status === "private" ? (
                <>
                  今は非公開です。「公開する」で、商品一覧にまた出ます。
                </>
              ) : (
                <>
                  出品後は商品一覧ページに即時反映されます。
                  <br />
                  内容はいつでも編集できます。
                </>
              )}
            </div>
          </div>

          <div className="tips-card">
            <div className="tips-title">💡 売れやすくするコツ</div>
            <div className="tip-item">
              <span className="tip-icon">📸</span>
              <span>写真は明るい場所で複数枚撮影すると購入率UP</span>
            </div>
            <div className="tip-item">
              <span className="tip-icon">📝</span>
              <span>着用シーンや状態を丁寧に書くと信頼感アップ</span>
            </div>
            <div className="tip-item">
              <span className="tip-icon">⚡</span>
              <span>即日発送に対応できるなら、ONにしておくと選ばれやすい</span>
            </div>
            <div className="tip-item">
              <span className="tip-icon">💬</span>
              <span>つぶやきで告知すると出品直後の閲覧数が増える</span>
            </div>
            <div className="tip-item">
              <span className="tip-icon">💰</span>
              <span>はじめは相場に近い価格から始めると、最初の1件が決まりやすい</span>
            </div>
          </div>
        </aside>
      </main>

      {/* 確認の画面（フォームの代わりに出す） */}
      {view === "preview" && (
        <div className="layout">
          <ListingPreview
            values={f}
            images={images}
            price={priceOk(price) ? price : null}
            extras={validExtras}
            sellerName={sellerName}
            videoFee={videoFee}
            extendFeePerDay={extendFeePerDay}
            missing={previewMissing}
            onBack={() => setView("edit")}
            headingRef={previewHeadingRef}
          />
          <aside className="sidebar">
            <div className="action-card">
              {saveButtons}
              <button type="button" className="btn-preview" onClick={() => setView("edit")}>
                ✏️ 編集に戻る
              </button>
              {notes}
            </div>
          </aside>
        </div>
      )}

      {/* 完了の窓 */}
      {done && id && (
        <div
          className="modal-overlay show"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lf-done-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDone();
          }}
        >
          <div className="modal">
            <div className="modal-icon">🎀</div>
            <div className="modal-title" id="lf-done-title">
              出品完了！
            </div>
            <div className="modal-sub">
              商品が出品されました🌸
              <br />
              つぶやきで告知して
              <br />
              もっと多くの人に見てもらいましょう！
            </div>
            <Link href={`/items/${id}`} className="modal-btn" ref={modalBtnRef}>
              商品ページを見る →
            </Link>
            <div>
              <button type="button" className="lf-modal-close" onClick={closeDone}>
                閉じて編集を続ける
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
