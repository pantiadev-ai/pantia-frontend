/* 丸いアイコン。画像があれば画像、無ければ名前の1字目（見本の「め」）。
   クラス（tw-avatar・as-avatar など）は使う所が渡す。オンラインの点などは children で中に入れる */
import type { ReactNode } from "react";

export default function Avatar({
  url,
  name,
  className,
  children,
}: {
  url: string | null;
  name: string;
  className: string;
  children?: ReactNode;
}) {
  const initial = Array.from(name.trim())[0] ?? "？";
  return (
    <div className={className}>
      {url ? <img src={url} alt="" loading="lazy" /> : initial}
      {children}
    </div>
  );
}
