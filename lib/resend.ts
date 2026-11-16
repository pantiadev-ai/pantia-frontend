/* Resend（https://resend.com/docs/api-reference/emails/send-email）へ送る中身を作る。
   サーバーの部品（環境変数・DB）は読まない。送る・控えを残すのは lib/adapters/mail.ts。 */

export const RESEND_URL = "https://api.resend.com/emails";

/** Resend は User-Agent の無い呼び出しを 403（error 1010）で断る。名前は一般的な物にする（連絡先は入れない） */
const USER_AGENT = "pantia/1.0";

/** 送信元。「表示名 <アドレス>」。MAIL_FROM に表示名まで書いてあれば、そのまま使う */
export function fromHeader(name: string, address: string): string {
  const addr = address.trim();
  if (!addr) throw new Error("送信元のアドレスが空です");
  if (addr.includes("<")) return addr;
  // 見出しを壊す文字（< > " と改行）は表示名から除く
  const label = name.replace(/[<>"\r\n]/g, "").trim();
  return label ? `${label} <${addr}>` : addr;
}

export type ResendMail = { to: string; subject: string; text: string; replyTo?: string };

export function resendRequest(
  mail: ResendMail,
  opts: { apiKey: string; from: string },
): { method: "POST"; headers: Record<string, string>; body: string } {
  const apiKey = opts.apiKey.trim();
  if (!apiKey) throw new Error("Resend の鍵が空です");
  return {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "User-Agent": USER_AGENT },
    // 文字の本文だけ送る（html を送らないので、Resend の開封の追跡も付かない）
    body: JSON.stringify({
      from: opts.from,
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
      ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
    }),
  };
}

function errorName(bodyText: string): string | null {
  try {
    const name = (JSON.parse(bodyText) as { name?: unknown })?.name;
    return typeof name === "string" ? name : null;
  } catch {
    return null;
  }
}

/** 送り直すまでの待ち（ミリ秒）。送り直さないときは null。
    送り直すのは1秒あたりの上限（429 rate_limit_exceeded）だけ。1日・1か月の上限は待っても通らない */
export function retryDelayMs(status: number, retryAfter: string | null, bodyText: string): number | null {
  if (status !== 429) return null;
  if (/_quota_exceeded$/.test(errorName(bodyText) ?? "")) return null;
  const sec = Number(retryAfter);
  if (retryAfter === null || retryAfter.trim() === "" || !Number.isFinite(sec) || sec < 0) return 1000;
  return Math.min(sec * 1000, 2000);
}

/** 控え（mail_outbox.error）に残す短い文。Resend の message は宛先のアドレスが入りうるので載せない */
export function resendErrorLabel(status: number, bodyText: string): string {
  const name = (errorName(bodyText) ?? "").replace(/[^a-z_]/g, "").slice(0, 50);
  return name ? `Resend ${status} ${name}` : `Resend ${status}`;
}
