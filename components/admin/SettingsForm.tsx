"use client";
/* サイト設定の編集。保存の前に「何を変えるか」を確認の窓で見せる。
   サイト名・送信元・メールの送り方は環境変数で決まるので、ここでは見せるだけ（変えられない）。 */
import { useState, useTransition, type ReactNode } from "react";
import { updateSettings, type SettingsInput } from "@/lib/actions/admin";
import { useFlash } from "./Flash";
import { Modal } from "./Modal";

type NumKey = "feePercent" | "anonymousFee" | "videoFee" | "extendFeePerDay" | "minPayout" | "payoutFee" | "autoCompleteDays";
type BoolKey = "registrationOpen" | "maintenance" | "mailOrder" | "mailKyc" | "mailPayout" | "modSpamFilter";
type TextKey = "notice" | "forwardingAddress";

export type SettingsValues = { [K in NumKey]: number } & { [K in BoolKey]: boolean } & { [K in TextKey]: string };

const LABELS: Record<NumKey | BoolKey | TextKey, string> = {
  feePercent: "手数料率（%）",
  anonymousFee: "匿名配送の手数料（円）",
  videoFee: "動画オプションの料金（円）",
  extendFeePerDay: "着用日数の延長料金（円／日）",
  minPayout: "最低振込申請額（円）",
  payoutFee: "振込手数料（円）",
  autoCompleteDays: "自動で取引完了にするまでの日数",
  registrationOpen: "新規登録受付",
  maintenance: "メンテナンスモード",
  mailOrder: "購入完了メール",
  mailKyc: "KYC審査結果メール",
  mailPayout: "振込完了メール",
  modSpamFilter: "スパムフィルター",
  notice: "お知らせ（全ページの上に出す文）",
  forwardingAddress: "匿名配送の転送先（非公開）",
};

const NUM_KEYS: NumKey[] = ["feePercent", "anonymousFee", "videoFee", "extendFeePerDay", "minPayout", "payoutFee", "autoCompleteDays"];
const BOOL_KEYS: BoolKey[] = ["registrationOpen", "maintenance", "mailOrder", "mailKyc", "mailPayout", "modSpamFilter"];
const TEXT_KEYS: TextKey[] = ["notice", "forwardingAddress"];

function toNum(s: string): number {
  const t = s.trim();
  return t === "" ? Number.NaN : Number(t);
}

export default function SettingsForm({
  initial,
  env,
}: {
  initial: SettingsValues;
  env: { siteName: string; mailFrom: string; mailMode: string };
}) {
  const [saved, setSaved] = useState<SettingsValues>(initial);
  const [nums, setNums] = useState<Record<NumKey, string>>(() => {
    const o = {} as Record<NumKey, string>;
    for (const k of NUM_KEYS) o[k] = String(initial[k]);
    return o;
  });
  const [bools, setBools] = useState<Record<BoolKey, boolean>>(() => {
    const o = {} as Record<BoolKey, boolean>;
    for (const k of BOOL_KEYS) o[k] = initial[k];
    return o;
  });
  const [texts, setTexts] = useState<Record<TextKey, string>>(() => {
    const o = {} as Record<TextKey, string>;
    for (const k of TEXT_KEYS) o[k] = initial[k];
    return o;
  });
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const flash = useFlash();

  function current(): SettingsValues {
    const v = {} as SettingsValues;
    for (const k of NUM_KEYS) v[k] = toNum(nums[k]);
    for (const k of BOOL_KEYS) v[k] = bools[k];
    for (const k of TEXT_KEYS) v[k] = texts[k];
    return v;
  }

  const now = current();
  const changes: { label: string; from: string; to: string }[] = [];
  const show = (x: number | boolean | string) => (typeof x === "boolean" ? (x ? "オン" : "オフ") : x === "" ? "（空）" : String(x));
  for (const k of [...NUM_KEYS, ...BOOL_KEYS, ...TEXT_KEYS]) {
    const a = saved[k];
    const b = now[k];
    if (typeof a === "string" && typeof b === "string" ? a.trim() !== b.trim() : a !== b) {
      changes.push({ label: LABELS[k], from: show(a), to: show(b) });
    }
  }

  function open() {
    for (const k of NUM_KEYS) {
      if (!Number.isFinite(now[k])) {
        setError(`${LABELS[k]}を数字で入れてください。`);
        return;
      }
    }
    if (changes.length === 0) {
      setError("変えた項目がありません。");
      return;
    }
    setError(null);
    setConfirming(true);
  }

  function submit() {
    const v = current();
    const input: SettingsInput = {
      feePercent: v.feePercent,
      anonymousFee: v.anonymousFee,
      videoFee: v.videoFee,
      extendFeePerDay: v.extendFeePerDay,
      minPayout: v.minPayout,
      payoutFee: v.payoutFee,
      autoCompleteDays: v.autoCompleteDays,
      registrationOpen: v.registrationOpen,
      maintenance: v.maintenance,
      notice: v.notice,
      mailOrder: v.mailOrder,
      mailKyc: v.mailKyc,
      mailPayout: v.mailPayout,
      modSpamFilter: v.modSpamFilter,
      forwardingAddress: v.forwardingAddress,
    };
    start(async () => {
      try {
        const r = await updateSettings(input);
        setConfirming(false);
        if (r.ok) {
          setSaved({ ...v, notice: v.notice.trim(), forwardingAddress: v.forwardingAddress.trim() });
          flash(r.message ?? "設定を保存しました。", "ok");
        } else {
          setError(r.error);
        }
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e) throw e;
        setConfirming(false);
        setError("通信に失敗しました。もう一度お試しください。");
      }
    });
  }

  const numField = (k: NumKey, opts: { step?: string; min?: number; max?: number } = {}) => (
    <div>
      <label className="adm-label" htmlFor={`set-${k}`}>
        {LABELS[k]}
      </label>
      <input
        id={`set-${k}`}
        className="adm-input"
        type="number"
        inputMode="decimal"
        step={opts.step ?? "1"}
        min={opts.min}
        max={opts.max}
        value={nums[k]}
        onChange={(e) => setNums((s) => ({ ...s, [k]: e.target.value }))}
      />
    </div>
  );

  const toggle = (k: BoolKey, note?: ReactNode) => (
    <div className="adm-row">
      <div>
        <div className="adm-row-title" id={`set-${k}-label`}>
          {LABELS[k]}
        </div>
        {note && <div className="adm-row-note">{note}</div>}
      </div>
      <label className="toggle-switch">
        <input
          type="checkbox"
          aria-labelledby={`set-${k}-label`}
          checked={bools[k]}
          onChange={(e) => setBools((s) => ({ ...s, [k]: e.target.checked }))}
        />
        <span className="toggle-slider" />
      </label>
    </div>
  );

  const readOnly = (label: string, value: string, id: string) => (
    <div>
      <label className="adm-label" htmlFor={id}>
        {label}
      </label>
      <input id={id} className="adm-input" value={value} readOnly aria-readonly="true" />
    </div>
  );

  return (
    <fieldset disabled={pending} style={{ border: "none", display: "contents" }}>
      <div className="dual-grid">
        <div className="chart-card">
          <div className="card-header">
            <div className="card-title">
              <span className="pill pill-pk" aria-hidden="true">
                ⚙️
              </span>{" "}
              基本設定
            </div>
          </div>
          <div className="adm-form">
            {readOnly("サービス名（環境変数で決まります）", env.siteName, "set-site")}
            {numField("feePercent", { step: "0.1", min: 0, max: 49.9 })}
            {numField("minPayout", { min: 1 })}
            {toggle("registrationOpen", "ユーザー登録を受け付ける")}
            {toggle("maintenance", "管理者以外の利用を一時停止する")}
          </div>
        </div>
        <div className="chart-card">
          <div className="card-header">
            <div className="card-title">
              <span className="pill pill-yellow" aria-hidden="true">
                📧
              </span>{" "}
              メール・通知設定
            </div>
          </div>
          <div className="adm-form">
            {readOnly("送信元メールアドレス（環境変数で決まります）", env.mailFrom, "set-from")}
            {readOnly("メールの送り方（環境変数で決まります）", env.mailMode, "set-mail")}
            {toggle("mailOrder")}
            {toggle("mailKyc")}
            {toggle("mailPayout")}
          </div>
        </div>
      </div>
      <div className="dual-grid">
        <div className="chart-card">
          <div className="card-header">
            <div className="card-title">
              <span className="pill pill-green" aria-hidden="true">
                💴
              </span>{" "}
              料金・取引
            </div>
          </div>
          <div className="adm-form">
            {numField("anonymousFee", { min: 0, max: 5000 })}
            {numField("videoFee", { min: 0, max: 10000 })}
            {numField("extendFeePerDay", { min: 0, max: 10000 })}
            {numField("payoutFee", { min: 0, max: 1000 })}
            {numField("autoCompleteDays", { min: 1, max: 30 })}
          </div>
        </div>
        <div className="chart-card">
          <div className="card-header">
            <div className="card-title">
              <span className="pill pill-blue" aria-hidden="true">
                📢
              </span>{" "}
              お知らせ・安全
            </div>
          </div>
          <div className="adm-form">
            <div>
              <label className="adm-label" htmlFor="set-notice">
                {LABELS.notice}
              </label>
              <textarea
                id="set-notice"
                className="adm-textarea"
                maxLength={500}
                value={texts.notice}
                onChange={(e) => setTexts((s) => ({ ...s, notice: e.target.value }))}
                placeholder="空にすると出しません"
              />
            </div>
            <div>
              <label className="adm-label" htmlFor="set-forward">
                {LABELS.forwardingAddress}
              </label>
              <textarea
                id="set-forward"
                className="adm-textarea"
                maxLength={300}
                value={texts.forwardingAddress}
                onChange={(e) => setTexts((s) => ({ ...s, forwardingAddress: e.target.value }))}
                placeholder="匿名配送のときに出品者が送る先（購入者には見せません）"
              />
            </div>
            {toggle("modSpamFilter", "不審な投稿・メッセージを自動で保留にする")}
          </div>
        </div>
      </div>
      <div className="chart-card">
        {error && (
          <p className="adm-msg error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="adm-save" onClick={open}>
          {changes.length > 0 ? `設定を保存（${changes.length}項目）` : "設定を保存"}
        </button>
      </div>

      {confirming && (
        <Modal title="設定を変えますか？" onClose={() => setConfirming(false)} busy={pending}>
          <p>次の項目を変えます。すぐにサイト全体に反映されます。</p>
          <ul className="adm-form" style={{ listStyle: "none" }}>
            {changes.map((c) => (
              <li key={c.label}>
                <strong>{c.label}</strong>
                <div className="adm-pre adm-muted">
                  {c.from} → {c.to}
                </div>
              </li>
            ))}
          </ul>
          {now.maintenance && !saved.maintenance && <p className="adm-danger-text">メンテナンスモードにすると、管理者以外はサイトを使えなくなります。</p>}
          <div className="adm-modal-actions">
            <button type="button" className="adm-btn" onClick={() => setConfirming(false)} disabled={pending}>
              やめる
            </button>
            <button type="button" className="adm-btn primary" onClick={submit} disabled={pending}>
              {pending ? "保存中…" : "保存する"}
            </button>
          </div>
        </Modal>
      )}
    </fieldset>
  );
}
