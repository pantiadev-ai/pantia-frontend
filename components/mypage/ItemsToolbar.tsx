"use client";
/* 出品の一覧の上の帯（検索・並び順・新規出品）。条件は URL に入れる（読み直しても同じ一覧） */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Props = { q: string; status: string; sort: string };

export default function ItemsToolbar({ q, status, sort }: Props) {
  const router = useRouter();
  const [text, setText] = useState(q);

  function go(next: { q?: string; sort?: string }) {
    const p = new URLSearchParams();
    if (status !== "all") p.set("status", status);
    const qq = (next.q ?? text).trim().slice(0, 50);
    if (qq) p.set("q", qq);
    const ss = next.sort ?? sort;
    if (ss !== "new") p.set("sort", ss);
    const s = p.toString();
    router.push(s ? `/mypage/items?${s}` : "/mypage/items");
  }

  return (
    <form
      className="items-toolbar"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        go({});
      }}
    >
      <div className="items-search">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="search"
          placeholder="商品名で検索"
          aria-label="商品名で検索"
          maxLength={50}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <select className="filter-select" aria-label="並び順" value={sort} onChange={(e) => go({ sort: e.target.value })}>
        <option value="new">新着順</option>
        <option value="sales">売上順</option>
        <option value="views">閲覧数順</option>
      </select>
      <Link href="/listings/new" className="btn-new-item">
        ＋ 新規出品
      </Link>
    </form>
  );
}
