/* メールの設定（環境変数 MAIL_MODE・RESEND_API_KEY・MAIL_FROM）が送れる形かを確かめる。
   ・lib/mail-dispatch.ts は、設定がおかしいあいだはお知らせをメール用に拾わない（拾うと mailed_at が付き、送れないまま失われるため）。
     直れば、作って3日以内の分は次の実行で送られる（claim_mail_batch・0009）。
   ・管理画面の上の警告もここで決める（値がおかしいときと、本番で mock のときを分ける）。
   ・MAIL_MODE の判定は lib/env.ts の mode() と同じにする（食い違うと、ここで通って送るときに止まる。tests/unit/mail-config.test.ts が見張る）。
   ・サーバーの部品を読まない形にしてある（tests/unit から直に試すため）。 */

/** process.env をそのまま渡せる形（読むのは MAIL_MODE・RESEND_API_KEY・MAIL_FROM・MAIL_BCC だけ） */
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

/** アドレス1件の形か（表示名・複数・空白・改行を含まない） */
function isSingleAddress(v: string): boolean {
  return /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(v);
}

/** お知らせのメール（kind が notice.〜）にだけ、運営の控えの BCC を付ける（改修リスト 行16）。
    MAIL_BCC が空・アドレス1件の形でないときは付けない（お知らせは本人に送る。形が違うときは管理画面に警告）。
    会員登録の確認・パスワード再設定は Supabase Auth が送るので、ここでは付けられない。 */
export function noticeBcc(kind: string, bcc: string | undefined): string | undefined {
  if (!kind.startsWith("notice.")) return undefined;
  const v = (bcc ?? "").trim();
  return v && isSingleAddress(v) ? v : undefined;
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
  const bcc = (env.MAIL_BCC ?? "").trim();
  if (bcc && !isSingleAddress(bcc)) {
    return "MAIL_BCC がメールアドレス1件の形ではないので、お知らせのメールに運営の控え（BCC）を付けずに送っています。";
  }
  return null;
}
