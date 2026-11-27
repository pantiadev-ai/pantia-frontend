/* 管理画面のページ送りの数（components/admin/parts.tsx の Pager が使う）。
   import なし（node:test からそのまま読む）。 */

export type PagerModel = {
  /** 全体のページ数（0件でも1） */
  pages: number;
  /** 表示している範囲（「全 N件中 from-to件表示」）。0件なら 0 */
  from: number;
  to: number;
  /** 並べる番号（最大5つ）。far は今のページから2つ以上離れた番号で、スマホでは隠す */
  nums: { n: number; far: boolean }[];
  /** 前・次に進めるか（最初・最後のページへの «» も同じ条件） */
  prev: boolean;
  next: boolean;
};

export function pagerModel(page: number, total: number, size: number): PagerModel {
  const pages = Math.max(1, Math.ceil(total / size));
  const from = total === 0 ? 0 : Math.min(total, (page - 1) * size + 1);
  const to = Math.min(total, page * size);
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const nums: PagerModel["nums"] = [];
  for (let n = start; n <= Math.min(pages, start + 4); n++) nums.push({ n, far: Math.abs(n - page) >= 2 });
  return { pages, from, to, nums, prev: page > 1, next: page < pages };
}
