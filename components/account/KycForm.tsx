"use client";
/* 本人確認の提出。写真は手元で小さくしてから送る（書類の画像は送った後、本人にも見せない） */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { submitKyc } from "@/lib/actions/kyc";
import { FormMessage, useAction } from "@/components/useAction";
import { shrinkImage } from "@/components/ImageUploader";
import { KYC_DOC_TYPES } from "@/lib/labels";
import type { ActionResult } from "@/lib/action-result";
import { KYC_FILE_MAX, KYC_PHOTO_SLOTS, KYC_TOTAL_MAX, type KycPhotoKey } from "@/components/account/options";

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

export default function KycForm({ mode, today }: { mode: "manual" | "trustdock"; today: string }) {
  const [docType, setDocType] = useState<DocType | "">("");
  const [birthDate, setBirthDate] = useState("");
  const [files, setFiles] = useState(NO_FILES);
  const [agree, setAgree] = useState(false);
  const { pending, error, message, run, setError } = useAction();
  const router = useRouter();

  const slots = KYC_PHOTO_SLOTS.filter((s) => s.key !== "back" || docType === "license");
  const photosReady = mode !== "manual" || slots.every((s) => !s.required || files[s.key]);
  const ready = docType !== "" && birthDate !== "" && agree && photosReady;

  async function send(): Promise<ActionResult<{ nextUrl: string | null }>> {
    const fd = new FormData();
    fd.set("docType", docType);
    fd.set("birthDate", birthDate);
    fd.set("agree", "1");
    if (mode === "manual") {
      let total = 0;
      for (const s of slots) {
        const f = files[s.key];
        if (!f) continue;
        const blob = await shrinkImage(f, 1600, 0.8);
        if (blob.size > KYC_FILE_MAX) {
          return { ok: false, error: `「${s.name}」の写真が大きすぎます。JPEG・PNG・WebP の写真を選んでください。` };
        }
        total += blob.size;
        fd.set(s.key, blob, `${s.key}.${blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg"}`);
      }
      if (total > KYC_TOTAL_MAX) {
        return { ok: false, error: "写真の合計が大きすぎます。明るい所で撮り直すか、別の写真を選んでください。" };
      }
    }
    return submitKyc(fd);
  }

  return (
    <form
      className="acc-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        if (birthDate < "1900-01-01" || birthDate > today) {
          setError("生年月日を確かめてください。");
          return;
        }
        if (ageOn(birthDate, today) < 18) {
          setError("18歳未満の方はご利用いただけません。");
          return;
        }
        run(send, (data) => {
          if (data?.nextUrl) window.location.assign(data.nextUrl);
          else router.refresh();
        });
      }}
    >
      <div className="acc-grid">
        <label className="acc-field">
          <span className="acc-label">
            書類の種類<span className="acc-req">必須</span>
          </span>
          <select
            className="acc-input"
            required
            value={docType}
            onChange={(e) => {
              const v = e.target.value as DocType | "";
              setDocType(v);
              if (v !== "license") setFiles((f) => ({ ...f, back: null }));
            }}
          >
            <option value="">選んでください</option>
            {KYC_DOC_TYPES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="acc-field">
          <span className="acc-label">
            生年月日<span className="acc-req">必須</span>
          </span>
          <input
            className="acc-input"
            type="date"
            required
            min="1900-01-01"
            max={today}
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />
        </label>
      </div>

      {docType === "mynumber" && (
        <div className="acc-box warn">
          マイナンバーカードは、顔写真のある表面だけを撮ってください。裏面（12桁の個人番号がある面）は撮らない・送らないでください。
        </div>
      )}

      {mode === "manual" ? (
        <>
          <div className="acc-photos">
            {slots.map((s) => {
              const f = files[s.key];
              return (
                <label className={`acc-photo${f ? " is-set" : ""}`} key={s.key}>
                  <span className="acc-photo-name">
                    {s.name}
                    {s.required ? <span className="acc-req">必須</span> : <span className="acc-note">（任意）</span>}
                  </span>
                  <span className="acc-note">{s.desc}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setFiles((cur) => ({ ...cur, [s.key]: file }));
                    }}
                  />
                  <span className="acc-photo-file">{f ? `選んだ写真: ${f.name}` : "まだ選んでいません"}</span>
                </label>
              );
            })}
          </div>
          <p className="acc-note">
            写真は JPEG・PNG・WebP で送ってください。光の反射や指で文字が隠れないように撮ってください。送った写真は、審査が終わってから7日後に消します。
          </p>
        </>
      ) : (
        <p className="acc-note">「提出する」を押すと、本人確認の会社（TRUSTDOCK）の画面に移ります。そこで書類と顔の撮影をしてください。</p>
      )}

      <label className="acc-check">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>
          本人確認のためだけに書類の情報を使うことと、<Link href="/privacy">プライバシーポリシー</Link>に同意します。
        </span>
      </label>

      <FormMessage error={error} message={message} />
      <div className="acc-actions">
        <button type="submit" className="pt-btn primary" disabled={pending || !ready}>
          {pending ? "送信中…" : "提出する"}
        </button>
      </div>
    </form>
  );
}
