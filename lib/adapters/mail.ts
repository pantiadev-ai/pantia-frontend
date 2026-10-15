/* メールの送り口。MAIL_MODE=mock（既定）のあいだは送らずに mail_outbox に残す（管理画面の「送信メール」で見られる）。
   MAIL_MODE=live にして SENDGRID_API_KEY・MAIL_FROM を入れると SendGrid から送る。
   会員登録の確認・パスワード再設定のメールは Supabase Auth が送る（Auth の SMTP に SendGrid を設定する。README 参照）。
   ここで送るのは、注文・発送・振込などのお知らせだけ。 */
import "server-only";
import { serverEnv } from "@/lib/env";
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
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${serverEnv.sendgridApiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: mail.to }] }],
          from: { email: serverEnv.mailFrom },
          ...(mail.replyTo ? { reply_to: { email: mail.replyTo } } : {}),
          subject: mail.subject,
          content: [{ type: "text/plain", value: mail.text }],
          // 開封・クリックの追跡を付けない（URL が書き換わり、届いたリンクが外のドメインを通る）
          tracking_settings: { click_tracking: { enable: false }, open_tracking: { enable: false } },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      sent = res.ok;
      if (!res.ok) error = `SendGrid ${res.status}`;
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
