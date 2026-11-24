"use client";
/* 出品一覧（/admin/items）の「出品日を変える」。
   窓の欄は日本時間。今より先・2000年より前はここで断り、server action と DB でも同じことを確かめる。
   変わるのは商品ページの「出品日」と新着の並びだけで、フォロワーへの知らせは出し直さない。 */
import { useCallback, useState, useTransition } from "react";
import { setListingPublishedAt } from "@/lib/actions/admin";
import { isoToJstLocal, jstLocalToIso, publishedAtError } from "@/lib/published-at";
import { toneOf, useFlash } from "./Flash";
import { Modal } from "./Modal";

export default function PublishedAtEditor({ listingId, publishedAt }: { listingId: string; publishedAt: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [max, setMax] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const flash = useFlash();

  function show() {
    setValue(isoToJstLocal(publishedAt));
    setMax(isoToJstLocal(new Date().toISOString()));
    setError(null);
    setOpen(true);
  }

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  function submit() {
    setError(null);
    const iso = jstLocalToIso(value);
    const bad = iso ? publishedAtError(iso, new Date()) : "日時を確かめてください。";
    if (bad) {
      setError(bad);
      return;
    }
    start(async () => {
      try {
        const r = await setListingPublishedAt(listingId, value);
        if (r.ok) {
          setOpen(false);
          const msg = r.message ?? "済みました。";
          flash(msg, toneOf(msg));
        } else {
          setError(r.error);
        }
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e) throw e;
        setError("通信に失敗しました。もう一度お試しください。");
      }
    });
  }

  const inputId = `pa-${listingId}`;
  return (
    <>
      <button type="button" className="action-btn" onClick={show}>
        出品日を変える
      </button>
      {open && (
        <Modal title="出品日を変える" onClose={close} busy={pending}>
          <p>商品ページの出品日と、新着の並びが変わります。フォロワーへの通知は出し直しません。</p>
          <div>
            <label className="adm-label" htmlFor={inputId}>
              出品日（日本時間）
            </label>
            <input
              id={inputId}
              type="datetime-local"
              step={60}
              max={max || undefined}
              className="adm-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={pending}
            />
          </div>
          {error && (
            <p className="adm-msg error" role="alert">
              {error}
            </p>
          )}
          <div className="adm-modal-actions">
            <button type="button" className="adm-btn" onClick={close} disabled={pending}>
              やめる
            </button>
            <button type="button" className="adm-btn primary" onClick={submit} disabled={pending}>
              {pending ? "送信中…" : "変える"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
