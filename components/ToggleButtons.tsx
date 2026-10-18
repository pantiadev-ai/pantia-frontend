"use client";
/* フォロー・お気に入り・いいね・ブロックのボタン。押したらすぐ見た目を変え、失敗したら戻す。
   見た目（クラス・文言）は使う画面が決める。ログインしていなければ /auth へ */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setBlock, setFavorite, setFollow, setPostLike } from "@/lib/actions/social";
import type { ActionResult } from "@/lib/action-result";

type Base = {
  id: string;
  initial: boolean;
  /** 数を一緒に出すとき（いいね数など） */
  count?: number;
  loggedIn: boolean;
  className?: string;
  activeClassName?: string;
  /** 文言 [オフのとき, オンのとき]。「{n}」は数に置き換わる（サーバーの画面から渡せるよう文字列だけ） */
  labels: [string, string];
  ariaLabel?: string;
  confirmOn?: string;
  /** 終わったら画面を読み直す（ブロックなど、ほかの表示に効くとき） */
  refresh?: boolean;
};

function Toggle({
  action,
  id,
  initial,
  count,
  loggedIn,
  className,
  activeClassName = "active",
  labels,
  ariaLabel,
  confirmOn,
  refresh,
}: Base & { action: (id: string, on: boolean) => Promise<ActionResult<{ on: boolean }>> }) {
  const [on, setOn] = useState(initial);
  const [n, setN] = useState(count);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        className={`${className ?? ""}${on ? ` ${activeClassName}` : ""}`.trim()}
        aria-pressed={on}
        aria-label={ariaLabel}
        disabled={pending}
        onClick={() => {
          if (!loggedIn) {
            router.push(`/auth?next=${encodeURIComponent(location.pathname)}`);
            return;
          }
          const next = !on;
          if (next && confirmOn && !window.confirm(confirmOn)) return;
          setError(null);
          setOn(next);
          if (n !== undefined) setN(Math.max(0, n + (next ? 1 : -1)));
          start(async () => {
            try {
              const r = await action(id, next);
              if (!r.ok) {
                setOn(!next);
                if (n !== undefined) setN(n);
                setError(r.error);
              } else if (refresh) {
                router.refresh();
              }
            } catch {
              setOn(!next);
              if (n !== undefined) setN(n);
              setError("通信に失敗しました。");
            }
          });
        }}
      >
        {labels[on ? 1 : 0].replace("{n}", String(n ?? 0))}
      </button>
      {error && (
        <span className="pt-msg error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}

export const FollowButton = (p: Base) => <Toggle action={setFollow} {...p} />;
export const FavoriteButton = (p: Base) => <Toggle action={setFavorite} {...p} />;
export const LikeButton = (p: Base) => <Toggle action={setPostLike} {...p} />;
export const BlockButton = (p: Base) => <Toggle action={setBlock} refresh {...p} />;
