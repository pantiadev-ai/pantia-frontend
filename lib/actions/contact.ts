"use server";
/* お問い合わせ。ログインしていなくても送れる（停止中の人の相談も受ける）。
   届け先は運営（CONTACT_TO）だけ。入力されたアドレスへの自動返信はしない（他人のメール箱へ送る道具にさせない）。 */
import { z } from "zod";
import { ActionError, getViewer, runAction, type ActionResult } from "@/lib/auth";
import { sendMail } from "@/lib/adapters/mail";
import { serverEnv } from "@/lib/env";
import { dateTimeJst } from "@/lib/format";
import { RULES, requestIp, takeRateLimit, type LimitCheck } from "@/lib/rate-limit";
import { SITE_NAME } from "@/lib/site";
import { CONTACT_BODY_MAX, CONTACT_TYPES } from "@/components/static/contact-types";

const TYPE_VALUES = CONTACT_TYPES.map((t) => t.value) as [string, ...string[]];

const ContactSchema = z.object({
  type: z.enum(TYPE_VALUES),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  body: z.string().trim().min(1).max(CONTACT_BODY_MAX),
  /** 人には見えない欄。機械が埋めたら送ったふりをして捨てる */
  website: z.string().max(200).optional(),
});

const ACCEPTED = "お問い合わせを受け付けました。内容を確認のうえ、入力いただいたメールアドレスへご連絡します。";

/** 改行とタブは残し、ほかの制御文字を外す */
function cleanText(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (ch === "\n" || ch === "\t" || (c > 0x1f && c !== 0x7f)) out += ch;
  }
  return out.replace(/\r\n?/g, "\n");
}

export async function sendContact(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = ContactSchema.safeParse(input);
    if (!parsed.success) throw new ActionError("入力の内容を確かめてください。");
    const { type, email, body, website } = parsed.data;

    const to = serverEnv.contactTo;
    if (!to) throw new ActionError("ただいまお問い合わせを受け付けていません。");

    // ログイン中なら、その人の枠でも数える（停止中の人も送れる）
    const viewer = await getViewer();
    const checks: LimitCheck[] = [];
    if (viewer) checks.push({ rule: RULES.contactUser, kind: "user", id: viewer.id });
    checks.push({ rule: RULES.contactIp, kind: "ip", id: await requestIp() });
    const limit = await takeRateLimit(checks, { failClosed: true });
    if (!limit.ok) throw new ActionError(limit.message);

    if (website && website.trim() !== "") return { ok: true, message: ACCEPTED };

    const label = CONTACT_TYPES.find((t) => t.value === type)?.label ?? "その他";
    const who = viewer
      ? `会員ID ${viewer.id}（${viewer.role === "seller" ? "出品者" : "購入者"}・${viewer.status === "active" ? "利用中" : "停止中"}）`
      : "ログインなし";
    const text = [
      `${SITE_NAME} のお問い合わせフォームから届きました。`,
      "",
      `種類: ${label}`,
      `返信先: ${email}`,
      `送った人: ${who}`,
      `受付: ${dateTimeJst(new Date())}`,
      "",
      "―― 本文 ――",
      cleanText(body),
    ].join("\n");

    await sendMail({ to, subject: `【${SITE_NAME}】お問い合わせ（${label}）`, text, userId: viewer?.id ?? null, kind: "contact", replyTo: email });
    return { ok: true, message: ACCEPTED };
  });
}
