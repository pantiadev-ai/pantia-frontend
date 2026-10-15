"use client";
/* コメントを書く欄（見本の cmt-input-wrap）。本人確認済みでログイン中の人にだけ出す（出す・出さないはページが決める）。
   DB の上限は200字。送ったら欄を空にして画面を読み直す。 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormMessage, useAction } from "@/components/useAction";
import { addComment, deleteComment } from "@/lib/actions/posts";

const MAX = 200;

export default function CommentForm({ postId, initial }: { postId: string; initial: string }) {
  const router = useRouter();
  const { pending, error, message, run } = useAction();
  const [text, setText] = useState("");
  const count = Array.from(text).length;
  const over = count > MAX;

  function send() {
    if (text.trim() === "" || over || pending) return;
    run(
      () => addComment({ postId, body: text }),
      () => {
        setText("");
        router.refresh();
      },
    );
  }

  return (
    <>
      <form
        className="cmt-input-wrap"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="cmt-avatar" aria-hidden="true">
          {initial}
        </div>
        <input
          className="cmt-input"
          type="text"
          placeholder="コメントを送る..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="コメント"
          disabled={pending}
        />
        {count > MAX - 30 && <span className={`pp-cmt-count${over ? " over" : ""}`}>{MAX - count}</span>}
        <button type="submit" className="cmt-send" disabled={pending || text.trim() === "" || over}>
          {pending ? "送信中…" : "送信"}
        </button>
      </form>
      <FormMessage error={error} message={message} />
    </>
  );
}

/** コメントの削除（自分のコメント、または自分の投稿についたコメント。決めるのは RLS） */
export function DeleteCommentButton({ commentId }: { commentId: string }) {
  const router = useRouter();
  const { pending, error, run } = useAction();
  return (
    <>
      <button
        type="button"
        className="pp-cmt-del"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("このコメントを削除しますか？")) return;
          run(() => deleteComment(commentId), () => router.refresh());
        }}
      >
        {pending ? "削除中…" : "削除"}
      </button>
      {error && (
        <span className="pt-msg error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
