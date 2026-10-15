"use client";
/* 支払い待ちの注文の「お支払いを続ける」「注文を取り消す」 */
import { useRouter } from "next/navigation";
import { FormMessage, useAction } from "@/components/useAction";
import { cancelPendingGroup } from "@/lib/actions/checkout";

export default function PendingGroupActions({ groupId, resumeUrl }: { groupId: string; resumeUrl: string | null }) {
  const router = useRouter();
  const { pending, error, message, run } = useAction();

  function cancel() {
    if (!window.confirm("この注文を取り消します。よろしいですか？（同じ時に買った商品もまとめて取り消されます）")) return;
    run(
      () => cancelPendingGroup(groupId),
      () => router.refresh(),
    );
  }

  return (
    <div className="stack">
      <div className="row wrap">
        {resumeUrl && (
          <a className="btn primary" href={resumeUrl} rel="noopener noreferrer">
            お支払いを続ける
          </a>
        )}
        <button type="button" className="btn danger" disabled={pending} onClick={cancel}>
          {pending ? "取り消しています…" : "注文を取り消す"}
        </button>
      </div>
      <FormMessage error={error} message={message} />
    </div>
  );
}
