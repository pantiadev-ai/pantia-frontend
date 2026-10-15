/* ログイン中の人と、その人にできることの確認（28 §B1: ①ログイン ②状態 ③役割）。
   ページ・server action・route handler は、処理の前に必ずここのどれかを通す。
   ここでの確認に加えて、DB 側でも RLS と関数の中の確認で二重に止める。 */
import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { scheduleMailFlush } from "@/lib/mail-dispatch";

export type Role = "seller" | "buyer";
export type KycStatus = "unsubmitted" | "pending" | "approved" | "rejected";

export type Viewer = {
  id: string;
  email: string | null;
  nickname: string;
  role: Role;
  kycStatus: KycStatus;
  status: "active" | "suspended" | "withdrawn";
  isAdmin: boolean;
  avatarPath: string | null;
};

/** ログイン中の人（いなければ null）。1回の表示の中では1回だけ問い合わせる */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.rpc("viewer_context");
  const row = (Array.isArray(data) ? data[0] : data) as
    | { nickname: string; role: Role; kyc_status: KycStatus; status: Viewer["status"]; is_admin: boolean; avatar_path: string | null }
    | null
    | undefined;
  if (!row) return null;
  return {
    id: user.id,
    email: user.email ?? null,
    nickname: row.nickname,
    role: row.role,
    kycStatus: row.kyc_status,
    status: row.status,
    isAdmin: row.is_admin,
    avatarPath: row.avatar_path,
  };
});

/** ページ用: ログインしていなければ /auth へ。停止中・退会済みは入れない（28 §B10・§L1） */
export async function requireViewer(next = "/"): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect(`/auth?next=${encodeURIComponent(next)}`);
  if (v.status !== "active") redirect("/auth/suspended");
  return v;
}

/** ページ用: 管理者でなければ 404 と同じ扱い（管理画面があること自体を見せない） */
export async function requireAdmin(): Promise<Viewer> {
  const v = await requireViewer("/admin");
  if (!v.isAdmin) notFound();
  return v;
}

/** server action 用の結果の形。画面はこれを見て文を出す（形は lib/action-result.ts） */
export type { ActionResult };

export class ActionError extends Error {}

/** server action 用: ログイン中で有効な人。だめなら ActionError（画面に出せる文） */
export async function actionViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) throw new ActionError("ログインしてください。");
  if (v.status !== "active") throw new ActionError("このアカウントは利用を停止しています。");
  return v;
}

export async function actionAdmin(): Promise<Viewer> {
  const v = await actionViewer();
  if (!v.isAdmin) throw new ActionError("権限がありません。");
  return v;
}

/** 本人確認（18歳以上の確認を含む）が済んでいるか。出品・購入・振込申請の前に通す */
export function assertKyc(v: Viewer) {
  if (v.kycStatus !== "approved") throw new ActionError("本人確認（18歳以上の確認）が済んでから使えます。");
}

/** server action の中身を包む。ActionError は文をそのまま、それ以外は中身を出さずに一般の文にする。
    成功したら、応答のあとにお知らせのメールを送る（注文・本人確認・振込。lib/mail-dispatch.ts）。
    読むだけでお知らせを作らない操作（見積もりなど、回数の多い物）は mail: false で外す。 */
export async function runAction<T>(fn: () => Promise<ActionResult<T>>, opts?: { mail?: boolean }): Promise<ActionResult<T>> {
  try {
    const result = await fn();
    if (result.ok && opts?.mail !== false) scheduleMailFlush();
    return result;
  } catch (e) {
    if (e instanceof ActionError) return { ok: false, error: e.message };
    // redirect() の中断はそのまま投げ直す（Next.js の仕組み）
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
    console.error("[action]", e instanceof Error ? e.message : e);
    return { ok: false, error: "うまくいきませんでした。時間をおいて、もう一度お試しください。" };
  }
}
