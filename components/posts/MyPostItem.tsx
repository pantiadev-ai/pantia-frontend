"use client";
/* マイページの「過去のつぶやき」1行（見本 mypage.html の tweet-log-item）。
   固定（ピン留め）・その場での編集・削除。閲覧数は作らない（CONVENTIONS §5）。 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ImageUploader, { type UploadedImage } from "@/components/ImageUploader";
import { FormMessage, useAction } from "@/components/useAction";
import { deletePost, setPinned, updatePost } from "@/lib/actions/posts";

const MAX = 140;

export type MyPost = {
  id: string;
  body: string;
  images: UploadedImage[];
  listingId: string | null;
  listingTitle: string | null;
  pinned: boolean;
  status: "visible" | "held" | "hidden";
  likeCount: number;
  commentCount: number;
  /** 表示用の日時（サーバーで整えた文字） */
  when: string;
  edited: boolean;
};

export default function MyPostItem({
  post,
  listings,
  canEdit,
}: {
  post: MyPost;
  listings: { id: string; title: string }[];
  /** 本人確認済みの出品者か（編集は本人確認が要る） */
  canEdit: boolean;
}) {
  const router = useRouter();
  const { pending, error, message, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(post.body);
  const [images, setImages] = useState<UploadedImage[]>(post.images);
  const [listingId, setListingId] = useState(post.listingId ?? "");

  const count = Array.from(text).length;
  const over = count > MAX;
  // 今の紐づけ先が選べる一覧に無い（売り切れ・非公開など）ときも、選び直さなければそのまま残す
  const options =
    post.listingId && !listings.some((l) => l.id === post.listingId)
      ? [{ id: post.listingId, title: post.listingTitle ?? "（今の紐づけ先）" }, ...listings]
      : listings;

  function save() {
    if (text.trim() === "" || over) return;
    run(
      () => updatePost(post.id, { body: text, imagePaths: images.map((i) => i.path), listingId: listingId || null }),
      () => {
        setEditing(false);
        router.refresh();
      },
    );
  }

  function cancel() {
    setText(post.body);
    setImages(post.images);
    setListingId(post.listingId ?? "");
    setEditing(false);
  }

  function remove() {
    if (!window.confirm("このつぶやきを削除しますか？（元に戻せません）")) return;
    run(() => deletePost(post.id), () => router.refresh());
  }

  return (
    <div className={`tweet-log-item${post.pinned ? " pp-pinned" : ""}`}>
      <div className="pp-log-head">
        <span className="pp-log-when">
          {post.pinned && <span className="pp-pin">📌 固定中</span>}
          {post.when}
          {post.edited && "（編集済み）"}
          {post.status === "held" && <span className="pp-state held">確認中</span>}
          {post.status === "hidden" && <span className="pp-state hidden">運営により非表示</span>}
        </span>
        {!editing && (
          <div className="pp-log-tools">
            {post.status === "visible" && (
              <button
                type="button"
                className="tweet-act-btn"
                disabled={pending}
                onClick={() => run(() => setPinned(post.id, !post.pinned), () => router.refresh())}
              >
                {post.pinned ? "固定を外す" : "固定する"}
              </button>
            )}
            {canEdit && post.status !== "hidden" && (
              <button type="button" className="tweet-act-btn" disabled={pending} onClick={() => setEditing(true)}>
                編集
              </button>
            )}
            <button type="button" className="tweet-act-btn danger" disabled={pending} onClick={remove}>
              削除
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="pp-edit">
          <textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="本文" disabled={pending} />
          <div className="pp-edit-row">
            <span className={`pp-count${over ? " over" : count > MAX - 20 ? " warn" : ""}`}>
              {count}/{MAX}
            </span>
          </div>
          <ImageUploader kind="post" value={images} onChange={setImages} max={4} disabled={pending} label="写真を追加" />
          <select className="pp-select" value={listingId} onChange={(e) => setListingId(e.target.value)} aria-label="紐づける商品" disabled={pending}>
            <option value="">商品を紐づけない</option>
            {options.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
          <div className="pp-edit-row">
            <button type="button" className="tweet-act-btn" onClick={cancel} disabled={pending}>
              やめる
            </button>
            <button type="button" className="pt-btn primary" onClick={save} disabled={pending || over || text.trim() === ""}>
              {pending ? "保存中…" : "保存する"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="pp-log-body">{post.body}</div>
          {post.images.length > 0 && (
            <div className="pp-log-imgs">
              {post.images.map((img, i) => (
                <img key={img.path} src={img.url} alt={`写真${i + 1}`} loading="lazy" />
              ))}
            </div>
          )}
          {post.listingId && post.listingTitle && (
            <Link href={`/items/${post.listingId}`} className="pp-log-listing">
              🛍 {post.listingTitle}
            </Link>
          )}
        </>
      )}

      <FormMessage error={error} message={message} />

      <div className="pp-log-foot">
        <span>♡ {post.likeCount}</span>
        <span>💬 {post.commentCount}</span>
        {post.status !== "hidden" && (
          <Link href={`/tweets/${post.id}`} className="pp-log-open">
            投稿を見る →
          </Link>
        )}
      </div>
    </div>
  );
}
