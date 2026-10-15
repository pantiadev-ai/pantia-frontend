/* 規約・プライバシー・特商法・ヘルプ・お問い合わせで使う囲いと部品（見本 terms.html の形） */
import type { ReactNode } from "react";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import TocNav, { type TocItem } from "./TocNav";
import "@/styles/terms.css";
import "./static-extra.css";

export function StaticShell({ toc, updated, children }: { toc: TocItem[]; updated?: string; children: ReactNode }) {
  return (
    <div className="pg-terms">
      <SiteHeader variant="terms" />
      <main className="page">
        <TocNav items={toc} updated={updated} />
        <div className="main-content">{children}</div>
      </main>
      <SiteFooter variant="terms" />
    </div>
  );
}

export function Hero({ icon, title, updated, children }: { icon: string; title: string; updated?: string; children: ReactNode }) {
  return (
    <div className="page-hero fade-in">
      <h1 className="page-hero-title">
        <span aria-hidden="true">{icon}</span> {title}
      </h1>
      <div className="page-hero-sub">{children}</div>
      {updated ? <div className="updated-badge">📅 {updated}</div> : null}
    </div>
  );
}

export function Section({ id, num, icon, title, children }: { id: string; num: number; icon: string; title: string; children: ReactNode }) {
  return (
    <section className="tos-section fade-in" id={id} aria-labelledby={`${id}-title`}>
      <div className="section-num">Section {String(num).padStart(2, "0")}</div>
      <h2 className="section-title" id={`${id}-title`}>
        <span className="section-icon" aria-hidden="true">
          {icon}
        </span>{" "}
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="subsection">
      <h3 className="sub-title">{title}</h3>
      {children}
    </div>
  );
}

export function Rule({ kind, icon, children }: { kind: "ok" | "ng" | "note"; icon?: string; children: ReactNode }) {
  const mark = icon ?? (kind === "ok" ? "✅" : kind === "ng" ? "❌" : "ℹ️");
  return (
    <div className={`rule-item ${kind}`}>
      <div className="ri-icon" aria-hidden="true">
        {mark}
      </div>
      <div className="ri-text">{children}</div>
    </div>
  );
}

export function RuleList({ children }: { children: ReactNode }) {
  return <div className="rule-list">{children}</div>;
}

/** 表。スマホで横にはみ出すときは、表だけ横に動かせるようにする */
export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="pt-table-wrap">
      <table className="tos-table">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={j === 0 ? "td-label" : undefined}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
