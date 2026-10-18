"use client";
/* テスト決済の画面のボタン（決済会社の画面の代わり）。払う → 注文へ／やめる → 支払い待ちを取り消してカートへ */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormMessage, useAction } from "@/components/useAction";
import { cancelPendingGroup, mockPay } from "@/lib/actions/checkout";

export default function MockPayPanel({ groupId, payable }: { groupId: string; payable: boolean }) {
  const router = useRouter();
  const { pending, error, message, run } = useAction();
  const [done, setDone] = useState(false);

  return (
    <div className="stack">
      <FormMessage error={error} message={message} />
      <div className="row wrap">
        <button
          type="button"
          className="btn primary"
          disabled={pending || done || !payable}
          onClick={() =>
            run(
              () => mockPay(groupId),
              (d) => {
                if (!d?.url) return;
                setDone(true);
                router.replace(d.url);
              },
            )
          }
        >
          支払う（テスト）
        </button>
        <button
          type="button"
          className="btn"
          disabled={pending || done || !payable}
          onClick={() =>
            run(
              () => cancelPendingGroup(groupId),
              () => {
                setDone(true);
                router.replace("/cart");
              },
            )
          }
        >
          支払いをやめる
        </button>
      </div>
    </div>
  );
}
