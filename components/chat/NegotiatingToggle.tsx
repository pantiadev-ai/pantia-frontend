"use client";
/* 「交渉中」の札（売手が付け外しし、2人に見える）。
   会話の画面では、見出しの札・売手のボタン・一覧の開いている行が同じ値を見る（NegotiatingProvider）。
   相手が変えた時は ChatRoom が threads の Realtime で受けて setOn する */
import { createContext, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import { setNegotiating } from "@/lib/actions/chat";

type NegotiatingState = { on: boolean; setOn: (on: boolean) => void };

const NegotiatingContext = createContext<NegotiatingState | null>(null);

/** 会話の画面だけで包む。/messages（一覧だけ）では包まないので null になる */
export function useNegotiating(): NegotiatingState | null {
  return useContext(NegotiatingContext);
}

export function NegotiatingProvider({ initial, children }: { initial: boolean; children: ReactNode }) {
  const [on, setOn] = useState(initial);
  const value = useMemo(() => ({ on, setOn }), [on]);
  return <NegotiatingContext.Provider value={value}>{children}</NegotiatingContext.Provider>;
}

/** 見出しの名前の下に出す札 */
export function NegotiatingBadge() {
  const s = useNegotiating();
  if (!s?.on) return null;
  return <span className="chat-nego-badge">交渉中</span>;
}

/** 売手だけに出すボタン（見出しの 🔔 の隣）。押したら先に切り替え、失敗したら戻す */
export default function NegotiatingToggle({ threadId }: { threadId: string }) {
  const s = useNegotiating();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!s) return null;
  const { on, setOn } = s;
  const label = on ? "交渉中を外す" : "交渉中にする";

  return (
    <>
      <button
        type="button"
        className={`ch-btn${on ? " active" : ""}`}
        title={label}
        aria-label={label}
        aria-pressed={on}
        disabled={pending}
        onClick={() => {
          const next = !on;
          setError(null);
          setOn(next);
          start(async () => {
            try {
              const r = await setNegotiating(threadId, next);
              if (!r.ok) {
                setOn(!next);
                setError(r.error);
              } else if (r.data && r.data.on !== next) {
                setOn(r.data.on);
              }
            } catch {
              setOn(!next);
              setError("通信に失敗しました。");
            }
          });
        }}
      >
        🤝
      </button>
      {error && (
        <span className="pt-msg error chat-inline-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
