/* DB の関数が返す jsonb を、形を1つずつ確かめながら読む小道具（形が違っても画面を落とさない）。 */

export function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function list(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.map(obj) : [];
}

/** 数（数字の文字も読む。読めなければ 0） */
export function n(v: unknown): number {
  const x = typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number.NaN;
  return Number.isFinite(x) ? x : 0;
}

/** 数か null（平均の評価など「まだ無い」がある値） */
export function nOrNull(v: unknown): number | null {
  if (v == null) return null;
  const x = typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number.NaN;
  return Number.isFinite(x) ? x : null;
}

export function s(v: unknown): string {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}
