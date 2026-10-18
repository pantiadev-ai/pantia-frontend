"use server";
/* 商品ページの見積もり（オプションを選び直したときの値段）。
   値段の計算は DB の quote_listing だけが行う（画面では足し算しない）。
   ログインしていない人も値段を見られるので、本人の枠に加えて IP の枠でも数える。 */
import { z } from "zod";
import { ActionError, getViewer, runAction, type ActionResult } from "@/lib/auth";
import { toQuote } from "@/lib/catalogue";
import { throwDb } from "@/lib/db-errors";
import { requestIp, RULES, takeRateLimit, type LimitCheck } from "@/lib/rate-limit";
import { isUuid } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";
import type { Quote } from "@/components/catalogue/types";

const Options = z
  .object({
    worn_days: z.number().int().min(1).max(30).optional(),
    photo: z.boolean().optional(),
    letter: z.boolean().optional(),
    anonymous: z.boolean().optional(),
    video: z.boolean().optional(),
  })
  .strict();

/** 選んだオプションでの値段。使えない組み合わせ・見えない商品は文で返す */
export async function quoteListing(listingId: string, options: unknown): Promise<ActionResult<Quote>> {
  return runAction<Quote>(async () => {
    const viewer = await getViewer();
    if (viewer && viewer.status !== "active") throw new ActionError("このアカウントは利用を停止しています。");
    if (!isUuid(listingId)) throw new ActionError("商品が見つかりません。");
    const parsed = Options.safeParse(options ?? {});
    if (!parsed.success) throw new ActionError("選んだオプションの組み合わせは使えません。");

    const checks: LimitCheck[] = [{ rule: RULES.quoteIp, kind: "ip", id: await requestIp() }];
    if (viewer) checks.unshift({ rule: RULES.quoteUser, kind: "user", id: viewer.id });
    const limit = await takeRateLimit(checks, { failClosed: true });
    if (!limit.ok) throw new ActionError(limit.message);

    // 渡すのは zod で確かめた key だけ（受け取った object をそのまま渡さない）
    const o = parsed.data;
    const opts: { worn_days?: number; photo?: boolean; letter?: boolean; anonymous?: boolean; video?: boolean } = {};
    if (o.worn_days !== undefined) opts.worn_days = o.worn_days;
    if (o.photo) opts.photo = true;
    if (o.letter) opts.letter = true;
    if (o.anonymous) opts.anonymous = true;
    if (o.video) opts.video = true;

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("quote_listing", { p_listing: listingId, p_opts: opts });
    throwDb(error);
    const quote = toQuote(data);
    if (!quote) throw new ActionError("値段を計算できませんでした。");
    return { ok: true, data: quote };
  }, { mail: false });
}
