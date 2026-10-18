/* ページ送り（見本の .pagination／.page-btn）。リンクで移るので JavaScript が無くても動く */
import Link from "next/link";

type Props = {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
  className?: string;
};

/** 出す番号: 1・今の前後・最後。間が空くところは「…」 */
function pageList(page: number, total: number): (number | "dots")[] {
  const want = new Set([1, total, page - 1, page, page + 1].filter((n) => n >= 1 && n <= total));
  const sorted = [...want].sort((a, b) => a - b);
  const out: (number | "dots")[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1]! > 1) out.push("dots");
    out.push(n);
  });
  return out;
}

export default function Pager({ page, totalPages, hrefFor, className = "pagination" }: Props) {
  if (totalPages <= 1) return null;
  return (
    <div className={className} role="navigation" aria-label="ページ送り">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className="page-btn" aria-label="前のページ">
          ‹
        </Link>
      ) : (
        <span className="page-btn cat-disabled" aria-hidden="true">
          ‹
        </span>
      )}
      {pageList(page, totalPages).map((n, i) =>
        n === "dots" ? (
          <span key={`d${i}`} className="page-btn dots">
            …
          </span>
        ) : n === page ? (
          <span key={n} className="page-btn active" aria-current="page">
            {n}
          </span>
        ) : (
          <Link key={n} href={hrefFor(n)} className="page-btn">
            {n}
          </Link>
        ),
      )}
      {page < totalPages ? (
        <Link href={hrefFor(page + 1)} className="page-btn" aria-label="次のページ">
          ›
        </Link>
      ) : (
        <span className="page-btn cat-disabled" aria-hidden="true">
          ›
        </span>
      )}
    </div>
  );
}
