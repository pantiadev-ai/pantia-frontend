"use client";
/* 通報（利用者・出品・つぶやき・コメント・メッセージ）。押すと小窓が開く */
import { useState } from "react";
import { fileReport } from "@/lib/actions/social";
import { FormMessage, useAction } from "@/components/useAction";

const REASONS: [string, string][] = [
  ["inappropriate", "不適切な内容"],
  ["spam", "スパム・宣伝"],
  ["fraud", "詐欺・取引のトラブル"],
  ["harassment", "嫌がらせ・誹謗中傷"],
  ["impersonation", "なりすまし"],
  ["underage", "18歳未満の疑い"],
  ["image", "画像の問題（顔・個人情報が写っている等）"],
  ["other", "その他"],
];

type Props = {
  type: "user" | "listing" | "post" | "comment" | "message";
  targetId: string;
  className?: string;
  label?: string;
  loggedIn: boolean;
};

export default function ReportButton({ type, targetId, className, label = "通報する", loggedIn }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("inappropriate");
  const [detail, setDetail] = useState("");
  const [done, setDone] = useState(false);
  const { pending, error, message, run } = useAction();

  // 受け付けたあとに閉じたら、入れた物を消して次の通報ができるように戻す
  function close() {
    setOpen(false);
    if (done) {
      setDone(false);
      setReason("inappropriate");
      setDetail("");
    }
  }

  if (!loggedIn) {
    return (
      <a className={className} href="/auth">
        {label}
      </a>
    );
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <div className="pt-modal-back" role="presentation" onClick={() => !pending && close()}>
          <div className="pt-modal" role="dialog" aria-modal="true" aria-labelledby="pt-report-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="pt-report-title">通報する</h2>
            {done ? (
              <>
                <FormMessage message={message} />
                <div className="pt-modal-actions">
                  <button type="button" className="pt-btn primary" onClick={close}>
                    閉じる
                  </button>
                </div>
              </>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() => fileReport({ type, targetId, reason, detail }), () => setDone(true));
                }}
              >
                <label htmlFor="pt-report-reason">理由</label>
                <select id="pt-report-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                  {REASONS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <label htmlFor="pt-report-detail">詳しい内容（{reason === "other" ? "必須" : "任意"}・500字まで）</label>
                <textarea id="pt-report-detail" maxLength={500} value={detail} onChange={(e) => setDetail(e.target.value)} />
                <FormMessage error={error} />
                <div className="pt-modal-actions">
                  <button type="button" className="pt-btn" onClick={() => setOpen(false)} disabled={pending}>
                    やめる
                  </button>
                  <button type="submit" className="pt-btn primary" disabled={pending}>
                    {pending ? "送信中…" : "通報する"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
