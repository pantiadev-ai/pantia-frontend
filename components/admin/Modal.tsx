"use client";
/* 確認の窓。表の枠（backdrop-filter）や .fade-in（transform）の中に置くと position:fixed が枠の中に閉じ込められるので、
   .pg-admin の直下へ portal で出す。Esc で閉じる。開いている間は押した操作を二重に送らない（busy）。 */
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function Modal({
  title,
  onClose,
  busy = false,
  children,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  useEffect(() => {
    // 開いたら、最初の入力欄（無ければ窓）に移る（キーボードで操作できるように）
    const el = box.current;
    if (!el) return;
    const first = el.querySelector<HTMLElement>("textarea, input, select");
    (first ?? el).focus();
  }, []);

  // 窓はボタンを押したあとにだけ出る（サーバーでは描かれない）ので、ここで document を読んでよい
  const host = typeof document === "undefined" ? null : (document.querySelector(".pg-admin") ?? document.body);
  if (!host) return null;

  return createPortal(
    <div
      className="adm-modal-back"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="adm-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={box} tabIndex={-1}>
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>,
    host,
  );
}
