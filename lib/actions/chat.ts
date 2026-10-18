"use server";
/* メッセージ（チャット）。DB の関数（open_thread / send_message など）が当事者・本人確認・ブロックを確かめる。
   送信・既読・ハート・ミュートの後は revalidatePath を呼ばない。チャットの画面は毎回作り直す動的なページで、
   新しいメッセージは Realtime と loadLatest で画面に入る。呼ぶとチャット全体を作り直して重くなるだけのため。 */
import { redirect } from "next/navigation";
import { z } from "zod";
import { actionViewer, ActionError, assertKyc, runAction, type ActionResult } from "@/lib/auth";
import { dbCode, throwDb } from "@/lib/db-errors";
import { RULES, takeRateLimit } from "@/lib/rate-limit";
import { isUuid } from "@/lib/search";
import { signedUrls } from "@/lib/storage-server";
import { createClient } from "@/lib/supabase/server";
import { loadMessages, otherReadAt } from "@/components/chat/data";
import type { ChatLatest, ChatPage } from "@/components/chat/types";
import { BODY_MAX, CHAT_PATH_RE, normIso } from "@/components/chat/view";

const CANT_SEND = "この相手にはメッセージを送れません。";
const NOT_FOUND = "この会話は見つかりませんでした。";

/** 相手との会話を開く（無ければ作る）。開けたら /messages/<会話の id> へ */
export async function startThread(otherUserId: string): Promise<ActionResult> {
  const r = await runAction<string>(async () => {
    const v = await actionViewer();
    assertKyc(v);
    if (!isUuid(otherUserId) || otherUserId === v.id) throw new ActionError("この相手にはメッセージを送れません。");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("open_thread", { p_other: otherUserId });
    // 関数の unavailable は「相手が見えない・同じ役割・取引が無い」。商品向けの文ではなく、送れない旨を出す
    if (error && dbCode(error) === "unavailable") throw new ActionError("この相手にはメッセージを送れません。");
    throwDb(error);
    if (!isUuid(data)) throw new ActionError("会話を開けませんでした。");
    return { ok: true, data };
  });
  if (r.ok && r.data) redirect(`/messages/${r.data}`);
  return r.ok ? { ok: true } : r;
}

/** URL・画面から来た会話の id を確かめて小文字にそろえる（画像の置き場所の頭と比べるため） */
function threadIdOf(v: unknown): string {
  if (!isUuid(v)) throw new ActionError(NOT_FOUND);
  return v.toLowerCase();
}

/** 自分が当事者の会話か（RLS で読めるか）。読めなければ止める */
async function assertParty(supabase: Awaited<ReturnType<typeof createClient>>, threadId: string) {
  const { data, error } = await supabase
    .from("threads")
    .select("id, seller_id, seller_last_read_at, buyer_last_read_at")
    .eq("id", threadId)
    .maybeSingle();
  throwDb(error);
  if (!data) throw new ActionError(NOT_FOUND);
  return data;
}

/** 改行以外の制御文字（DB の [[:cntrl:]] と同じ範囲）が入っているか */
function hasControl(s: string): boolean {
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if ((c < 0x20 && c !== 0x0a) || (c >= 0x7f && c <= 0x9f)) return true;
  }
  return false;
}

const SendSchema = z.object({
  body: z.string().max(BODY_MAX * 4).optional(),
  imagePaths: z.array(z.string().max(120)).max(4).optional(),
  listingId: z.string().max(40).nullish(),
});

/** メッセージを送る。止められた（スパムの疑い）ときは本人にだけ見え、確認のあと相手に届く */
export async function sendMessage(threadId: string, input: unknown): Promise<ActionResult<{ id: string; held: boolean }>> {
  return runAction(async () => {
    const v = await actionViewer();
    assertKyc(v);
    const tid = threadIdOf(threadId);
    const parsed = SendSchema.safeParse(input);
    if (!parsed.success) throw new ActionError("メッセージの内容を確かめてください。");

    // DB と同じく \r を消す。タブは DB で制御文字として断られるので空白にする
    const body = (parsed.data.body ?? "").replace(/\r/g, "").replace(/\t/g, " ").trim();
    if (Array.from(body).length > BODY_MAX) throw new ActionError(`メッセージは${BODY_MAX}字までです。`);
    if (hasControl(body)) throw new ActionError("使えない文字が入っています。");

    // 画像はこの会話の置き場所（<会話の id>/…）に上げた物だけ
    const paths = [...new Set(parsed.data.imagePaths ?? [])];
    if (paths.some((p) => !CHAT_PATH_RE.test(p) || !p.startsWith(`${tid}/`))) {
      throw new ActionError("画像をもう一度選んでください。");
    }

    const listingId = parsed.data.listingId ?? null;
    if (listingId !== null) {
      if (v.role !== "seller") throw new ActionError("商品の紹介は出品者のアカウントで使えます。");
      if (!isUuid(listingId)) throw new ActionError("紹介する商品を選び直してください。");
      if (paths.length > 0) throw new ActionError("画像と商品は一緒に送れません。どちらかにしてください。");
    }
    if (body === "" && paths.length === 0 && listingId === null) throw new ActionError("メッセージを入力してください。");

    const limit = await takeRateLimit([{ rule: RULES.messageUser, kind: "user", id: v.id }], { failClosed: true });
    if (!limit.ok) throw new ActionError(limit.message);

    const supabase = await createClient();
    const args: { p_thread: string; p_body: string; p_image_paths: string[]; p_listing?: string } = {
      p_thread: tid,
      p_body: body,
      p_image_paths: paths,
    };
    if (listingId !== null) args.p_listing = listingId.toLowerCase();
    const { data, error } = await supabase.rpc("send_message", args);
    // unavailable は「当事者でない・ブロック・相手が退会や停止」。共通の文は商品向けなので置き換える
    if (error && dbCode(error) === "unavailable") throw new ActionError(CANT_SEND);
    throwDb(error);
    if (!isUuid(data)) throw new ActionError("送れませんでした。もう一度お試しください。");

    const { data: row } = await supabase.from("messages").select("status").eq("id", data).maybeSingle();
    const held = row?.status === "held";
    return { ok: true, data: { id: data, held }, message: held ? "確認のあと相手に届きます。" : undefined };
  });
}

/** この会話を読んだことにする（自分の側の既読時刻と、この会話のお知らせ）。
    回数の上限は付けない（自分の行の時刻を今にするだけで、新しいメッセージが届くたびに呼ぶため） */
export async function markRead(threadId: string): Promise<ActionResult> {
  return runAction(async () => {
    await actionViewer();
    const tid = threadIdOf(threadId);
    const supabase = await createClient();
    const { error } = await supabase.rpc("mark_thread_read", { p_thread: tid });
    throwDb(error);
    return { ok: true };
  });
}

/** この会話のお知らせを止める・戻す */
export async function setMuted(threadId: string, muted: boolean): Promise<ActionResult<{ muted: boolean }>> {
  return runAction(async () => {
    const v = await actionViewer();
    const tid = threadIdOf(threadId);
    if (typeof muted !== "boolean") throw new ActionError("入力の内容を確かめてください。");
    const limit = await takeRateLimit([{ rule: RULES.reactUser, kind: "user", id: v.id }], { failClosed: true });
    if (!limit.ok) throw new ActionError(limit.message);
    const supabase = await createClient();
    await assertParty(supabase, tid);
    const { error } = await supabase.rpc("set_thread_muted", { p_thread: tid, p_muted: muted });
    throwDb(error);
    return { ok: true, data: { muted } };
  });
}

/** 相手のメッセージにハートを付ける・外す。付いたかどうかを返す */
export async function toggleHeart(messageId: string): Promise<ActionResult<{ hearted: boolean }>> {
  return runAction(async () => {
    const v = await actionViewer();
    if (!isUuid(messageId)) throw new ActionError("このメッセージは見つかりませんでした。");
    const limit = await takeRateLimit([{ rule: RULES.reactUser, kind: "user", id: v.id }], { failClosed: true });
    if (!limit.ok) throw new ActionError(limit.message);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("toggle_message_heart", { p_message: messageId.toLowerCase() });
    // unavailable は「自分のメッセージ・案内のメッセージ・見えない物」
    if (error && dbCode(error) === "unavailable") throw new ActionError("この操作はできません。");
    throwDb(error);
    return { ok: true, data: { hearted: data === true } };
  });
}

/** 「前を読む」: beforeIso より前の50件（RLS で読む） */
export async function loadOlder(threadId: string, beforeIso: string, beforeId: string): Promise<ActionResult<ChatPage>> {
  return runAction(async () => {
    await actionViewer();
    const tid = threadIdOf(threadId);
    const at = normIso(beforeIso);
    if (!at || typeof beforeId !== "string" || !isUuid(beforeId)) throw new ActionError("読み込めませんでした。画面を読み込み直してください。");
    const supabase = await createClient();
    await assertParty(supabase, tid);
    return { ok: true, data: await loadMessages(supabase, tid, { at, id: beforeId.toLowerCase() }) };
  });
}

/** 新しい方の50件と、相手の既読時刻（Realtime の取りこぼしを拾う・つながらないときの読み直し・送った後） */
export async function loadLatest(threadId: string): Promise<ActionResult<ChatLatest>> {
  return runAction(async () => {
    const v = await actionViewer();
    const tid = threadIdOf(threadId);
    const supabase = await createClient();
    const t = await assertParty(supabase, tid);
    const page = await loadMessages(supabase, tid);
    return { ok: true, data: { messages: page.messages, otherReadAt: otherReadAt(t, v.id) } };
  });
}

/** Realtime で届いた画像の期限つき URL。当事者で、しかも自分に見えるメッセージに入っている画像だけ */
export async function chatImageUrls(threadId: string, paths: unknown): Promise<ActionResult<Record<string, string>>> {
  return runAction(async () => {
    await actionViewer();
    const tid = threadIdOf(threadId);
    const parsed = z.array(z.string().max(120)).max(8).safeParse(paths);
    if (!parsed.success) throw new ActionError("画像を読み込めませんでした。");
    const wanted = [...new Set(parsed.data)].filter((p) => CHAT_PATH_RE.test(p) && p.startsWith(`${tid}/`));
    if (wanted.length === 0) return { ok: true, data: {} };
    const supabase = await createClient();
    await assertParty(supabase, tid);
    const { data, error } = await supabase
      .from("messages")
      .select("image_paths")
      .eq("thread_id", tid)
      .overlaps("image_paths", wanted)
      .limit(20);
    throwDb(error);
    const visible = new Set((data ?? []).flatMap((r) => r.image_paths ?? []));
    return { ok: true, data: await signedUrls("chat-images", wanted.filter((p) => visible.has(p))) };
  });
}
