/* 担当 D（管理画面）の下ごしらえ。
   管理者として入る・確認の窓の操作・振込申請・本人確認の申請・通報・保留の投稿やメッセージ・注文を直に作る。
   どれも「確かめたい操作の前の状態」を作るだけ。確かめる操作そのものは画面から行う。
   読むだけ・後始末だけの物は、管理 API（sql。並べて流すと 429 が出やすい）ではなく service_role の client で行う。 */
import { randomBytes, randomUUID } from "node:crypto";
import type { BrowserContext, Locator, Page } from "@playwright/test";
import { admin, cast, type Cast, lit, loginAs, seedListing, sql } from "./_db";
import { expect } from "./_fixtures";

/** 名前・本文に入れる乱数（ほかの人の物と混ざらないように） */
export const rid = (): string => randomBytes(3).toString("hex");

/** 古い日時。古い順に並ぶ一覧（本人確認・保留・振込申請・通報）で1ページ目に出すために使う */
export const OLD = "2001-01-01 09:00:00+09";

/** 管理者（admin1）として、二段階認証まで済ませて入る */
export async function asAdmin(context: BrowserContext): Promise<Cast> {
  const a = await cast("admin");
  await loginAs(context, a, { aal2: true });
  return a;
}

type ActOpts = {
  /** 行（または画面）にあるボタンの文 */
  button: string;
  /** 窓の見出し */
  title?: string | RegExp;
  /** 理由の欄に入れる文（欄が無いときは省く） */
  reason?: string;
  /** 窓の中の確定のボタンの文 */
  confirm: string;
  /** 右下に出る知らせの文 */
  done: string | RegExp;
};

/** 右下の知らせを閉じる（前の操作の知らせが残っていると、同じ文の新しい知らせと見分けがつかない） */
async function clearToasts(page: Page): Promise<void> {
  const close = page.locator(".adm-toasts").getByRole("button", { name: "閉じる" });
  for (let i = 0; i < 3 && (await close.count()) > 0; i++) {
    // 6秒で自然に消えたあとなら押せなくてよい
    await close
      .first()
      .click({ timeout: 2_000 })
      .catch(() => {});
  }
  await expect(close).toHaveCount(0);
}

/** 管理の操作のボタンを押し、確認の窓で（理由を入れて）確定し、知らせが出るまで待つ */
export async function act(page: Page, scope: Locator | Page, o: ActOpts): Promise<void> {
  await clearToasts(page);
  await scope.getByRole("button", { name: o.button, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  if (o.title) await expect(dialog.getByRole("heading", { name: o.title })).toBeVisible();
  if (o.reason !== undefined) await dialog.getByRole("textbox").fill(o.reason);
  await dialog.getByRole("button", { name: o.confirm, exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".adm-toasts").getByText(o.done)).toBeVisible();
}

/** 表の中で、文を含む行 */
export function rowOf(page: Page, text: string): Locator {
  return page.getByRole("row").filter({ hasText: text });
}

/** 売上の台帳に調整の行を入れる（残高を作る） */
export async function seedLedger(user: Cast, amount: number, note = "E2E の下ごしらえ"): Promise<void> {
  const { error } = await admin().from("ledger_entries").insert({ user_id: user.id, kind: "adjustment", amount, note });
  if (error) throw new Error(`台帳に入れられませんでした: ${error.message}`);
}

/** 台帳の合計（＝売上の残高） */
export async function ledgerSum(userId: string): Promise<number> {
  const { data, error } = await admin().from("ledger_entries").select("amount").eq("user_id", userId);
  if (error) throw new Error(`台帳を読めませんでした: ${error.message}`);
  return (data ?? []).reduce((s: number, e: { amount: number | string }) => s + Number(e.amount), 0);
}

export const PAYOUT_FEE = 250;
export const PAYOUT_ACCOUNT = "7654321";

/** 振込申請を直に作る（残高を入れてから申請した形。台帳に申請の分の差し引きも入れる） */
export async function seedPayout(user: Cast, amount: number): Promise<{ id: string; no: number; net: number }> {
  await seedLedger(user, amount, "E2E 振込の元になる売上");
  const rows = await sql<{ id: string; payout_no: number | string }>(`
    with p as (
      insert into public.payouts (user_id, amount, fee, net, bank_name, branch_name, account_type, account_number, account_last4, holder_kana, requested_at)
      values (${lit(user.id)}, ${amount}, ${PAYOUT_FEE}, ${amount - PAYOUT_FEE}, 'E2E銀行', '本店', 'ordinary', ${lit(PAYOUT_ACCOUNT)}, ${lit(PAYOUT_ACCOUNT.slice(-4))}, 'イーツーイー', ${lit(OLD)})
      returning id, payout_no
    ), l as (
      insert into public.ledger_entries (user_id, kind, amount, payout_id, note)
      select ${lit(user.id)}, 'payout', ${-amount}, p.id, '振込申請（E2E銀行）' from p
      returning 1
    )
    select p.id, p.payout_no from p, (select count(*) from l) c`);
  return { id: rows[0].id, no: Number(rows[0].payout_no), net: amount - PAYOUT_FEE };
}

/** 振込申請が残っていたら閉じる（試験が途中で落ちたときに、古い日時の申請を一覧の上に残さない） */
export async function closePayout(id: string): Promise<void> {
  await admin()
    .from("payouts")
    .update({ status: "rejected", reject_reason: "E2E の後始末", decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "requested");
}

// 1×1 の WebP（本人確認の書類の代わり）
const TINY_WEBP = Buffer.from("UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=", "base64");

/** 本人確認の申請を直に作る（書類の画像を置き、申請を pending で入れる） */
export async function seedKyc(user: Cast): Promise<{ id: string; path: string }> {
  const path = `${user.id}/${randomUUID()}.webp`;
  const { error } = await admin().storage.from("kyc-documents").upload(path, TINY_WEBP, { contentType: "image/webp", upsert: false });
  if (error) throw new Error(`書類を置けませんでした: ${error.message}`);
  const rows = await sql<{ id: string }>(`
    update public.profiles set kyc_status = 'pending' where id = ${lit(user.id)};
    insert into public.kyc_applications (user_id, provider, doc_type, document_paths, birth_date, status, created_at)
    values (${lit(user.id)}, 'manual', 'license', array[${lit(path)}], date '1995-04-01', 'pending', ${lit(OLD)})
    returning id`);
  return { id: rows[0].id, path };
}

/** 本人確認の申請が開いたままなら閉じる（後始末） */
export async function closeKyc(id: string): Promise<void> {
  await admin()
    .from("kyc_applications")
    .update({ status: "rejected", reject_reason: "E2E の後始末", decided_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["pending", "reviewing"]);
}

/** 本人確認の書類の置き場に、その人の物が何件あるか */
export async function kycFiles(userId: string): Promise<number> {
  const { data, error } = await admin().storage.from("kyc-documents").list(userId);
  if (error) throw new Error(`書類の置き場を読めませんでした: ${error.message}`);
  return (data ?? []).filter((f) => f.name.endsWith(".webp")).length;
}

/** つぶやきを直に作る（保留・非表示も作れる） */
export async function seedPost(author: Cast, body: string, opts: { status?: "visible" | "held" | "hidden"; at?: string } = {}): Promise<string> {
  const rows = await sql<{ id: string }>(`
    insert into public.posts (author_id, body, status, created_at)
    values (${lit(author.id)}, ${lit(body)}, ${lit(opts.status ?? "visible")}, ${opts.at ? lit(opts.at) : "now()"})
    returning id`);
  return rows[0].id;
}

/** メッセージを直に作る（出品者と購入者の会話を作り、1通入れる） */
export async function seedMessage(seller: Cast, buyer: Cast, body: string, opts: { status?: "visible" | "held" | "hidden"; at?: string } = {}): Promise<string> {
  const rows = await sql<{ id: string }>(`
    with t as (
      insert into public.threads (seller_id, buyer_id) values (${lit(seller.id)}, ${lit(buyer.id)})
      on conflict (seller_id, buyer_id) do update set last_message_at = now()
      returning id
    )
    insert into public.messages (thread_id, sender_id, kind, body, status, created_at)
    select t.id, ${lit(buyer.id)}, 'text', ${lit(body)}, ${lit(opts.status ?? "visible")}, ${opts.at ? lit(opts.at) : "now()"} from t
    returning id`);
  return rows[0].id;
}

type ReportTarget = { type: "user" | "listing" | "post" | "comment" | "message"; id: string; owner: string | null };

/** 通報を直に作る */
export async function seedReport(reporter: Cast, target: ReportTarget, opts: { detail: string; at?: string }): Promise<{ id: string; no: number }> {
  const rows = await sql<{ id: string; report_no: number | string }>(`
    insert into public.reports (reporter_id, target_type, target_id, target_owner, reason, detail, created_at)
    values (${lit(reporter.id)}, ${lit(target.type)}, ${lit(target.id)}, ${target.owner ? lit(target.owner) : "null"}, 'spam', ${lit(opts.detail)}, ${opts.at ? lit(opts.at) : "now()"})
    returning id, report_no`);
  return { id: rows[0].id, no: Number(rows[0].report_no) };
}

/** 通報が開いたままなら閉じる（後始末） */
export async function closeReports(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await admin().from("reports").update({ status: "dismissed", handled_at: new Date().toISOString() }).in("id", ids).in("status", ["open", "reviewing"]);
}

export type Address = { name: string; postal: string; prefecture: string; address1: string; address2: string; phone: string };

/** 注文を直に作る（出品を作り、購入者として購入の手続きまで進める。支払いは済ませない） */
export async function seedOrder(seller: Cast, buyer: Cast, title: string, address: Address): Promise<{ orderId: string; listingId: string }> {
  const listingId = await seedListing(seller, { title, price: 3000 });
  const { data, error } = await admin().rpc("create_checkout", {
    p_buyer: buyer.id,
    p_items: [{ listing_id: listingId, options: {} }],
    p_method: "mock",
    p_address: address,
  });
  if (error) throw new Error(`注文を作れませんでした: ${error.message}`);
  const ids = (data as { order_ids?: string[] } | null)?.order_ids ?? [];
  if (!ids[0]) throw new Error("注文を作れませんでした（order_ids が空）");
  return { orderId: ids[0], listingId };
}

/** その人あての通知（新しい順） */
export async function notificationsOf(userId: string): Promise<{ kind: string; title: string; body: string }[]> {
  const { data, error } = await admin().from("notifications").select("kind, title, body").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw new Error(`通知を読めませんでした: ${error.message}`);
  return (data ?? []) as { kind: string; title: string; body: string }[];
}

/** その人の操作の記録（新しい順） */
export async function auditOf(targetId: string): Promise<{ action: string; actor_id: string | null }[]> {
  const { data, error } = await admin()
    .from("audit_logs")
    .select("action, actor_id")
    .eq("target_id", targetId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new Error(`操作の記録を読めませんでした: ${error.message}`);
  return (data ?? []) as { action: string; actor_id: string | null }[];
}
