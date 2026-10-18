"use server";
/* 振込先の口座の登録と、振込の申請。
   口座は bank_accounts に本人の権限で upsert（user_id は DB の既定値 auth.uid() に任せる）。
   申請は request_payout（DB の中で、本人確認・口座・申請中の有無・最低額・残高を確かめ、同じ人の申請を1本ずつ通す）。 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionViewer, assertKyc, ActionError, runAction, type ActionResult, type Viewer } from "@/lib/auth";
import { throwDb } from "@/lib/db-errors";
import { RULES, takeRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/** 口座の書き換えは1日10回まで（共通の表に無いので、ここで持つ） */

function hasCtrl(s: string): boolean {
  for (const ch of s) {
    const n = ch.codePointAt(0) ?? 0;
    if (n < 0x20 || (n >= 0x7f && n <= 0x9f)) return true;
  }
  return false;
}

/** 全角の数字を半角に・ひらがなをカタカナに直す（打ち方の違いで弾かない。直した後に形を確かめる） */
function toHalfDigits(s: string): string {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}
function toKatakana(s: string): string {
  return s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

/* DB の CHECK（supabase/migrations/20261015000004_orders_money.sql の bank_accounts）を写したもの */
const BankSchema = z
  .object({
    bank_name: z
      .string()
      .trim()
      .min(1)
      .max(30)
      .refine((s) => !hasCtrl(s)),
    branch_name: z
      .string()
      .trim()
      .min(1)
      .max(30)
      .refine((s) => !hasCtrl(s)),
    account_type: z.enum(["ordinary", "current"]),
    account_number: z
      .string()
      .transform((s) => toHalfDigits(s).replace(/[\s-]/g, ""))
      .pipe(z.string().regex(/^[0-9]{7}$/)),
    holder_kana: z
      .string()
      .transform((s) => toKatakana(s).trim())
      .pipe(
        z
          .string()
          .min(1)
          .max(30)
          .regex(/^[ァ-ヶー　 ]+$/),
      ),
  })
  .strict();

export type BankInput = z.input<typeof BankSchema>;

async function sellerOnly(): Promise<Viewer> {
  const v = await actionViewer();
  if (v.role !== "seller") throw new ActionError("振込は出品者のアカウントで使えます。");
  return v;
}

/** 振込先の口座を登録する（すでにあれば書き換える） */
export async function saveBankAccount(input: BankInput): Promise<ActionResult> {
  return runAction(async () => {
    const v = await sellerOnly();
    const parsed = BankSchema.safeParse(input);
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      if (field === "account_number") throw new ActionError("口座番号は7桁の数字で入れてください。");
      if (field === "holder_kana") throw new ActionError("口座名義はカタカナで入れてください（30字まで）。");
      throw new ActionError("入力の内容を確かめてください。");
    }
    const d = parsed.data;

    const limit = await takeRateLimit([{ rule: RULES.bankUser, kind: "user", id: v.id }], { failClosed: true });
    if (!limit.ok) throw new ActionError(limit.message);

    const supabase = await createClient();
    const { error } = await supabase.from("bank_accounts").upsert(
      {
        bank_name: d.bank_name,
        branch_name: d.branch_name,
        account_type: d.account_type,
        account_number: d.account_number,
        holder_kana: d.holder_kana,
      },
      { onConflict: "user_id" },
    );
    throwDb(error, "口座を保存できませんでした。入力の内容を確かめてください。");

    revalidatePath("/payout");
    return { ok: true, message: "振込先の口座を保存しました。" };
  });
}

/** 振込を申請する。金額の確かめ（最低額・手数料・残高）は DB の request_payout が行う */
export async function requestPayout(amount: number): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const v = await sellerOnly();
    assertKyc(v);
    const parsed = z.number().int().min(1).max(100_000_000).safeParse(amount);
    if (!parsed.success) throw new ActionError("申請する金額を確かめてください。");

    const limit = await takeRateLimit([{ rule: RULES.payoutUser, kind: "user", id: v.id }], { failClosed: true });
    if (!limit.ok) throw new ActionError(limit.message);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("request_payout", { p_amount: parsed.data });
    throwDb(error, "申請できませんでした。時間をおいて、もう一度お試しください。");

    revalidatePath("/payout");
    revalidatePath("/mypage");
    revalidatePath("/mypage/sales");
    return { ok: true, data: { id: String(data) }, message: "振込を申請しました。" };
  });
}
