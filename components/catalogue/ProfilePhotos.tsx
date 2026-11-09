"use client";
/* 出品者のページの自己紹介の下に並ぶプロフィール写真（最大6枚）。押すと画面いっぱいの窓（dialog）で大きく見られ、
   「前の写真」「次の写真」で送れる。左右の矢印キーでも送れ、Esc と「閉じる」と窓の外を押すと閉じる。
   窓は開いている間だけ body の直下へ portal で出す（自己紹介の板の backdrop-filter の中に閉じ込めない。MobileMenu と同じ） */
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";

export default function ProfilePhotos({ urls }: { urls: string[] }) {
  const [index, setIndex] = useState<number | null>(null);
  const box = useRef<HTMLDialogElement>(null);
  const open = index !== null;

  useEffect(() => {
    if (open && box.current && !box.current.open) box.current.showModal();
  }, [open]);

  if (urls.length === 0) return null;

  const close = () => setIndex(null);
  const step = (d: -1 | 1) => setIndex((i) => (i === null ? i : (i + d + urls.length) % urls.length));
  const onKey = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === "ArrowRight") step(1);
  };
  // 窓の外（暗い所）を押したら閉じる。中の写真やボタンを押したときは閉じない
  const onBackdrop = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) close();
  };

  return (
    <>
      <ul className="profile-photos" aria-label="プロフィール写真">
        {urls.map((url, i) => (
          <li key={url}>
            <button type="button" className="profile-photo" aria-label={`写真 ${i + 1} を大きく見る`} onClick={() => setIndex(i)}>
              <img src={url} alt="" loading="lazy" decoding="async" />
            </button>
          </li>
        ))}
      </ul>
      {open
        ? createPortal(
            <dialog ref={box} className="pt-photo-viewer" aria-label="プロフィール写真" onClose={close} onKeyDown={onKey} onClick={onBackdrop}>
              <div className="pt-photo-viewer-top">
                <p className="pt-photo-viewer-count">
                  {index + 1} / {urls.length}
                </p>
                <button type="button" className="pt-photo-viewer-close" onClick={close}>
                  <span aria-hidden="true">✕</span> 閉じる
                </button>
              </div>
              <div className="pt-photo-viewer-body">
                <img src={urls[index]} alt={`写真 ${index + 1}`} />
              </div>
              {urls.length > 1 ? (
                <div className="pt-photo-viewer-nav">
                  <button type="button" onClick={() => step(-1)}>
                    <span aria-hidden="true">‹</span> 前の写真
                  </button>
                  <button type="button" onClick={() => step(1)}>
                    次の写真 <span aria-hidden="true">›</span>
                  </button>
                </div>
              ) : null}
            </dialog>,
            document.body,
          )
        : null}
    </>
  );
}
