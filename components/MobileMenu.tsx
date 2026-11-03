"use client";
/* スマホの右上の「☰ メニュー」。押すと画面いっぱいの白い板（dialog）が開き、主な画面とログアウトへ行ける。PC では CSS で隠す。
   板は開いている間だけ body の直下へ portal で出す（ヘッダーの backdrop-filter の中に閉じ込められず、
   閉じている間はログアウトのフォームが頭の物1つだけになる）。Esc と「閉じる」で閉じ、行き先を押しても閉じる。 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type MenuLink = { href: string; label: string };

type Props = {
  links: MenuLink[];
  /** ログイン中なら「○○さん」。あるときだけ、ログイン中の名前とログアウトを出す */
  signedInAs?: string;
};

export default function MobileMenu({ links, signedInAs }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDialogElement>(null);

  // 板は開いたあとに描くので、描いてから modal で開く（下のページを押せなくし、Esc で閉じられる）
  useEffect(() => {
    if (open && box.current && !box.current.open) box.current.showModal();
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <button type="button" className="pt-mmenu-btn" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <span aria-hidden="true">☰</span> メニュー
      </button>
      {open
        ? createPortal(
            <dialog ref={box} className="pt-mmenu" aria-label="メニュー" onClose={close}>
              <div className="pt-mmenu-top">
                <p className="pt-mmenu-who">{signedInAs ? `${signedInAs}でログイン中` : "メニュー"}</p>
                <button type="button" className="pt-mmenu-close" onClick={close}>
                  <span aria-hidden="true">✕</span> 閉じる
                </button>
              </div>
              <nav aria-label="スマホのメニュー" className="pt-mmenu-links">
                {links.map((l) => (
                  <Link key={l.href} href={l.href} onClick={close}>
                    {l.label}
                  </Link>
                ))}
              </nav>
              {signedInAs ? (
                // ログアウトは POST だけ（app/auth/signout）。押しやすいように幅いっぱい・高さ 52px
                <form action="/auth/signout" method="post" className="pt-mmenu-out">
                  <button type="submit">ログアウト</button>
                </form>
              ) : null}
            </dialog>,
            document.body,
          )
        : null}
    </>
  );
}
