"use client";
/* 出品者ページのタブ。中身はサーバーで作って受け取り、見せる1つだけを切り替える。
   今のタブは URL の ?tab= に残す（読み直し・共有しても同じタブが開く） */
import { useState, type ReactNode } from "react";

export type SellerTab = { key: string; label: string; content: ReactNode };

export default function SellerTabs({ tabs, initial }: { tabs: SellerTab[]; initial: string }) {
  const [current, setCurrent] = useState(tabs.some((t) => t.key === initial) ? initial : (tabs[0]?.key ?? ""));

  function choose(key: string) {
    setCurrent(key);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", key);
    url.searchParams.delete("page");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }

  return (
    <>
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={t.key === current}
            aria-controls={`panel-${t.key}`}
            className={`tab${t.key === current ? " active" : ""}`}
            onClick={() => choose(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} className="tab-panel" id={`panel-${t.key}`} role="tabpanel" aria-labelledby={`tab-${t.key}`} hidden={t.key !== current}>
          {t.content}
        </div>
      ))}
    </>
  );
}
