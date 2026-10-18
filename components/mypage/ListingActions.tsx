"use client";
/* 出品の一覧の行の操作（編集・公開・非公開・削除）。削除は確かめてから。
   公開は本人確認が済んだ人だけ（ボタンを止め、action の側でも確かめる）。 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setListingStatus } from "@/lib/actions/listings";
import { useAction, FormMessage } from "@/components/useAction";

type Props = {
  id: string;
  title: string;
  status: string;
  kycOk: boolean;
};

export default function ListingActions({ id, title, status, kycOk }: Props) {
  const router = useRouter();
  const { pending, error, run, setError } = useAction();
  const [confirm, setConfirm] = useState(false);

  const editable = status === "draft" || status === "published" || status === "private";
  const canPublish = status === "draft" || status === "private";

  function change(next: "published" | "private" | "deleted") {
    run(
      () => setListingStatus(id, next),
      () => {
        setConfirm(false);
        router.refresh();
      },
    );
  }

  return (
    <div className="my-item-actions">
      {editable && (
        <Link href={`/listings/${id}/edit`} className="ia-btn">
          編集
        </Link>
      )}
      {status === "published" && (
        <button type="button" className="ia-btn" onClick={() => change("private")} disabled={pending}>
          非公開
        </button>
      )}
      {canPublish && (
        <button
          type="button"
          className="ia-btn"
          onClick={() => change("published")}
          disabled={pending || !kycOk}
          title={kycOk ? undefined : "本人確認が済むと公開できます"}
        >
          公開する
        </button>
      )}
      {status !== "hidden" && (
        <button type="button" className="ia-btn danger" onClick={() => setConfirm(true)} disabled={pending}>
          削除
        </button>
      )}

      {(confirm || error) && (
        <div
          className="pt-modal-back"
          role="presentation"
          onClick={() => {
            if (pending) return;
            setConfirm(false);
            setError(null);
          }}
        >
          <div
            className="pt-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`del-${id}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id={`del-${id}`}>{confirm ? "出品を削除しますか？" : "うまくいきませんでした"}</h2>
            {confirm && (
              <p className="mp-hint">
                「{title || "（タイトルなし）"}」を削除します。削除した出品は元に戻せません（受けた注文の記録は残ります）。
              </p>
            )}
            <FormMessage error={error} />
            <div className="pt-modal-actions">
              <button
                type="button"
                className="pt-btn"
                onClick={() => {
                  setConfirm(false);
                  setError(null);
                }}
                disabled={pending}
              >
                {confirm ? "やめる" : "閉じる"}
              </button>
              {confirm && (
                <button type="button" className="pt-btn primary" onClick={() => change("deleted")} disabled={pending}>
                  {pending ? "削除しています…" : "削除する"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
