"use client";
/* お知らせのメール1種類の件名と書き出し（/admin/settings/mail）。打つたびに見本を組み立て直す。
   ・空のまま保存すると既定の文面で送る。「既定に戻す」は確認の窓を出してから、件名と書き出しを両方消す。
   ・長さと使えない文字は mailTemplateInput（lib/mail-templates.ts）で確かめる。server action も同じ物で確かめる。
   ・見本は本物の注文などを使わず、例の題・本文・リンクで組み立てる（組み立ては送るときと同じ composeMail）。 */
import { useState, useTransition } from "react";
import { saveMailTemplate } from "@/lib/actions/admin";
import { composeMail } from "@/lib/mail-compose";
import { mailTemplateInput, type MailTemplateDef } from "@/lib/mail-templates";
import { SITE_NAME } from "@/lib/site";
import { toneOf, useFlash } from "./Flash";
import { Modal } from "./Modal";
import { Badge, Card } from "./parts";

const SUBJECT_MAX = 100;
const BODY_MAX = 2000;
/** DB の char_length と同じ数え方（絵文字も1字） */
const count = (s: string) => Array.from(s).length;

const KIND_CARD = {
  order: { icon: "🧾", tone: "pk" },
  kyc: { icon: "🪪", tone: "yellow" },
  payout: { icon: "💴", tone: "green" },
} as const;

/** 画面に出す名前（振込のご案内は題の後ろに期限が付くので、括弧の前まで） */
export function mailTemplateName(def: MailTemplateDef): string {
  return def.prefix ? def.title.replace(/（$/, "") : def.title;
}

/** 見本に使う題・本文・リンク。本文は migrations の notify() が入れる物に似せた例 */
function sampleOf(def: MailTemplateDef): { title: string; body: string; link: string } {
  const title = def.prefix ? `${def.title}11/30 12:00 まで）` : def.title;
  switch (def.key) {
    case "order.transfer_guide":
      return { title, body: "（ここに振込先・振込名義・金額・期限が入ります）", link: "/checkout/transfer?group=…" };
    case "kyc.approved":
      return { title, body: "すべての機能をご利用いただけます。", link: "/mypage" };
    case "kyc.resubmit":
      return { title, body: "本人確認の画面から書類を提出してください。", link: "/kyc" };
    case "kyc.rejected":
      return { title, body: "（ここに承認できなかった理由が入ります）", link: "/kyc" };
    case "payout.paid":
      return { title, body: "（ここに振込の金額と銀行の名前が入ります）", link: "/mypage/sales" };
    case "payout.rejected":
      return { title, body: "（ここに承認できなかった理由が入ります）（残高に戻しました）", link: "/mypage/sales" };
    default:
      // 注文のメールは本文を載せない（composeMail が落とす）
      return { title, body: "", link: "/orders/…" };
  }
}

export default function MailTemplateForm({
  def,
  initial,
  siteUrl,
}: {
  def: MailTemplateDef;
  initial: { subject: string; body: string };
  siteUrl: string;
}) {
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [pending, start] = useTransition();
  const flash = useFlash();

  const edited = saved.subject !== "" || saved.body !== "";
  const dirty = subject !== saved.subject || body !== saved.body;
  const s = sampleOf(def);
  const preview = composeMail({ kind: def.kind, title: s.title, body: s.body, link: s.link }, siteUrl, {
    subject: subject.trim() || null,
    body: body.trim() || null,
  });
  const id = def.key.replace(".", "-");
  const card = KIND_CARD[def.kind];

  function send(next: { subject: string; body: string }, after: () => void) {
    start(async () => {
      try {
        const r = await saveMailTemplate({ key: def.key, ...next });
        if (r.ok) {
          after();
          const msg = r.message ?? "文面を保存しました。";
          flash(`${mailTemplateName(def)}: ${msg}`, toneOf(msg));
        } else {
          setResetting(false);
          setError(r.error);
        }
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e) throw e;
        setResetting(false);
        setError("通信に失敗しました。もう一度お試しください。");
      }
    });
  }

  function save() {
    const r = mailTemplateInput.safeParse({ key: def.key, subject, body });
    if (!r.success) {
      setError(r.error.issues[0]?.message ?? "入力の内容を確かめてください。");
      return;
    }
    setError(null);
    const next = { subject: r.data.subject, body: r.data.body };
    send(next, () => {
      setSubject(next.subject);
      setBody(next.body);
      setSaved(next);
    });
  }

  function reset() {
    setError(null);
    const next = { subject: "", body: "" };
    send(next, () => {
      setResetting(false);
      setSubject("");
      setBody("");
      setSaved(next);
    });
  }

  return (
    <Card
      icon={card.icon}
      tone={card.tone}
      title={mailTemplateName(def)}
      right={<Badge b={edited ? { cls: "badge-new", label: "編集済み" } : { cls: "badge-muted", label: "既定" }} />}
    >
      <p className="adm-hint" style={{ marginTop: 0, marginBottom: 12 }}>
        送る相手: {def.to} ／ {def.when}
      </p>
      <div className="dual-grid">
        <div className="adm-form">
          <div>
            <label className="adm-label" htmlFor={`${id}-subject`}>
              件名（{count(subject.trim())}/{SUBJECT_MAX}字）
            </label>
            <input
              id={`${id}-subject`}
              className="adm-input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={`【${SITE_NAME}】${s.title}`}
              maxLength={400}
              autoComplete="off"
              disabled={pending}
            />
          </div>
          <div>
            <label className="adm-label" htmlFor={`${id}-body`}>
              書き出し（{count(body.trim())}/{BODY_MAX}字）
            </label>
            <textarea
              id={`${id}-body`}
              className="adm-textarea"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={s.title}
              maxLength={4000}
              disabled={pending}
            />
            <p className="adm-hint">空のままなら既定の文面です。差し込めるのは {"{お知らせの題}"} と {"{サイト名}"} だけです。</p>
          </div>
          {error && (
            <p className="adm-msg error" role="alert">
              {error}
            </p>
          )}
          {dirty && !error && <p className="adm-hint">まだ保存していない変更があります。</p>}
          <div className="adm-actions" style={{ gap: 8 }}>
            <button type="button" className="adm-btn primary" onClick={save} disabled={pending || !dirty}>
              {pending && !resetting ? "保存中…" : "保存"}
            </button>
            {edited && (
              <button type="button" className="adm-btn" onClick={() => setResetting(true)} disabled={pending}>
                既定に戻す
              </button>
            )}
          </div>
        </div>
        <div>
          <span className="adm-label">見本（題・本文・リンクは例です）</span>
          <div className="adm-mail-preview">
            <strong>件名: {preview.subject}</strong>
            {"\n\n"}
            {preview.text}
          </div>
        </div>
      </div>
      {resetting && (
        <Modal title="既定の文面に戻しますか？" onClose={() => setResetting(false)} busy={pending}>
          <p>「{mailTemplateName(def)}」の件名と書き出しを消して、既定の文面で送るようにします。消した文は戻せません。</p>
          <div className="adm-modal-actions">
            <button type="button" className="adm-btn" onClick={() => setResetting(false)} disabled={pending}>
              やめる
            </button>
            <button type="button" className="adm-btn primary" onClick={reset} disabled={pending}>
              {pending ? "送信中…" : "既定に戻す"}
            </button>
          </div>
        </Modal>
      )}
    </Card>
  );
}
