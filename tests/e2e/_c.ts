/* 担当 C（チャット・つぶやき・お知らせ・通報・ブロック）の下ごしらえ。
   会話・メッセージ・つぶやき・お知らせを sql() で直に入れる。確かめたい操作そのものは各試験で画面から行う。 */
import { randomBytes } from "node:crypto";
import type { Page } from "@playwright/test";
import { freshUser, lit, sql, type Cast, type Kyc } from "./_db";

/** 乱数の目印（自分で作った物を探すため） */
export const rnd = (): string => randomBytes(3).toString("hex");

/** 本人確認済み（既定）の使い捨ての出品者 */
export function freshSeller(tag: string, kyc: Kyc = "approved"): Promise<Cast> {
  return freshUser(`c-${tag}-s`, { role: "seller", nickname: `C出品${rnd()}`, kyc });
}

/** 本人確認済み（既定）の使い捨ての購入者。呼び名の1文字目は「K」（公開名は「K***さん」） */
export function freshBuyer(tag: string, kyc: Kyc = "approved"): Promise<Cast> {
  return freshUser(`c-${tag}-b`, { role: "buyer", nickname: `K購入${rnd()}`, kyc });
}

/** 会話を直に作る（同じ組なら、ある物を返す） */
export async function seedThread(seller: Cast, buyer: Cast): Promise<string> {
  const rows = await sql<{ id: string }>(`
    insert into public.threads (seller_id, buyer_id) values (${lit(seller.id)}, ${lit(buyer.id)})
    on conflict (seller_id, buyer_id) do update set seller_id = excluded.seller_id
    returning id`);
  return rows[0]!.id;
}

/** メッセージを直に入れる（文だけ）。at を渡すと、その時刻にする */
export async function seedMessage(threadId: string, sender: Cast, body: string, at?: string): Promise<string> {
  const rows = await sql<{ id: string }>(`
    insert into public.messages (thread_id, sender_id, kind, body${at ? ", created_at" : ""})
    values (${lit(threadId)}, ${lit(sender.id)}, 'text', ${lit(body)}${at ? `, ${lit(at)}::timestamptz` : ""})
    returning id`);
  await sql(`update public.threads set last_message_at = now(), last_message_preview = ${lit(body.slice(0, 60))} where id = ${lit(threadId)}`);
  return rows[0]!.id;
}

/** つぶやきを直に入れる（公開中） */
export async function seedPost(author: Cast, body: string): Promise<string> {
  const rows = await sql<{ id: string }>(`
    insert into public.posts (author_id, body, status) values (${lit(author.id)}, ${lit(body)}, 'visible') returning id`);
  return rows[0]!.id;
}

/** お知らせを直に入れる */
export async function seedNotification(user: Cast, title: string, link = "/mypage", kind = "system"): Promise<string> {
  const rows = await sql<{ id: string }>(`
    insert into public.notifications (user_id, kind, title, body, link)
    values (${lit(user.id)}, ${lit(kind)}, ${lit(title)}, 'E2E の試験用のお知らせです。', ${lit(link)}) returning id`);
  return rows[0]!.id;
}

/** 確かめの窓（window.confirm）は「はい」で閉じる */
export function acceptDialogs(page: Page): void {
  page.on("dialog", (d) => void d.accept());
}

