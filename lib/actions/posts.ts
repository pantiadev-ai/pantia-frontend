"use server";
/* つぶやき（出品者の投稿）とコメント。
   どれも利用者の権限（RLS）で書く。作者・本人確認・出品者であること・紐づける商品が自分の物かは RLS でも止まる。
   ここでは先に同じ確認をして、わかりやすい文を返す。スパムの判定（spam_hold）で held になったら「確認のあと公開」と返す。
   画像は ImageUploader が置いた <本人の id>/<uuid>.webp のパスだけを受け取る（DB の paths_ok でも止まる）。 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionViewer, ActionError, assertKyc, runAction, type ActionResult, type Viewer } from "@/lib/auth";
import { dbCode, throwDb } from "@/lib/db-errors";
import { RULES, takeRateLimit } from "@/lib/rate-limit";
import type { LimitRule } from "@/lib/rate-limit-rules";
import { isUuid } from "@/lib/search";
import { removeImages } from "@/lib/storage-server";
import { createClient } from "@/lib/supabase/server";

/** DB の上限と同じ（posts.body は140字、post_comments.body は200字） */
const POST_MAX = 140;
const COMMENT_MAX = 200;
const IMAGE_MAX = 4;

/** 紐づけてよい商品の状態（RLS の posts_insert_own と同じ） */
const LINKABLE = ["published", "private", "sold"];

async function limit(rule: LimitRule, userId: string) {
  const d = await takeRateLimit([{ rule, kind: "user", id: userId }], { failClosed: true });
  if (!d.ok) throw new ActionError(d.message);
}

function mustUuid(id: unknown): string {
  if (!isUuid(id)) throw new ActionError("見つかりませんでした。");
  return id;
}

function mustSeller(v: Viewer) {
  if (v.role !== "seller") throw new ActionError("つぶやきは出品者のアカウントで使えます。");
}

/** 本文を整える。改行は \n にそろえ、タブは空白に。DB の制約（空白だけ・改行以外の制御文字）に先に合わせて断る */
function cleanBody(raw: string, max: number, what: string): string {
  const body = raw.replace(/\r\n?/g, "\n").replace(/\t/g, " ").trim();
  if (!body) throw new ActionError(`${what}を入力してください。`);
  if (/[\u0000-\u0009\u000b-\u001f\u007f]/.test(body)) throw new ActionError("使えない文字が含まれています。");
  if (Array.from(body).length > max) throw new ActionError(`${what}は${max}字までです。`);
  return body;
}

/** 画像のパス。自分が上げた物（<本人の id>/<uuid>.webp）だけ。重なりは1つにする */
function cleanImages(paths: string[], userId: string): string[] {
  const re = new RegExp(`^${userId}/[0-9a-f-]{36}\\.webp$`);
  const out = Array.from(new Set(paths));
  if (out.length > IMAGE_MAX) throw new ActionError(`画像は${IMAGE_MAX}枚までです。`);
  if (out.some((p) => !re.test(p))) throw new ActionError("画像をもう一度選び直してください。");
  return out;
}

/** 紐づける商品が自分の物で、紐づけてよい状態か */
async function checkListing(supabase: Awaited<ReturnType<typeof createClient>>, listingId: string | null, userId: string) {
  if (listingId === null) return null;
  const id = isUuid(listingId) ? listingId : null;
  if (!id) throw new ActionError("紐づける商品が見つかりません。");
  const { data, error } = await supabase
    .from("listings")
    .select("id")
    .eq("id", id)
    .eq("seller_id", userId)
    .in("status", LINKABLE)
    .maybeSingle();
  throwDb(error);
  if (!data) throw new ActionError("紐づける商品が見つかりません。");
  return id;
}

/** 使われなくなった画像を置き場から消す。自分のほかの投稿がまだ使っている物は残す */
async function dropUnusedImages(supabase: Awaited<ReturnType<typeof createClient>>, paths: string[], userId: string) {
  const mine = paths.filter((p) => p.startsWith(`${userId}/`));
  if (mine.length === 0) return;
  const { data, error } = await supabase.from("posts").select("image_paths").eq("author_id", userId).overlaps("image_paths", mine);
  if (error) return; // 確かめられないときは消さない（残っても害は小さい）
  const used = new Set((data ?? []).flatMap((r) => r.image_paths));
  const drop = mine.filter((p) => !used.has(p));
  if (drop.length === 0) return;
  const r = await removeImages("post-images", drop);
  if (r.error) console.error("[posts] 画像を消せませんでした", r.error);
}

function revalidateFeeds(postId?: string) {
  revalidatePath("/tweets");
  revalidatePath("/timeline");
  revalidatePath("/mypage/tweets");
  if (postId) revalidatePath(`/tweets/${postId}`);
}

const postSchema = z
  .object({
    body: z.string().max(4000),
    imagePaths: z.array(z.string().max(120)).max(IMAGE_MAX * 2),
    listingId: z.string().max(64).nullable(),
  })
  .strict();

export type PostInput = z.infer<typeof postSchema>;

const HELD_POST = "投稿を受け付けました。確認のあと公開されます。";

export async function createPost(input: PostInput): Promise<ActionResult<{ id: string; held: boolean }>> {
  return runAction(async () => {
    const v = await actionViewer();
    mustSeller(v);
    assertKyc(v);
    const parsed = postSchema.safeParse(input);
    if (!parsed.success) throw new ActionError("入力の形が違います。");
    const body = cleanBody(parsed.data.body, POST_MAX, "本文");
    const imagePaths = cleanImages(parsed.data.imagePaths, v.id);
    await limit(RULES.postUser, v.id);

    const supabase = await createClient();
    const listingId = await checkListing(supabase, parsed.data.listingId, v.id);
    const { data, error } = await supabase
      .from("posts")
      .insert({ body, image_paths: imagePaths, listing_id: listingId })
      .select("id, status")
      .single();
    throwDb(error, "つぶやけませんでした。時間をおいて、もう一度お試しください。");
    if (!data) throw new ActionError("つぶやけませんでした。時間をおいて、もう一度お試しください。");

    revalidateFeeds(data.id);
    const held = data.status === "held";
    return { ok: true, data: { id: data.id, held }, message: held ? HELD_POST : "つぶやきました。" };
  });
}

export async function updatePost(postId: string, input: PostInput): Promise<ActionResult<{ held: boolean }>> {
  return runAction(async () => {
    const v = await actionViewer();
    mustSeller(v);
    assertKyc(v);
    const id = mustUuid(postId);
    const parsed = postSchema.safeParse(input);
    if (!parsed.success) throw new ActionError("入力の形が違います。");
    const body = cleanBody(parsed.data.body, POST_MAX, "本文");
    const imagePaths = cleanImages(parsed.data.imagePaths, v.id);
    await limit(RULES.postUser, v.id);

    const supabase = await createClient();
    const { data: before, error: readErr } = await supabase
      .from("posts")
      .select("id, image_paths, status")
      .eq("id", id)
      .eq("author_id", v.id)
      .maybeSingle();
    throwDb(readErr);
    if (!before) throw new ActionError("見つかりませんでした。");
    if (before.status === "hidden") throw new ActionError("この投稿は運営により非表示になっているため、編集できません。");

    const listingId = await checkListing(supabase, parsed.data.listingId, v.id);
    const { data, error } = await supabase
      .from("posts")
      .update({ body, image_paths: imagePaths, listing_id: listingId })
      .eq("id", id)
      .eq("author_id", v.id)
      .select("id, status")
      .maybeSingle();
    throwDb(error, "保存できませんでした。時間をおいて、もう一度お試しください。");
    if (!data) throw new ActionError("見つかりませんでした。");

    const removed = before.image_paths.filter((p) => !imagePaths.includes(p));
    await dropUnusedImages(supabase, removed, v.id);

    revalidateFeeds(id);
    const held = data.status === "held";
    return { ok: true, data: { held }, message: held ? "保存しました。確認のあと公開されます。" : "保存しました。" };
  });
}

export async function deletePost(postId: string): Promise<ActionResult> {
  return runAction(async () => {
    // 役割は問わない（自分の投稿はいつでも消せる）。作者かどうかは RLS（posts_delete_own）でも止まる
    const v = await actionViewer();
    const id = mustUuid(postId);
    await limit(RULES.reactUser, v.id);
    const supabase = await createClient();
    const { data, error } = await supabase.from("posts").delete().eq("id", id).eq("author_id", v.id).select("id, image_paths");
    throwDb(error, "削除できませんでした。時間をおいて、もう一度お試しください。");
    const row = data?.[0];
    if (!row) throw new ActionError("見つかりませんでした。");
    await dropUnusedImages(supabase, row.image_paths, v.id);
    revalidateFeeds(id);
    return { ok: true, message: "削除しました。" };
  });
}

export async function setPinned(postId: string, pinned: boolean): Promise<ActionResult<{ pinned: boolean }>> {
  return runAction(async () => {
    const v = await actionViewer();
    mustSeller(v);
    const id = mustUuid(postId);
    if (typeof pinned !== "boolean") throw new ActionError("入力の形が違います。");
    await limit(RULES.reactUser, v.id);
    const supabase = await createClient();
    // 自分の公開中（visible）の投稿だけ。ほかの固定は DB が外す（1人1件）
    const { error } = await supabase.rpc("pin_post", { p_post: id, p_pinned: pinned });
    // pantia:unavailable は共通の表だと「商品を購入できない」の文になるので、ここで言い換える
    if (error && dbCode(error) === "unavailable") throw new ActionError("公開中の自分の投稿だけ固定できます。");
    throwDb(error, "固定できませんでした。時間をおいて、もう一度お試しください。");
    revalidateFeeds(id);
    return { ok: true, data: { pinned }, message: pinned ? "プロフィールの一番上に固定しました。" : "固定を外しました。" };
  });
}

const commentSchema = z
  .object({
    postId: z.string().max(64),
    body: z.string().max(4000),
  })
  .strict();

export async function addComment(input: z.infer<typeof commentSchema>): Promise<ActionResult<{ id: string; held: boolean }>> {
  return runAction(async () => {
    // コメントは購入者も出品者も書ける（役割の制限なし）。本人確認は要る
    const v = await actionViewer();
    assertKyc(v);
    const parsed = commentSchema.safeParse(input);
    if (!parsed.success) throw new ActionError("入力の形が違います。");
    const postId = mustUuid(parsed.data.postId);
    const body = cleanBody(parsed.data.body, COMMENT_MAX, "コメント");
    await limit(RULES.commentUser, v.id);

    const supabase = await createClient();
    const { data, error } = await supabase.from("post_comments").insert({ post_id: postId, body }).select("id, status").single();
    // RLS で止まる（投稿が非公開・削除済み・ブロック中など）ときは、理由を分けずに同じ文にする
    if (error && (error.code === "42501" || error.code === "23503")) {
      throw new ActionError("この投稿にはコメントできません。投稿が非公開になったか、削除された可能性があります。");
    }
    throwDb(error, "コメントできませんでした。時間をおいて、もう一度お試しください。");
    if (!data) throw new ActionError("コメントできませんでした。");

    revalidatePath(`/tweets/${postId}`);
    revalidatePath("/tweets");
    revalidatePath("/timeline");
    const held = data.status === "held";
    return {
      ok: true,
      data: { id: data.id, held },
      message: held ? "コメントを受け付けました。確認のあと公開されます。" : "コメントしました。",
    };
  });
}

export async function deleteComment(commentId: string): Promise<ActionResult> {
  return runAction(async () => {
    // 消せるのは自分のコメントか、自分の投稿についたコメント（RLS の post_comments_delete）
    const v = await actionViewer();
    const id = mustUuid(commentId);
    await limit(RULES.reactUser, v.id);
    const supabase = await createClient();
    const { data, error } = await supabase.from("post_comments").delete().eq("id", id).select("id, post_id");
    throwDb(error, "削除できませんでした。時間をおいて、もう一度お試しください。");
    const row = data?.[0];
    if (!row) throw new ActionError("見つかりませんでした。");
    revalidatePath(`/tweets/${row.post_id}`);
    revalidatePath("/tweets");
    revalidatePath("/timeline");
    return { ok: true, message: "コメントを削除しました。" };
  });
}
