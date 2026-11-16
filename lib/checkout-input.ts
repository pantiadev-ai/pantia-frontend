/* 購入の手続き（lib/actions/checkout.ts の placeOrder）の入力を確かめる。
   ・郵便番号は、設定の画面のお届け先と同じ決まり（components/account/options.ts の normalizePostal）。全角の数字・ハイフンも半角にそろえてから確かめる。
   ・電話番号は、全角を半角にしてから数字だけを残す（前の決まりで通っていた「090.1234.5678」のような書き方も、そのまま通す）。
   ・誤りの文は、最初に違う欄を画面の欄の名前で名指しする（「お届け先を確かめてください」だけだと、どこを直すか分からない）。
   ・サーバーの部品を読まない形にしてある（tests/unit から直に試すため）。 */
import { z } from "zod";
import { normalizePostal, toHalfWidth } from "../components/account/options.ts";
import { isUuid } from "./search.ts";

/** 電話番号を数字だけにする（DB はハイフン無しの 0 から始まる10〜11桁）。形が違えば null */
function checkoutPhone(s: string): string | null {
  const d = toHalfWidth(s).replace(/[^0-9]/g, "");
  return /^0\d{9,10}$/.test(d) ? d : null;
}

/** 形をそろえる関数を通して、通らなければその欄の誤りにする */
function normalized(fn: (s: string) => string | null, max: number) {
  return z
    .string()
    .max(max)
    .refine((s) => fn(s) !== null)
    .transform((s) => fn(s) ?? "");
}

// 並びは画面の欄の順（違う欄が2つ以上あれば、上の欄の文を出す）
const Address = z
  .object({
    name: z.string().trim().min(1).max(30),
    postal: normalized(normalizePostal, 20),
    prefecture: z.string().trim().min(2).max(4),
    address1: z.string().trim().min(1).max(100),
    address2: z.string().trim().max(100).default(""),
    phone: normalized(checkoutPhone, 30),
  })
  .strict();

const PlaceInput = z
  .object({
    listingIds: z.array(z.string().refine(isUuid)).min(1).max(10),
    method: z.enum(["card", "bank", "paypay", "transfer", "mock"]),
    address: Address,
    saveAddress: z.boolean().optional(),
  })
  .strict();

export type PlaceOrderInput = z.input<typeof PlaceInput>;
export type PlaceOrderData = z.output<typeof PlaceInput>;

const FIELD_MESSAGES: Record<string, string> = {
  name: "お名前を入れてください（30字まで）。",
  postal: "郵便番号は7桁の数字で入れてください。",
  prefecture: "都道府県を選んでください。",
  address1: "市区町村・番地を入れてください（100字まで）。",
  address2: "建物名・部屋番号は100字までで入れてください。",
  phone: "電話番号は 0 から始まる10〜11桁で入れてください。",
};

function messageOf(path: readonly PropertyKey[] | undefined): string {
  const [top, field] = path ?? [];
  if (top !== "address") return "カートの中身と支払い方法を確かめてください。";
  return (typeof field === "string" && FIELD_MESSAGES[field]) || "お届け先を確かめてください。";
}

/** 通れば形をそろえた値、通らなければ画面に出す一言 */
export function parsePlaceInput(input: unknown): { ok: true; data: PlaceOrderData } | { ok: false; message: string } {
  const parsed = PlaceInput.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, message: messageOf(parsed.error.issues[0]?.path) };
}
