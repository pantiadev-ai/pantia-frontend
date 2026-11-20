/* お知らせのメールの件名と本文（lib/mail-dispatch.ts から使う）。
   ・注文のメールには商品名を載せない（受信箱の一覧を人に見られても困らないように）。件名と注文を開くリンクだけ。
     振込のご案内（/checkout/transfer?…）だけは本文を載せる。中身は振込先・振込名義・金額・期限で、商品名は入らない（DB の create_checkout が作る）。
   ・管理画面で書き換えられるのは件名と書き出しだけ（lib/mail-templates.ts）。差し込みは {サイト名} と {お知らせの題} の2つ。
     お知らせの本文・「くわしくは…」とリンク・署名・送信専用の文・止め方は、書き換えても必ず付ける。
   ・サーバーの部品を読まない形にしてある（tests/unit から直に試すため）。 */
import type { Database } from "./database.types.ts";
import type { MailOverride } from "./mail-templates.ts";
import { SITE_NAME } from "./site.ts";

type MailRow = Database["public"]["Functions"]["claim_mail_batch"]["Returns"][number];

/** 差し込みを1回だけ置き換える（題の中の {…} はそのまま） */
function fill(template: string, title: string): string {
  return template.replace(/\{(サイト名|お知らせの題)\}/g, (_, k: string) => (k === "サイト名" ? SITE_NAME : title));
}

/** メールの件名と本文。本文に載せるのは、お知らせの題（か書き換えた書き出し）・（注文以外は）中身・サイトの中のリンクだけ */
export function composeMail(
  row: Pick<MailRow, "kind" | "title" | "body" | "link">,
  siteUrl: string,
  override?: MailOverride | null,
): { subject: string; text: string } {
  // 書き出しは改行だけ残して、ほかの制御文字を消す
  const opening = override?.body
    ? fill(override.body, row.title).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g, "").trim()
    : "";
  const lines = [opening || row.title, ""];
  const transferGuide = row.kind === "order" && (row.link ?? "").startsWith("/checkout/transfer?");
  if ((row.kind !== "order" || transferGuide) && row.body.trim()) lines.push(row.body.trim(), "");
  // link は DB の制約でサイトの中のパスだけ（外の URL は入らない）。念のためここでも確かめる
  const link = row.link && row.link.startsWith("/") && !row.link.startsWith("//") && !row.link.startsWith("/\\") ? row.link : "/notifications";
  lines.push(`くわしくは、ログインしてご確認ください。`, `${siteUrl}${link}`, "");
  lines.push("――", `${SITE_NAME}`, "このメールは送信専用です。返信には答えられません。");
  if (row.kind === "order") lines.push(`注文のメールを止めるときは、設定の画面で変えられます。${siteUrl}/settings`);
  // 件名は1行。改行などの制御文字は空白にする（ヘッダーへの差し込みを防ぐ）
  const subject = (override?.subject ? fill(override.subject, row.title) : `【${SITE_NAME}】${row.title}`)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .trim();
  return { subject: subject || `【${SITE_NAME}】${row.title}`, text: lines.join("\n") };
}
