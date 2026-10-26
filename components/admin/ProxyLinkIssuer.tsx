"use client";
/* 代理登録した人に送る「パスワードを決めるリンク」を作る（/admin/proxy/[id]）。
   リンクはこの画面に1回だけ出す（保存しない）。運営は開かずに、本人だけに送る。
   新しく作ると前のリンクは使えなくなる。本人がパスワードを決めたら、ここからは作れなくなる。 */
import { useState, useTransition } from "react";
import { proxyIssueLink } from "@/lib/actions/proxy";
import { useFlash } from "./Flash";
import { Modal } from "./Modal";
import { san } from "@/lib/format";

export default function ProxyLinkIssuer({ userId, userName, issued }: { userId: string; userName: string; issued: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const flash = useFlash();

  function submit() {
    start(async () => {
      try {
        const r = await proxyIssueLink(userId);
        setConfirming(false);
        if (r.ok && r.data) {
          setUrl(r.data.url);
          setCopied(false);
          setError(null);
          flash(`リンクを作りました（${r.data.count}回目）。本人だけに送ってください。`, "ok");
        } else if (!r.ok) {
          setUrl(null);
          setError(r.error);
        }
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e) throw e;
        setConfirming(false);
        setError("通信に失敗しました。もう一度お試しください。");
      }
    });
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError("コピーできませんでした。リンクの欄を選んで、手でコピーしてください。");
    }
  }

  return (
    <div className="adm-form">
      <ul className="adm-hint" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
        <li>リンクは本人だけに送ってください（LINE・SMS など）。運営は開かないでください（開くと、その場でパスワードを決める画面になります）。</li>
        <li>リンクの期限は約1時間です。新しく作ると、前に作ったリンクは使えなくなります。</li>
        <li>本人がパスワードを決めると、ここからはリンクを作れなくなります（そのあとは本人が「パスワードを忘れた方」から再設定します）。</li>
      </ul>
      {url && (
        <div>
          <label className="adm-label" htmlFor="proxy-link">
            パスワードを決めるリンク（この画面を離れると消えます）
          </label>
          <input id="proxy-link" className="adm-input adm-mono" value={url} readOnly onFocus={(e) => e.currentTarget.select()} />
          <div className="adm-actions" style={{ marginTop: 8 }}>
            <button type="button" className="adm-btn primary" onClick={copy}>
              {copied ? "コピーしました" : "リンクをコピー"}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="adm-msg error" role="alert">
          {error}
        </p>
      )}
      <div>
        <button type="button" className="adm-save" onClick={() => setConfirming(true)} disabled={pending}>
          {issued > 0 || url ? "リンクを作り直す" : "パスワードを決めるリンクを作る"}
        </button>
      </div>
      {confirming && (
        <Modal title="リンクを作りますか？" onClose={() => setConfirming(false)} busy={pending}>
          <p>
            {san(userName)}がパスワードを決めるためのリンクを作ります。
            {issued > 0 || url ? "前に作ったリンクは使えなくなります。" : ""}
          </p>
          <p className="adm-hint">作ったことは記録に残ります。リンクそのものは記録に残しません。</p>
          <div className="adm-modal-actions">
            <button type="button" className="adm-btn" onClick={() => setConfirming(false)} disabled={pending}>
              やめる
            </button>
            <button type="button" className="adm-btn primary" onClick={submit} disabled={pending}>
              {pending ? "作成中…" : "作る"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
