/* お知らせのメールの目録と、管理画面で書き換えた件名・書き出し（表 mail_templates・0018）。
   ・目録は migrations の notify(…, 'order'|'kyc'|'payout', '題', …) と1対1（tests/unit/mail-templates.test.ts が見張る）。
     題が変わった・増えたら、ここも直す。
   ・書き換えられるのは件名と書き出しだけ。差し込めるのは {サイト名} と {お知らせの題} だけ（組み立ては lib/mail-compose.ts）。
   ・サーバーの部品を読まない形にしてある（tests/unit から直に試すため。管理画面の入力の確かめにも使う）。 */
import { z } from "zod";

type Def = {
  key: string;
  kind: "order" | "kyc" | "payout";
  /** お知らせの題（prefix のときは書き出しの部分だけ） */
  title: string;
  /** 題が「この文字で始まる」もの（振込のご案内は期限が後ろに付く） */
  prefix?: true;
  /** 宛先 */
  to: "購入者" | "売手" | "本人";
  /** いつ届くか（管理画面に出す説明） */
  when: string;
};

const DEFS = [
  { key: "order.transfer_guide", kind: "order", title: "お振込のご案内（", prefix: true, to: "購入者", when: "銀行振込で注文したとき（振込先・振込名義・金額・期限を載せる）" },
  { key: "order.transfer_confirmed", kind: "order", title: "お振込を確認しました", to: "購入者", when: "運営が振込の入金を確かめたとき" },
  { key: "order.paid", kind: "order", title: "お支払いが完了しました", to: "購入者", when: "振込以外の支払いが済んだとき" },
  { key: "order.paid_seller", kind: "order", title: "入金が確認できました。発送してください", to: "売手", when: "振込の注文の入金を運営が確かめたとき" },
  { key: "order.new", kind: "order", title: "新しい注文が入りました", to: "売手", when: "振込以外の注文の支払いが済んだとき" },
  { key: "order.preparing", kind: "order", title: "発送の準備に入りました", to: "購入者", when: "売手が発送の準備に入ったとき" },
  { key: "order.shipped", kind: "order", title: "商品が発送されました", to: "購入者", when: "売手が発送の連絡をしたとき" },
  { key: "order.completed", kind: "order", title: "取引が完了しました", to: "売手", when: "取引が完了して、売上が残高に入ったとき" },
  { key: "order.auto_completed", kind: "order", title: "取引が自動で完了しました", to: "購入者", when: "発送から日数が過ぎて、取引が自動で完了したとき" },
  { key: "order.cancelled", kind: "order", title: "注文がキャンセルされました", to: "購入者", when: "売手か運営が注文をキャンセルしたとき" },
  { key: "order.admin_cancelled", kind: "order", title: "注文が運営によりキャンセルされました", to: "売手", when: "運営が注文をキャンセルしたとき" },
  { key: "order.refunded", kind: "order", title: "ご返金の振込が済みました", to: "購入者", when: "運営が返金の振込を済ませたとき" },
  { key: "kyc.approved", kind: "kyc", title: "本人確認が完了しました", to: "本人", when: "本人確認が承認されたとき" },
  { key: "kyc.resubmit", kind: "kyc", title: "本人確認の再申請ができるようになりました", to: "本人", when: "運営が本人確認の再申請を許したとき" },
  { key: "kyc.rejected", kind: "kyc", title: "本人確認を承認できませんでした", to: "本人", when: "本人確認が承認されなかったとき（理由を載せる）" },
  { key: "payout.paid", kind: "payout", title: "振込が完了しました", to: "本人", when: "運営が売上の振込を済ませたとき" },
  { key: "payout.rejected", kind: "payout", title: "振込申請を承認できませんでした", to: "本人", when: "運営が振込申請を断ったとき（理由を載せる）" },
] as const satisfies readonly Def[];

export type MailTemplateKey = (typeof DEFS)[number]["key"];
export type MailTemplateDef = Def & { key: MailTemplateKey };

/** お知らせのメールの種類（17）。並びは管理画面の並び */
export const MAIL_TEMPLATES: readonly MailTemplateDef[] = DEFS;

/** 書き換えた件名と書き出し。null は既定のまま */
export type MailOverride = { subject: string | null; body: string | null };

/** お知らせの種類と題から、目録の行を引く。無ければ null（書き換えずに送る） */
export function templateFor(kind: string, title: string): MailTemplateDef | null {
  for (const t of MAIL_TEMPLATES) {
    if (t.kind !== kind) continue;
    if (t.prefix ? title.startsWith(t.title) : title === t.title) return t;
  }
  return null;
}

/** 件名に入れられない文字（改行・タブを含む制御文字）。DB の check より少し広い */
export const SUBJECT_BAD = /[\u0000-\u001f\u007f-\u009f]/;
/** 書き出しに入れられない文字（改行だけ許す） */
export const BODY_BAD = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/;

/** textarea の改行（CRLF・CR）を LF にそろえ、前後の空白を除く */
const normalize = (s: string) => s.replace(/\r\n?/g, "\n").trim();
/** DB の char_length と同じ数え方（絵文字も1字） */
const chars = (s: string) => Array.from(s).length;

const KEYS = DEFS.map((t) => t.key) as [MailTemplateKey, ...MailTemplateKey[]];

/** 管理画面の入力。空の件名・空の書き出しは「既定に戻す」 */
export const mailTemplateInput = z.object({
  key: z.enum(KEYS, { error: "メールの種類が正しくありません。" }),
  subject: z
    .string()
    .max(1000, "件名は100字までです。")
    .transform(normalize)
    .refine((s) => chars(s) <= 100, "件名は100字までです。")
    .refine((s) => !SUBJECT_BAD.test(s), "件名に改行や使えない文字は入れられません。"),
  body: z
    .string()
    .max(10000, "本文（書き出し）は2000字までです。")
    .transform(normalize)
    .refine((s) => chars(s) <= 2000, "本文（書き出し）は2000字までです。")
    .refine((s) => !BODY_BAD.test(s), "本文（書き出し）に使えない文字が入っています。"),
});

export type MailTemplateRow = { key: string; subject: string | null; body: string | null };

/** mail_templates を読むだけの口（service_role のクライアント） */
type TemplateReader = {
  from(table: "mail_templates"): {
    select(columns: "key, subject, body"): PromiseLike<{ data: MailTemplateRow[] | null; error: { message: string } | null }>;
  };
};

/** 書き換えた分を key ごとに読む。読めなければ空（既定の文面で送り続ける。送信は止めない） */
export async function loadOverrides(service: TemplateReader): Promise<Map<string, MailOverride>> {
  try {
    const { data, error } = await service.from("mail_templates").select("key, subject, body");
    if (error) {
      console.error("[mail] templates", error.message);
      return new Map();
    }
    return new Map((data ?? []).map((r) => [r.key, { subject: r.subject, body: r.body }]));
  } catch (e) {
    console.error("[mail] templates", e instanceof Error ? e.message : e);
    return new Map();
  }
}
