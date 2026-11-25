"use client";
/* キャラのパスワードを決めるリンク（/admin/characters の一覧の行）。
   キャラは運営そのものなので、運営がリンクを開いてパスワードを決める。リンクは窓に1回だけ出す（保存しない）。
   新しく作ると前のリンクは使えなくなる。パスワードを決めたら、行からこのボタンが消える。 */
import { useId, useState, useTransition } from "react";
import { characterIssueLink } from "@/lib/actions/character";
import { useFlash } from "./Flash";
import { Modal } from "./Modal";

/** 作ったリンクと注意（作成の窓と、作り直しの窓で共用する） */
export function LinkBox({ url, onClose }: { url: string; onClose: () => void }) {
  const id = useId();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setError(null);
    } catch {
      setError("コピーできませんでした。リンクの欄を選んで、手でコピーしてください。");
    }
  }

  return (
    <>
      <div>
        <label className="adm-label" htmlFor={id}>
          パスワードを決めるリンク（この窓を閉じると消えます）
        </label>
        <input id={id} className="adm-input adm-mono" value={url} readOnly onFocus={(e) => e.currentTarget.select()} />
      </div>
      <ul className="adm-hint" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
        <li>管理画面と同じ窓で開くと、管理者のログインが切れます。シークレットウィンドウか別のブラウザで開いてください。</li>
        <li>期限は約1時間。新しく作ると前のリンクは使えなくなります。</li>
      </ul>
      {error && (
        <p className="adm-msg error" role="alert">
          {error}
        </p>
      )}
      <div className="adm-modal-actions">
        <button type="button" className="adm-btn primary" onClick={copy}>
          {copied ? "コピーしました" : "リンクをコピー"}
        </button>
        <button type="button" className="adm-btn" onClick={onClose}>
          閉じる
        </button>
      </div>
    </>
  );
}

export default function CharacterLinkIssuer({ userId, userName }: { userId: string; userName: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const flash = useFlash();

  function close() {
    setOpen(false);
    setUrl(null);
    setError(null);
  }

  function submit() {
    start(async () => {
      try {
        const r = await characterIssueLink(userId);
        if (r.ok && r.data) {
          setUrl(r.data.url);
          setError(null);
          flash(`リンクを作りました（${r.data.count}回目）。`, "ok");
        } else if (!r.ok) {
          setError(r.error);
        }
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e) throw e;
        setError("通信に失敗しました。もう一度お試しください。");
      }
    });
  }

  return (
    <>
      <button type="button" className="action-btn" onClick={() => setOpen(true)} disabled={pending}>
        パスワードのリンク
      </button>
      {open && (
        <Modal title={url ? "リンクを作りました" : "パスワードのリンクを作りますか？"} onClose={close} busy={pending}>
          {url ? (
            <LinkBox url={url} onClose={close} />
          ) : (
            <>
              <p>
                キャラ「<strong>{userName}</strong>」のパスワードを決めるリンクを作ります。前に作ったリンクは使えなくなります。
              </p>
              <p className="adm-hint">作ったことは記録に残ります。リンクそのものは記録に残しません。</p>
              {error && (
                <p className="adm-msg error" role="alert">
                  {error}
                </p>
              )}
              <div className="adm-modal-actions">
                <button type="button" className="adm-btn" onClick={close} disabled={pending}>
                  やめる
                </button>
                <button type="button" className="adm-btn primary" onClick={submit} disabled={pending}>
                  {pending ? "作成中…" : "作る"}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
