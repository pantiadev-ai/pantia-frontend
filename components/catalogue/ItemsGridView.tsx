"use client";
/* 件数と、並べ方（グリッド／リスト）の切り替え。商品のカードはサーバーで作って children で受け取る */
import { useState, type ReactNode } from "react";
import { num } from "@/lib/format";

export default function ItemsGridView({ total, children }: { total: number; children: ReactNode }) {
  const [view, setView] = useState<"grid" | "list">("grid");
  return (
    <>
      <div className="result-header">
        <div className="result-count">
          <strong>{num(total)}</strong> 件の商品
        </div>
        <div className="view-toggle">
          <button
            type="button"
            className={`view-btn${view === "grid" ? " active" : ""}`}
            title="グリッド表示"
            aria-label="グリッド表示"
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
          >
            ⊞
          </button>
          <button
            type="button"
            className={`view-btn${view === "list" ? " active" : ""}`}
            title="リスト表示"
            aria-label="リスト表示"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            ☰
          </button>
        </div>
      </div>
      <div className={`items-grid${view === "list" ? " list-view" : ""}`}>{children}</div>
    </>
  );
}
