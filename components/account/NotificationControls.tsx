"use client";
/* お知らせの操作（開いたら既読・すべて既読・1件削除） */
import { useEffect, useRef } from "react";
import { markAllRead, markRead, removeNotification } from "@/lib/actions/notifications";
import { useAction } from "@/components/useAction";

/** 開いた画面に出ている未読を既読にする（1回だけ。今の表示の「未読」の印はそのまま残す） */
export function MarkReadOnView({ ids }: { ids: string[] }) {
  const key = ids.join(",");
  const done = useRef("");
  useEffect(() => {
    if (!key || done.current === key) return;
    done.current = key;
    markRead(key.split(",")).catch(() => {
      // 既読にできなくても、次に開いたときにもう一度試す
    });
  }, [key]);
  return null;
}

export function MarkAllReadButton({ disabled }: { disabled: boolean }) {
  const { pending, error, run } = useAction();
  return (
    <>
      <button type="button" className="pt-btn" disabled={disabled || pending} onClick={() => run(() => markAllRead())}>
        {pending ? "処理中…" : "すべて既読にする"}
      </button>
      {error && (
        <span className="pt-msg error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}

export function DeleteNotificationButton({ id }: { id: string }) {
  const { pending, error, run } = useAction();
  return (
    <>
      <button
        type="button"
        className="acc-icon-btn"
        aria-label="このお知らせを削除"
        disabled={pending}
        onClick={() => run(() => removeNotification(id))}
      >
        {pending ? "…" : "削除"}
      </button>
      {error && (
        <span className="pt-msg error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
