"use client";
/* メッセージの同意（通報・自動で止まったメッセージを運営が確かめること）の取り消し。
   同意は初めて送るときにチャットの画面でもらう。ここでは今の状態を見せて、取り消せるようにする */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { withdrawMessageConsent } from "@/lib/actions/account";
import { FormMessage, useAction } from "@/components/useAction";

export default function MessageConsentForm({ agreedOn }: { agreedOn: string | null }) {
  const [open, setOpen] = useState(false);
  const { pending, error, message, run } = useAction();
  const router = useRouter();

  return (
    <>
      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-name">運営による確認への同意</div>
          <div className="setting-desc">
            通報されたメッセージや、連絡先の交換などで自動で止まったメッセージは、運営が前後のやり取りを含めて確かめます。
            同意していないと、メッセージは送れません。
          </div>
        </div>
        <div className="setting-val">{agreedOn ? `${agreedOn} に同意` : "未同意"}</div>
        {agreedOn && (
          <button type="button" className="setting-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? "閉じる" : "取り消す"}
          </button>
        )}
      </div>
      {!open && <FormMessage error={error} message={message} />}
      {open && agreedOn && (
        <div className="acc-form">
          <p className="acc-note">取り消すと、次にメッセージを送るときに、もう一度同意を求めます。それまで送れません。</p>
          <FormMessage error={error} message={message} />
          <div className="acc-actions">
            <button
              type="button"
              className="pt-btn"
              disabled={pending}
              onClick={() =>
                run(
                  () => withdrawMessageConsent(),
                  () => {
                    setOpen(false);
                    router.refresh();
                  },
                )
              }
            >
              {pending ? "取り消し中…" : "同意を取り消す"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
