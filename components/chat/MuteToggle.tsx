"use client";
/* この会話のお知らせを止める・戻す（会話の頭の 🔔 / 🔕） */
import { useState, useTransition } from "react";
import { setMuted } from "@/lib/actions/chat";

export default function MuteToggle({ threadId, initial }: { threadId: string; initial: boolean }) {
  const [muted, setMutedState] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const label = muted ? "お知らせを再開する" : "お知らせを止める";

  return (
    <>
      <button
        type="button"
        className={`ch-btn${muted ? " active" : ""}`}
        title={label}
        aria-label={label}
        aria-pressed={muted}
        disabled={pending}
        onClick={() => {
          const next = !muted;
          setError(null);
          setMutedState(next);
          start(async () => {
            try {
              const r = await setMuted(threadId, next);
              if (!r.ok) {
                setMutedState(!next);
                setError(r.error);
              }
            } catch {
              setMutedState(!next);
              setError("通信に失敗しました。");
            }
          });
        }}
      >
        {muted ? "🔕" : "🔔"}
      </button>
      {error && (
        <span className="pt-msg error chat-inline-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
