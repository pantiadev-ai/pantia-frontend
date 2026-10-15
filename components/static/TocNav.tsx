"use client";
/* 規約などの左の目次。いま読んでいる節に色を付ける（見本 terms.html の script と同じ考え） */
import { useEffect, useState } from "react";

export type TocItem = { id: string; label: string };

export default function TocNav({ items, updated }: { items: TocItem[]; updated?: string }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  const ids = items.map((i) => i.id).join(",");

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    for (const id of ids.split(",")) {
      const el = id ? document.getElementById(id) : null;
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, [ids]);

  return (
    <aside className="toc fade-in" aria-label="目次">
      <div className="toc-title">目次</div>
      <nav>
        {items.map((it) => (
          <a key={it.id} href={`#${it.id}`} className={`toc-item${active === it.id ? " active" : ""}`} aria-current={active === it.id ? "location" : undefined}>
            {it.label}
          </a>
        ))}
      </nav>
      {updated ? (
        <>
          <hr className="toc-divider" />
          <div className="toc-updated">
            最終更新
            <br />
            {updated}
          </div>
        </>
      ) : null}
    </aside>
  );
}
