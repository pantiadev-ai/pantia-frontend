/* お知らせのメールの件名と本文（lib/mail-dispatch.ts から使う）。
   ・注文のメールには商品名を載せない（受信箱の一覧を人に見られても困らないように）。件名と注文を開くリンクだけ。
   ・サーバーの部品を読まない形にしてある（tests/unit から直に試すため）。 */
import type { Database } from "./database.types.ts";
import { SITE_NAME } from "./site.ts";

type MailRow = Database["public"]["Functions"]["claim_mail_batch"]["Returns"][number];

/** メールの件名と本文。本文に載せるのは、お知らせの題・（注文以外は）中身・サイトの中のリンクだけ */
export function composeMail(row: Pick<MailRow, "kind" | "title" | "body" | "link">, siteUrl: string): { subject: string; text: string } {
  const lines = [row.title, ""];
  if (row.kind !== "order" && row.body.trim()) lines.push(row.body.trim(), "");
  // link は DB の制約でサイトの中のパスだけ（外の URL は入らない）。念のためここでも確かめる
  const link = row.link && row.link.startsWith("/") && !row.link.startsWith("//") && !row.link.startsWith("/\\") ? row.link : "/notifications";
  lines.push(`くわしくは、ログインしてご確認ください。`, `${siteUrl}${link}`, "");
  lines.push("――", `${SITE_NAME}`, "このメールは送信専用です。返信には答えられません。");
  if (row.kind === "order") lines.push(`注文のメールを止めるときは、設定の画面で変えられます。${siteUrl}/settings`);
  return { subject: `【${SITE_NAME}】${row.title}`, text: lines.join("\n") };
}
