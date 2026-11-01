/* 出品者が自分で決める有料オプション（名前と料金）。出品の listings.paid_options（jsonb の配列）に入る。
   決まりは DB の paid_options_ok（supabase/migrations/20261101000011_transfer_paid_options.sql）と同じ。
   画面（出品のフォーム）と server action の両方で使うので、server-only にはしない。 */

export type PaidOption = { id: string; name: string; price: number };

export const PAID_OPTION_MAX = 10;
export const PAID_OPTION_NAME_MAX = 30;
export const PAID_OPTION_PRICE_MIN = 100;
export const PAID_OPTION_PRICE_MAX = 50_000;
export const PAID_OPTION_ID = /^[a-z0-9]{1,12}$/;

/** 出品のフォームで出す名前の候補（自由に書き換えられる） */
export const PAID_OPTION_SUGGESTIONS = [
  "おもらし",
  "トイレ後パンツでふいてそのまま",
  "おしっこでびちょびちょにして発送",
  "着衣オナニー済",
  "おな動画",
  "着用写真集",
  "オナニーした綿棒・ディルドのセット販売",
] as const;

/** 制御文字（改行・タブを含む）が入っているか。DB の [[:cntrl:]] と同じ範囲 */
function hasCtrl(s: string): boolean {
  for (const ch of s) {
    const n = ch.codePointAt(0) ?? 0;
    if (n < 0x20 || (n >= 0x7f && n <= 0x9f)) return true;
  }
  return false;
}

const priceOk = (n: number) =>
  Number.isInteger(n) && n >= PAID_OPTION_PRICE_MIN && n <= PAID_OPTION_PRICE_MAX && n % 100 === 0;

/** 並びが決まりに合わなければ、直し方の文を返す（合えば null） */
export function paidOptionsError(list: PaidOption[]): string | null {
  if (list.length > PAID_OPTION_MAX) return `有料オプションは${PAID_OPTION_MAX}件までです。`;
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const o of list) {
    const len = Array.from(o.name).length;
    if (len === 0) return "有料オプションの名前を入れてください。";
    if (len > PAID_OPTION_NAME_MAX || o.name !== o.name.trim() || hasCtrl(o.name)) {
      return `有料オプションの名前は${PAID_OPTION_NAME_MAX}字まで（改行なし）で入れてください。`;
    }
    if (names.has(o.name)) return `同じ名前の有料オプション（${o.name}）が2つあります。`;
    if (!priceOk(o.price)) {
      return `有料オプションの料金は¥${PAID_OPTION_PRICE_MIN}〜¥${PAID_OPTION_PRICE_MAX.toLocaleString("ja-JP")}の間で、100円単位で入れてください。`;
    }
    if (!PAID_OPTION_ID.test(o.id) || ids.has(o.id)) return "有料オプションを一度消して、入れ直してください。";
    ids.add(o.id);
    names.add(o.name);
  }
  return null;
}

/** DB から読んだ値（jsonb）を並びに。形の合わない要素は捨てる */
export function toPaidOptions(v: unknown): PaidOption[] {
  if (!Array.isArray(v)) return [];
  const out: PaidOption[] = [];
  for (const e of v) {
    if (!e || typeof e !== "object") continue;
    const { id, name, price } = e as Record<string, unknown>;
    if (typeof id === "string" && typeof name === "string" && typeof price === "number") out.push({ id, name, price });
  }
  return out;
}

/** 新しいオプションの id（小文字と数字の8字）。使っている id とは重ねない */
export function newPaidOptionId(taken: ReadonlySet<string>): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const id = Array.from(bytes, (b) => chars[b % chars.length]).join("");
    if (!taken.has(id)) return id;
  }
}
