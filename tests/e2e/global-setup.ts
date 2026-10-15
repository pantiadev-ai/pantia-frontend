/* E2E の前に1回だけ: 検証用であることを確かめ、設定を既定に戻し、土台の顔ぶれを用意する */
import { e2eEnv } from "./_env";
import { cast, CAST, sql } from "./_db";

export default async function globalSetup() {
  e2eEnv(); // 本番の ref ならここで止まる
  await sql(`
    delete from public.rate_limit_hits;
    update public.site_settings
    set registration_open = true, maintenance = false, notice = '', mail_order = true, mail_kyc = true, mail_payout = true, mod_spam_filter = true
    where id;
  `);
  for (const name of Object.keys(CAST) as (keyof typeof CAST)[]) await cast(name);
}
