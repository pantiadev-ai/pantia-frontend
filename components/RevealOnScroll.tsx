"use client";
/* 見本の .fade-in（最初は透明で、画面に入ると .visible が付いて現れる）を動かす。
   ページを移って新しく出た要素にも付けるため、DOM の変化も見張る。
   動きを減らす設定の人には、最初から全部見せる。 */
import { useEffect } from "react";

export default function RevealOnScroll() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add("visible"), io.unobserve(e.target))),
      { threshold: 0.05 },
    );
    const scan = () =>
      document.querySelectorAll(".fade-in:not(.visible)").forEach((el) => (reduce ? el.classList.add("visible") : io.observe(el)));
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);
  return null;
}
