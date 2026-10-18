"use client";
/* 出品者にメッセージを送るボタン。会話が開けたら startThread が /messages/<id> へ移す */
import { useRouter } from "next/navigation";
import { startThread } from "@/lib/actions/chat";
import { useAction } from "@/components/useAction";

type Props = {
  sellerId: string;
  loggedIn: boolean;
  className?: string;
  label?: string;
};

export default function MessageButton({ sellerId, loggedIn, className, label = "✉ メッセージを送る" }: Props) {
  const router = useRouter();
  const { pending, error, run } = useAction();
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() => {
          if (!loggedIn) {
            router.push(`/auth?next=${encodeURIComponent(location.pathname)}`);
            return;
          }
          run(() => startThread(sellerId));
        }}
      >
        {pending ? "開いています…" : label}
      </button>
      {error ? (
        <span className="pt-msg error" role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}
