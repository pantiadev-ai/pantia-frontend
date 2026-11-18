/* 出品の入力の確かめ方と、DB に渡す列。ふつうの出品（lib/actions/listings.ts の saveListing）と
   キャラの出品（管理画面）が同じ物を使う。lib/actions/listings.ts は "use server" で関数しか外へ出せないので、ここに置く。
   node:test から読めるよう、import は相対パスにする。 */
import { z } from "zod";
import { PAID_OPTION_ID, PAID_OPTION_MAX, PAID_OPTION_NAME_MAX, paidOptionsError } from "./paid-options.ts";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const IMAGE_PATH = new RegExp(`^${UUID}/${UUID}\\.webp$`);

/** 制御文字（改行・タブを含む）が入っているか。DB の [[:cntrl:]] と同じ範囲 */
function hasCtrl(s: string): boolean {
  for (const ch of s) {
    const n = ch.codePointAt(0) ?? 0;
    if (n < 0x20 || (n >= 0x7f && n <= 0x9f)) return true;
  }
  return false;
}

/* DB の CHECK（supabase/migrations/20261015000003_catalogue.sql の listings）を写したもの */
export const ListingSchema = z
  .object({
    title: z
      .string()
      .trim()
      .max(40)
      .refine((s) => !hasCtrl(s)),
    description: z.string().trim().max(500),
    category: z.enum(["panty", "bra", "set", "fluid", "clothes", "other"]).nullable(),
    worn_days: z.number().int().min(1).max(6).nullable(),
    material: z.enum(["cotton", "lace", "silk", "nylon", "other"]).nullable(),
    color: z.enum(["white", "black", "pink", "beige", "blue", "other"]).nullable(),
    size: z.enum(["S", "M", "L", "LL", "free"]).nullable(),
    price: z
      .number()
      .int()
      .min(500)
      .max(100000)
      .refine((n) => n % 100 === 0)
      .nullable(),
    stock_mode: z.enum(["single", "multiple"]),
    opt_photo: z.boolean(),
    opt_letter: z.boolean(),
    opt_ziplock: z.boolean(),
    opt_card: z.boolean(),
    opt_video: z.boolean(),
    opt_extend: z.boolean(),
    max_worn_days: z.number().int().min(1).max(6).nullable(),
    request_only: z.boolean(),
    same_day: z.boolean(),
    anonymous_ok: z.boolean(),
    pre_message_ok: z.boolean(),
    followers_only: z.boolean(),
    cool_shipping: z.boolean(),
    ship_estimate: z.enum(["same_next", "d1_2", "d2_3", "d3_5"]),
    ng_note: z.string().trim().max(200),
    // 出品者が決める有料オプション（名前と料金）。細かい決まりは paidOptionsError と DB の paid_options_ok
    paid_options: z
      .array(
        z
          .object({
            id: z.string().regex(PAID_OPTION_ID),
            name: z.string().max(PAID_OPTION_NAME_MAX * 2),
            price: z.number(),
          })
          .strict(),
      )
      .max(PAID_OPTION_MAX),
    image_paths: z.array(z.string().regex(IMAGE_PATH)).max(5),
  })
  .strict();

export type ParsedListing = z.infer<typeof ListingSchema>;

type Completeness = {
  title: string | null;
  description: string | null;
  category: string | null;
  worn_days: number | null;
  price: number | null;
  image_paths: string[] | null;
};

/** 下書き以外にするのに要る項目がそろっているか（DB の listings_complete と同じ）。DB から読んだ行にも使う */
export function isComplete(l: Completeness): boolean {
  const n = l.image_paths?.length ?? 0;
  return !!l.title && !!l.description && !!l.category && l.worn_days != null && l.price != null && n >= 1 && n <= 5;
}

export const INCOMPLETE = "出品するには、写真（1〜5枚）・タイトル・カテゴリ・着用日数・説明・価格を入れてください。";

/** 型の確かめ（ListingSchema）のあとに見る決まり。誤りがあれば画面に出す文、なければ null。
    ownerId は出品の名義になる人（写真はその人のフォルダの物だけ） */
export function listingRowError(d: ParsedListing, ownerId: string): string | null {
  // 写真は名義の人が上げた物だけ（置き場所の頭がその人の id）。重ねて同じ物は入れない
  if (d.image_paths.some((p) => !p.startsWith(`${ownerId}/`)) || new Set(d.image_paths).size !== d.image_paths.length) {
    return "写真をもう一度選び直してください。";
  }
  // 延長できる最大の日数は「日数延長」があるときだけ。標準の着用日数より短くはできない
  const maxWorn = d.opt_extend ? d.max_worn_days : null;
  if (maxWorn !== null && (d.worn_days === null || maxWorn < d.worn_days)) {
    return "延長できる最大の日数は、着用日数と同じか、それより長くしてください。";
  }
  return paidOptionsError(d.paid_options) || null;
}

/** DB に渡す26列。列を1つずつ選んで渡す（受け取った object をそのまま DB に渡さない）。名義と状態は含めない */
export function listingRow(d: ParsedListing) {
  return {
    title: d.title,
    description: d.description,
    category: d.category,
    worn_days: d.worn_days,
    material: d.material,
    color: d.color,
    size: d.size,
    price: d.price,
    stock_mode: d.stock_mode,
    opt_photo: d.opt_photo,
    opt_letter: d.opt_letter,
    opt_ziplock: d.opt_ziplock,
    opt_card: d.opt_card,
    opt_video: d.opt_video,
    opt_extend: d.opt_extend,
    max_worn_days: d.opt_extend ? d.max_worn_days : null,
    request_only: d.request_only,
    same_day: d.same_day,
    anonymous_ok: d.anonymous_ok,
    pre_message_ok: d.pre_message_ok,
    followers_only: d.followers_only,
    cool_shipping: d.cool_shipping,
    ship_estimate: d.ship_estimate,
    ng_note: d.ng_note,
    paid_options: d.paid_options,
    image_paths: d.image_paths,
  };
}

export type ListingRow = ReturnType<typeof listingRow>;
