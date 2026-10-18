/* 管理画面の小さな部品（表の絞り込み・ページ送り・札・グラフ・空の表示）。
   サーバーの画面から使う。server-only の物は import しない（ブラウザ側の部品からも使えるように）。 */
import Form from "next/form";
import Link from "next/link";
import type { ReactNode } from "react";
import { num } from "@/lib/format";
import type { BadgeInfo } from "./badges";

type Q = Record<string, string | number | null | undefined>;

/** 今の絞り込みを残したまま URL を作る（空の値・1ページ目は付けない） */
export function hrefOf(base: string, q: Q): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === "") continue;
    if (k === "page" && Number(v) <= 1) continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}

export function Badge({ b }: { b: BadgeInfo }) {
  return <span className={`badge ${b.cls}`}>{b.label}</span>;
}

/** 名前の頭文字の丸（顔写真は出さない。管理画面の一覧を軽くするため） */
export function Initial({ name }: { name: string }) {
  const ch = Array.from(name.trim())[0] ?? "?";
  return (
    <span className="td-avatar" aria-hidden="true">
      {ch.toUpperCase()}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="adm-empty">{children}</div>;
}

const SearchIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
);

export type FilterSelect = {
  name: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
};

/** 表の上の絞り込み（GET のフォーム。URL に残るので、戻る・共有ができる） */
export function FilterBar({
  action,
  title,
  search,
  selects = [],
  keep = {},
}: {
  action: string;
  title?: ReactNode;
  search?: { value: string; placeholder: string };
  selects?: FilterSelect[];
  /** 絞り込みと一緒に残す値（タブなど） */
  keep?: Record<string, string>;
}) {
  return (
    <Form action={action} className="table-toolbar" role="search">
      {title}
      {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      {search && (
        <div className="tbl-search">
          <SearchIcon />
          <input type="search" name="q" defaultValue={search.value} placeholder={search.placeholder} maxLength={50} aria-label={search.placeholder} />
        </div>
      )}
      {selects.map((s) => (
        <select key={s.name} className="tbl-select" name={s.name} defaultValue={s.value} aria-label={s.label}>
          {s.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
      <button type="submit" className="tbl-btn">
        絞り込む
      </button>
    </Form>
  );
}

/** 表の下の件数とページ送り */
export function Pager({ base, q, page, total, size = 20 }: { base: string; q: Q; page: number; total: number; size?: number }) {
  const pages = Math.max(1, Math.ceil(total / size));
  const from = total === 0 ? 0 : Math.min(total, (page - 1) * size + 1);
  const to = Math.min(total, page * size);
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const nums: number[] = [];
  for (let i = start; i <= Math.min(pages, start + 4); i++) nums.push(i);
  const prev = page > 1;
  const next = page < pages;
  return (
    <div className="table-footer">
      <div className="tbl-count">
        全 {num(total)}件中 {from === 0 ? 0 : `${from}-${to}`}件表示
      </div>
      <nav className="pagination" aria-label="ページ送り">
        <Link
          className={`pg-btn${prev ? "" : " disabled"}`}
          href={hrefOf(base, { ...q, page: Math.max(1, page - 1) })}
          aria-label="前のページ"
          aria-disabled={!prev}
          tabIndex={prev ? undefined : -1}
        >
          ‹
        </Link>
        {nums.map((n) => (
          <Link key={n} className={`pg-btn${n === page ? " active" : ""}`} href={hrefOf(base, { ...q, page: n })} aria-current={n === page ? "page" : undefined}>
            {n}
          </Link>
        ))}
        <Link
          className={`pg-btn${next ? "" : " disabled"}`}
          href={hrefOf(base, { ...q, page: Math.min(pages, page + 1) })}
          aria-label="次のページ"
          aria-disabled={!next}
          tabIndex={next ? undefined : -1}
        >
          ›
        </Link>
      </nav>
    </div>
  );
}

/** 絞り込みのタブ（リンク。見本の period-btn の形） */
export function Tabs({ items, active }: { items: { key: string; label: ReactNode; href: string }[]; active: string }) {
  return (
    <nav className="period-btns adm-tabs" aria-label="表示の切り替え">
      {items.map((t) => (
        <Link key={t.key} href={t.href} className={`period-btn${t.key === active ? " active" : ""}`} aria-current={t.key === active ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export type KpiTone = "pk" | "green" | "yellow" | "blue";

export function Kpi({ tone, label, value, sub }: { tone: KpiTone; label: string; value: string; sub?: ReactNode }) {
  return (
    <div className={`kpi-card ${tone}`}>
      <div className="kpi-label">{label}</div>
      <div className={`kpi-num ${tone}`}>{value}</div>
      {sub != null && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

/** 先月と比べた増減（↑ 18% / ↓ 3件） */
export function Diff({ now, prev, unit }: { now: number; prev: number; unit: "%" | "件" | "人" }) {
  if (unit === "%") {
    if (prev <= 0) return <span className="adm-muted">先月の実績なし</span>;
    const pct = Math.round(((now - prev) / prev) * 100);
    return pct >= 0 ? <span className="kpi-up">↑ {pct}%</span> : <span className="kpi-down">↓ {Math.abs(pct)}%</span>;
  }
  const d = now - prev;
  return d >= 0 ? (
    <span className="kpi-up">
      ↑ {num(d)}
      {unit}
    </span>
  ) : (
    <span className="kpi-down">
      ↓ {num(Math.abs(d))}
      {unit}
    </span>
  );
}

export type Bar = { label: string; value: number; tip: string };

/** 棒グラフ（CSS だけ。最後の棒を濃くする＝見本の active） */
export function BarChart({ data, height = 130, tone = "pk", label }: { data: Bar[]; height?: number; tone?: "pk" | "green"; label: string }) {
  const max = Math.max(0, ...data.map((d) => d.value));
  const active = tone === "green" ? "linear-gradient(180deg, #7FE3A8, var(--green2))" : "linear-gradient(180deg, var(--pk4), var(--pk3))";
  const idle = tone === "green" ? "rgba(46,204,113,0.25)" : "rgba(196,85,232,0.25)";
  return (
    <div className="bar-chart" style={{ height }} role="img" aria-label={`${label}: ${data.map((d) => `${d.label} ${d.tip}`).join("、")}`}>
      {data.map((d, i) => {
        const h = max > 0 ? Math.max(2, Math.round((d.value / max) * (height - 20))) : 2;
        return (
          <div className="bar-wrap" key={`${d.label}-${i}`}>
            <div className="bar" style={{ height: h, background: i === data.length - 1 ? active : idle }}>
              <div className="bar-tip">{d.tip}</div>
            </div>
            <div className="bar-lbl">{d.label}</div>
          </div>
        );
      })}
    </div>
  );
}

export type Slice = { label: string; value: number; color: string };

/** ドーナツのグラフ（SVG。見本と同じ半径 40・太さ 18） */
export function Donut({ slices, center }: { slices: Slice[]; center: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const C = 2 * Math.PI * 40;
  // 弧の長さと始まりの位置を先に数える（描く途中で変数を書き換えない）
  const arcs: { label: string; color: string; len: number; start: number }[] = [];
  let start = 0;
  for (const s of slices) {
    const len = total > 0 ? (s.value / total) * C : 0;
    arcs.push({ label: s.label, color: s.color, len, start });
    start += len;
  }
  return (
    <div className="donut-wrap">
      <svg className="donut-svg" width="110" height="110" viewBox="0 0 110 110" role="img" aria-label={`合計 ${center}`}>
        <circle cx="55" cy="55" r="40" fill="none" stroke="#2C1F3A" strokeWidth="18" />
        {total > 0 &&
          arcs.map((a) => (
            <circle
              key={a.label}
              cx="55"
              cy="55"
              r="40"
              fill="none"
              stroke={a.color}
              strokeWidth="18"
              strokeDasharray={`${a.len} ${C - a.len}`}
              strokeDashoffset={-a.start}
              transform="rotate(-90 55 55)"
            />
          ))}
        <text x="55" y="59" textAnchor="middle" fontSize="11" fontWeight="800" fill="#F0E8FF" fontFamily="Sora, sans-serif">
          {center}
        </text>
      </svg>
      <div className="donut-legend">
        {slices.map((s) => (
          <div className="dl-item" key={s.label}>
            <div className="dl-dot" style={{ background: s.color }} /> {s.label}{" "}
            <span className="dl-pct">{total > 0 ? Math.round((s.value / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 詳細ページの見出しと値の並び */
export function Dl({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="adm-dl">
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <dt>{k}</dt>
          <dd>{v === "" || v == null ? <span className="adm-muted">—</span> : v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 管理画面のカード（見本の chart-card＋card-header） */
export function Card({ icon, tone = "pk", title, right, children }: { icon: string; tone?: "pk" | "green" | "yellow" | "red" | "blue"; title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="chart-card">
      <div className="card-header">
        <div className="card-title">
          <span className={`pill pill-${tone}`} aria-hidden="true">
            {icon}
          </span>{" "}
          {title}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

/** 表の上の見出し（見本の table-toolbar の中の card-title） */
export function TableTitle({ icon, tone = "pk", children }: { icon: string; tone?: "pk" | "green" | "yellow" | "red" | "blue"; children: ReactNode }) {
  return (
    <div className="card-title" style={{ fontSize: 14 }}>
      <span className={`pill pill-${tone}`} aria-hidden="true">
        {icon}
      </span>{" "}
      {children}
    </div>
  );
}
