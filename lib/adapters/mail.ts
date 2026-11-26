/* メールの送り口。MAIL_MODE=mock（既定）のあいだは送らずに mail_outbox に残す（管理画面の「送信メール」で見られる）。
   MAIL_MODE=live にして RESEND_API_KEY・MAIL_FROM を入れると Resend から送る（送る中身は lib/resend.ts）。
   会員登録の確認・パスワード再設定のメールは Supabase Auth が送る（Auth の SMTP に Resend を設定する。README 参照）。
   ここで送るのは、注文・発送・振込などのお知らせだけ。 */
import "server-only";
import { serverEnv } from "@/lib/env";
import { SITE_NAME } from "@/lib/site";
import { RESEND_URL, fromHeader, resendRequest, retryDelayMs, resendErrorLabel } from "@/lib/resend";
import { noticeBcc } from "@/lib/mail-config";
import { createServiceClient } from "@/lib/supabase/service";

/** replyTo: 返信の宛先（お問い合わせで、運営が返信すると送った人に届くように）。入力を検めたアドレスだけを渡す */
export type Mail = { to: string; subject: string; text: string; userId?: string | null; kind: string; replyTo?: string };

/** 送れなくても呼び手の処理は止めない（お知らせは画面の通知にも出している）。結果だけ返す */
export async function sendMail(mail: Mail): Promise<{ sent: boolean }> {
  const svc = createServiceClient();
  const mode = serverEnv.mailMode;
  let sent = false;
  let error: string | null = null;
  if (mode === "live") {
    try {
      // 鍵・送信元が未設定ならここで止まり、控えに理由が残る
      // お知らせのメールには運営の控えを BCC で付ける（MAIL_BCC。同じ1通なので、送れなければ本人宛ても送れない）
      const bcc = noticeBcc(mail.kind, serverEnv.mailBcc);
      const req = resendRequest(
        { to: mail.to, subject: mail.subject, text: mail.text, replyTo: mail.replyTo, bcc },
        { apiKey: serverEnv.resendApiKey, from: fromHeader(SITE_NAME, serverEnv.mailFrom) },
      );
      let res = await fetch(RESEND_URL, { ...req, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) {
        let bodyText = await res.text().catch(() => "");
        // 1秒あたりの上限（10通）に当たったときだけ、少し待って1回だけ送り直す
        const wait = retryDelayMs(res.status, res.headers.get("retry-after"), bodyText);
        if (wait !== null) {
          await new Promise((r) => setTimeout(r, wait));
          res = await fetch(RESEND_URL, { ...req, signal: AbortSignal.timeout(10_000) });
          bodyText = res.ok ? "" : await res.text().catch(() => "");
        }
        if (!res.ok) error = resendErrorLabel(res.status, bodyText);
      }
      sent = res.ok;
    } catch (e) {
      error = e instanceof Error ? e.message.slice(0, 200) : "送信に失敗";
    }
  }
  // 控えを残す（本文はお知らせの定型文だけ。合言葉・トークンは載せない）
  await svc.from("mail_outbox").insert({
    user_id: mail.userId ?? null,
    to_address: mail.to,
    kind: mail.kind,
    subject: mail.subject,
    body: mail.text,
    mode,
    sent,
    error,
  });
  return { sent };
}
