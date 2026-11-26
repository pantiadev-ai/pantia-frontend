/* 利用者同士の会話（管理画面。改修リスト 行8）。利用者の詳細の「利用者同士の会話」から開く。
   中身を見るには、会話ごとに理由を書いて開く（DB の admin_open_thread）。開いてから30分、開いた管理者だけが見られる。
   見せるのは、送った人が同意（版2）したあとのメッセージだけ。開いたことと見たことは操作ログに残る（0023）。
   この画面を作るたびに「見た」が記録されるので、一覧のリンクは先読みしない。 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ActionButton from "@/components/admin/ActionButton";
import AdminShell from "@/components/admin/AdminShell";
import { list, obj, s } from "@/components/admin/json";
import { Card, Empty } from "@/components/admin/parts";
import { nicknamesOf, requireAdminPage } from "@/lib/admin";
import { dbCode } from "@/lib/db-errors";
import { dateTimeJst } from "@/lib/format";
import { isUuid } from "@/lib/search";
import { signedUrls } from "@/lib/storage-server";
import { createServiceClient } from "@/lib/supabase/service";
import { VIEW_MINUTES, viewSecondsLeft, viewUntil } from "@/lib/view-window";

export const metadata: Metadata = { title: "会話の確認" };

const STATUS_LABEL: Record<string, string> = { held: "保留中", hidden: "非表示" };

/** 画像の期限つき URL に使う、券の残りの秒（描く処理の外で今の時刻を取る。notifications と同じ形） */
function secondsLeftNow(openedAt: string): number {
  return viewSecondsLeft(openedAt, Date.now());
}

export default async function AdminUserThreadPage({ params }: PageProps<"/admin/users/[id]/threads/[threadId]">) {
  const me = await requireAdminPage();
  const { id: rawId, threadId: rawThread } = await params;
  if (!isUuid(rawId) || !isUuid(rawThread)) notFound();
  const id = rawId.toLowerCase();
  const threadId = rawThread.toLowerCase();

  const service = createServiceClient();
  // 当事者の確かめと名前のためだけに読む（中身は読まない）。無い会話・この人が当事者でない会話は 404
  const head = await service.from("threads").select("id, seller_id, buyer_id").eq("id", threadId).maybeSingle();
  if (head.error) {
    console.error("[admin] user thread head", head.error.message);
    return <Unreadable userId={id} />;
  }
  if (!head.data || (head.data.seller_id !== id && head.data.buyer_id !== id)) notFound();
  const sellerId: string = head.data.seller_id;
  const buyerId: string = head.data.buyer_id;

  // 開いていれば中身が返り、「見た」が操作ログに残る。開いていなければ view_grant_required
  const { data, error } = await service.rpc("admin_view_any_thread", { p_admin: me.id, p_thread: threadId });
  const closed = error ? dbCode(error) === "view_grant_required" : false;
  if (error && !closed) {
    console.error("[admin] user thread view", error.message);
    return <Unreadable userId={id} />;
  }

  const t = obj(data);
  const reason = s(t.reason);
  const openedAt = s(t.opened_at);
  const until = viewUntil(openedAt);
  const rows = list(t.messages).map((m) => ({
    id: s(m.id),
    sender: s(m.sender_id) || null,
    body: s(m.body),
    images: Array.isArray(m.image_paths) ? m.image_paths.filter((p): p is string => typeof p === "string") : [],
    listingId: s(m.listing_id) || null,
    status: s(m.status),
    at: s(m.created_at),
  }));
  // 画像の URL は券の残りの間だけ（券が切れたあとに画像だけ見られる、を作らない）
  const images = closed ? [] : rows.flatMap((r) => r.images);
  const [names, signed] = await Promise.all([
    nicknamesOf(service, [sellerId, buyerId]),
    signedUrls("chat-images", images, secondsLeftNow(openedAt)),
  ]);
  const nameOf = (uid: string) => names.get(uid) ?? "退会したユーザー";
  const senderOf = (uid: string | null) =>
    uid === sellerId ? `${nameOf(sellerId)}（出品者）` : uid === buyerId ? `${nameOf(buyerId)}（購入者）` : "お知らせ（自動）";

  return (
    <AdminShell active="users" title="会話の確認">
      <Card icon="💬" tone="yellow" title="利用者同士の会話" right={<BackLink userId={id} />}>
        <p className="adm-hint" style={{ marginBottom: 10 }}>
          <Link href={`/admin/users/${sellerId}`} className="adm-link">
            {nameOf(sellerId)}（出品者）
          </Link>{" "}
          と{" "}
          <Link href={`/admin/users/${buyerId}`} className="adm-link">
            {nameOf(buyerId)}（購入者）
          </Link>{" "}
          の会話です。確認に要らない内容は、外に持ち出さないでください。
        </p>

        {closed ? (
          <>
            <Empty>
              中身はまだ出していません。見るには、理由を書いて開いてください。開いたことと理由は操作ログに残り、開いてから{VIEW_MINUTES}分のあいだ、開いた人だけが見られます。
            </Empty>
            <div style={{ marginTop: 10 }}>
              <ActionButton
                op="thread.open"
                id={threadId}
                label="理由を書いて開く"
                className="warn"
                title="この会話を開きますか？"
                body={`理由は操作ログに残ります。開いてから${VIEW_MINUTES}分のあいだ、あなただけが中身を見られます。見られるのは、両方が同意したあとのメッセージだけです。`}
                reason="required"
                reasonLabel="確認の理由"
                reasonMax={200}
                confirmLabel="開く"
              />
            </div>
          </>
        ) : (
          <>
            <p className="adm-hint" style={{ marginBottom: 10 }}>
              開いた理由: <span className="adm-pre">{reason || "（理由なし）"}</span>
              <br />
              {openedAt && `${dateTimeJst(openedAt)} に開きました。`}
              {until && `${dateTimeJst(until)} まで見られます。`}見たことは操作ログに残ります。同意のあとのメッセージだけを、新しい200件まで出しています。
            </p>
            {rows.length === 0 ? (
              <Empty>見られるメッセージはありません。</Empty>
            ) : (
              <ol className="adm-thread">
                {rows.map((m) => (
                  <li key={m.id} className="adm-thread-msg">
                    <div className="adm-thread-head">
                      <b>{senderOf(m.sender)}</b>
                      <span className="adm-muted">{dateTimeJst(m.at)}</span>
                      {STATUS_LABEL[m.status] && <span className="badge badge-reject">{STATUS_LABEL[m.status]}</span>}
                    </div>
                    {m.body && <div className="adm-pre">{m.body}</div>}
                    {m.images.length > 0 && (
                      <div className="adm-docs">
                        {m.images.map((p) =>
                          signed[p] ? (
                            <a key={p} href={signed[p]} target="_blank" rel="noopener noreferrer">
                              <img src={signed[p]} alt="添付の画像" loading="lazy" referrerPolicy="no-referrer" />
                            </a>
                          ) : (
                            <span key={p} className="adm-muted">
                              （画像を読めませんでした）
                            </span>
                          ),
                        )}
                      </div>
                    )}
                    {m.listingId && (
                      <Link href={`/admin/items?q=${m.listingId}`} className="adm-link adm-hint">
                        紹介された商品を見る →
                      </Link>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </Card>
    </AdminShell>
  );
}

function BackLink({ userId }: { userId: string }) {
  return (
    <Link href={`/admin/users/${userId}`} className="adm-link adm-hint">
      ← 利用者の詳細に戻る
    </Link>
  );
}

function Unreadable({ userId }: { userId: string }) {
  return (
    <AdminShell active="users" title="会話の確認">
      <Card icon="💬" title="利用者同士の会話" right={<BackLink userId={userId} />}>
        <Empty>会話を読めませんでした。時間をおいて読み込み直してください。</Empty>
      </Card>
    </AdminShell>
  );
}
