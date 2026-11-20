/* メールの設定（環境変数 MAIL_MODE・RESEND_API_KEY・MAIL_FROM）が送れる形かを確かめる。
   ・lib/mail-dispatch.ts は、設定がおかしいあいだはお知らせをメール用に拾わない（拾うと mailed_at が付き、送れないまま失われるため）。
     直れば、作って3日以内の分は次の実行で送られる（claim_mail_batch・0009）。
   ・管理画面の上の警告もここで決める（値がおかしいときと、本番で mock のときを分ける）。
   ・MAIL_MODE の判定は lib/env.ts の mode() と同じにする（食い違うと、ここで通って送るときに止まる。tests/unit/mail-config.test.ts が見張る）。
   ・サーバーの部品を読まない形にしてある（tests/unit から直に試すため）。 */

/** process.env をそのまま渡せる形（読むのは MAIL_MODE・RESEND_API_KEY・MAIL_FROM だけ） */
export type MailEnv = Readonly<Record<string, string | undefined>>;
export type MailConfig = { state: "mock" } | { state: "live" } | { state: "broken"; reason: string };

export function mailConfig(env: MailEnv): MailConfig {
  const mode = (env.MAIL_MODE ?? "mock").trim();
  if (mode === "mock") return { state: "mock" };
  if (mode !== "live") return { state: "broken", reason: "MAIL_MODE の値が正しくありません（live か mock のどちらか）" };
  if (!(env.RESEND_API_KEY ?? "").trim()) return { state: "broken", reason: "MAIL_MODE が live なのに RESEND_API_KEY が入っていません" };
  const from = (env.MAIL_FROM ?? "").trim();
  if (!from) return { state: "broken", reason: "MAIL_MODE が live なのに MAIL_FROM が入っていません" };
  if (!from.includes("@")) return { state: "broken", reason: "MAIL_FROM がメールアドレスの形ではありません" };
  return { state: "live" };
}

/** 管理画面の上に出す警告。無ければ null */
export function mailWarning(env: MailEnv, isProduction: boolean): string | null {
  const c = mailConfig(env);
  if (c.state === "broken") {
    return `${c.reason}。直すまで、お知らせのメールは送らずに待たせています（作って3日以内の分は、直すと送られます）。`;
  }
  if (c.state === "mock" && isProduction) {
    return "本番なのにメールが mock（送らずに控えだけ）になっています。環境変数 MAIL_MODE を live にしてください。";
  }
  return null;
}
