"use client";
/* 退会。確認の文字とパスワード（ある人だけ）を入れてもらう。終わったらトップへ */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { withdraw } from "@/lib/actions/account";
import { FormMessage, useAction } from "@/components/useAction";
import { PASSWORD_MAX, WITHDRAW_WORD } from "@/components/account/options";

export default function WithdrawForm({ hasPassword }: { hasPassword: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const { pending, error, message, run } = useAction();
  const router = useRouter();
  const ready = confirm.trim() === WITHDRAW_WORD && (!hasPassword || password !== "");

  return (
    <>
      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-name acc-danger-text">退会する</div>
          <div className="setting-desc">退会すると元に戻せません。プロフィール・出品・つぶやき・画像は消え、ログインできなくなります。</div>
        </div>
        <button type="button" className="setting-btn acc-danger" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "閉じる" : "手続きへ"}
        </button>
      </div>
      {open && (
        <form
          className="acc-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ready) return;
            run(
              () => withdraw({ confirm, password, reason }),
              () => {
                // サーバー側でログアウト済み。トップを読み直す
                router.replace("/");
                router.refresh();
              },
            );
          }}
        >
          <div className="acc-box warn">
            次のときは退会できません。先に済ませてください。
            <ul>
              <li>取引中の注文がある（発送・受け取りの途中など）</li>
              <li>振込の申請が終わっていない、または売上が残っている</li>
              <li>本人確認の審査中</li>
            </ul>
            退会したあとは、同じメールアドレスで登録し直すことはできません。取引の記録は、法律で決められた期間、運営が保管します。
          </div>
          <label className="acc-field">
            <span className="acc-label">退会の理由（任意）</span>
            <textarea className="acc-input" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="acc-grid">
            <label className="acc-field">
              <span className="acc-label">
                確認のため「{WITHDRAW_WORD}」と入れてください<span className="acc-req">必須</span>
              </span>
              <input
                className="acc-input"
                autoComplete="off"
                required
                maxLength={20}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            {hasPassword && (
              <label className="acc-field">
                <span className="acc-label">
                  今のパスワード<span className="acc-req">必須</span>
                </span>
                <input
                  className="acc-input"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={PASSWORD_MAX}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            )}
          </div>
          {!hasPassword && (
            <p className="acc-note">Google・X でログインしている方は、ログインし直してから15分以内に手続きをしてください。</p>
          )}
          <FormMessage error={error} message={message} />
          <div className="acc-actions">
            <button type="submit" className="pt-btn primary acc-danger" disabled={pending || !ready}>
              {pending ? "手続き中…" : "退会する"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
