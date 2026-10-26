"use client";
/* 本人確認の代理提出（/admin/proxy/[id]）。本人から受け取った書類の写真と生年月日を、運営が代わりに出す。
   「本人の同意を得た」の印は必須。出したことは記録に残り、審査はふつうどおり KYC審査の画面で行う。
   写真は本人の画面（components/account/KycForm.tsx）と同じく手元で小さくしてから送る。
   生年月日で18歳未満なら送らない（未成年の書類を預からない）。 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { proxySubmitKyc } from "@/lib/actions/proxy";
import { shrinkImage } from "@/components/ImageUploader";
import { KYC_DOC_TYPES } from "@/lib/labels";
import { KYC_FILE_MAX, KYC_PHOTO_SLOTS, KYC_TOTAL_MAX, type KycPhotoKey } from "@/components/account/options";
import { toneOf, useFlash } from "./Flash";
import { Modal } from "./Modal";
import { san } from "@/lib/format";

type DocType = (typeof KYC_DOC_TYPES)[number]["value"];

/** 生年月日と今日（どちらも YYYY-MM-DD）から満年齢を出す */
function ageOn(birth: string, today: string): number {
  const [by, bm, bd] = birth.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

const NO_FILES: Record<KycPhotoKey, File | null> = { front: null, back: null, selfie: null };

export default function ProxyKycForm({ userId, userName, today }: { userId: string; userName: string; today: string }) {
  const [docType, setDocType] = useState<DocType | "">("");
  const [birthDate, setBirthDate] = useState("");
  const [files, setFiles] = useState(NO_FILES);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const flash = useFlash();
  const router = useRouter();

  const slots = KYC_PHOTO_SLOTS.filter((s) => s.key !== "back" || docType === "license");

  function check(): string | null {
    if (docType === "") return "書類の種類を選んでください。";
    if (birthDate === "" || birthDate < "1900-01-01" || birthDate > today) return "書類に書かれた生年月日を入れてください。";
    if (ageOn(birthDate, today) < 18) {
      return "生年月日では18歳未満です。代理でも登録できません。書類は送らず、ユーザーの詳細からこの人を強制退会にしてください。";
    }
    for (const s of slots) if (s.required && !files[s.key]) return `「${s.name}」の写真を選んでください。`;
    if (!consent) return "本人が、書類を運営に預けて本人確認に使うことに同意したことを確かめてください。";
    return null;
  }

  function open() {
    const e = check();
    setError(e);
    if (!e) setConfirming(true);
  }

  async function build(): Promise<FormData | string> {
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("docType", docType);
    fd.set("birthDate", birthDate);
    fd.set("consent", "1");
    let total = 0;
    for (const s of slots) {
      const f = files[s.key];
      if (!f) continue;
      const blob = await shrinkImage(f, 1600, 0.8);
      if (blob.size > KYC_FILE_MAX) return `「${s.name}」の写真が大きすぎます。JPEG・PNG・WebP の写真を選んでください。`;
      total += blob.size;
      fd.set(s.key, blob, `${s.key}.${blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg"}`);
    }
    if (total > KYC_TOTAL_MAX) return "写真の合計が大きすぎます。本人に撮り直してもらうか、別の写真を選んでください。";
    return fd;
  }

  function submit() {
    start(async () => {
      try {
        const fd = await build();
        if (typeof fd === "string") {
          setConfirming(false);
          setError(fd);
          return;
        }
        const r = await proxySubmitKyc(fd);
        setConfirming(false);
        if (r.ok) {
          setFiles(NO_FILES);
          setConsent(false);
          const msg = r.message ?? "本人確認の書類を出しました。";
          flash(msg, toneOf(msg));
          router.refresh();
        } else {
          setError(r.error);
          router.refresh();
        }
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e) throw e;
        setConfirming(false);
        setError("写真を送れませんでした。通信を確かめて、もう一度お試しください。");
      }
    });
  }

  return (
    <div className="adm-form">
      <div>
        <label className="adm-label" htmlFor="proxy-kyc-doc">
          書類の種類（必須）
        </label>
        <select
          id="proxy-kyc-doc"
          className="adm-select"
          value={docType}
          onChange={(e) => {
            const v = e.target.value as DocType | "";
            setDocType(v);
            if (v !== "license") setFiles((f) => ({ ...f, back: null }));
          }}
          disabled={pending}
        >
          <option value="">選んでください</option>
          {KYC_DOC_TYPES.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      {docType === "mynumber" && (
        <p className="adm-msg error" role="note">
          マイナンバーカードは、顔写真のある表面だけです。裏面（12桁の個人番号がある面）は受け取らない・送らないでください。
        </p>
      )}
      <div>
        <label className="adm-label" htmlFor="proxy-kyc-birth">
          生年月日（必須・書類に書かれたとおりに）
        </label>
        <input
          id="proxy-kyc-birth"
          className="adm-input"
          type="date"
          min="1900-01-01"
          max={today}
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          disabled={pending}
        />
      </div>
      {slots.map((s) => {
        const f = files[s.key];
        return (
          <div key={s.key}>
            <label className="adm-label" htmlFor={`proxy-kyc-${s.key}`}>
              {s.name}（{s.required ? "必須" : "任意"}）: {s.desc}
            </label>
            <input
              id={`proxy-kyc-${s.key}`}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setFiles((cur) => ({ ...cur, [s.key]: file }));
              }}
              disabled={pending}
            />
            <p className="adm-hint">{f ? `選んだ写真: ${f.name}` : "まだ選んでいません"}</p>
          </div>
        );
      })}
      <p className="adm-hint">
        写真は本人から受け取ったものだけを使ってください。送った写真は本人の id の下の非公開の箱に置き、審査が終わってから7日後に消します。
        手元（パソコン・LINE のトーク）に残った写真は、送ったあとに消してください。
      </p>
      <label className="adm-check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={pending} />
        本人が、書類の写真を運営に預けて本人確認に使うことに同意しています
      </label>
      {error && (
        <p className="adm-msg error" role="alert">
          {error}
        </p>
      )}
      <div>
        <button type="button" className="adm-save" onClick={open} disabled={pending}>
          本人確認を代理で出す
        </button>
      </div>
      {confirming && (
        <Modal title="本人確認を代理で出しますか？" onClose={() => setConfirming(false)} busy={pending}>
          <p>
            {san(userName)}の本人確認の書類を出します。出した運営としてあなたの名前が記録に残ります。
          </p>
          <p className="adm-hint">審査はKYC審査の画面でふつうどおり行います。できれば、出した人とは別の運営が審査してください。</p>
          <div className="adm-modal-actions">
            <button type="button" className="adm-btn" onClick={() => setConfirming(false)} disabled={pending}>
              やめる
            </button>
            <button type="button" className="adm-btn primary" onClick={submit} disabled={pending}>
              {pending ? "送信中…" : "出す"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
