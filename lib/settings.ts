/* 運営の設定のうち、誰でも読める列（手数料・最低振込額・メンテナンス中・お知らせ）。
   匿名配送の転送先などの非公開の列は、ここでは読まない（列の権限も無い）。 */
import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type PublicSettings = {
  feeRate: number;
  anonymousFee: number;
  minPayout: number;
  payoutFee: number;
  autoCompleteDays: number;
  videoFee: number;
  extendFeePerDay: number;
  registrationOpen: boolean;
  maintenance: boolean;
  notice: string;
};

const FALLBACK: PublicSettings = {
  feeRate: 0.15,
  anonymousFee: 300,
  minPayout: 3000,
  payoutFee: 0,
  autoCompleteDays: 7,
  videoFee: 800,
  extendFeePerDay: 500,
  registrationOpen: true,
  maintenance: false,
  notice: "",
};

export const getSettings = cache(async (): Promise<PublicSettings> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("site_settings")
    .select(
      "fee_rate, anonymous_fee, min_payout, payout_fee, auto_complete_days, video_fee, extend_fee_per_day, registration_open, maintenance, notice",
    )
    .maybeSingle();
  if (error || !data) {
    // 読めないときに「登録受付中・メンテなし」へ倒すのは表示だけ。実際の受付・購入は DB 側で止まる
    console.error("[settings]", error?.message ?? "行がありません");
    return FALLBACK;
  }
  return {
    feeRate: Number(data.fee_rate),
    anonymousFee: data.anonymous_fee,
    minPayout: data.min_payout,
    payoutFee: data.payout_fee,
    autoCompleteDays: data.auto_complete_days,
    videoFee: data.video_fee,
    extendFeePerDay: data.extend_fee_per_day,
    registrationOpen: data.registration_open,
    maintenance: data.maintenance,
    notice: data.notice,
  };
});
