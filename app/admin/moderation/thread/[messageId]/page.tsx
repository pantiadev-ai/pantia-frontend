/* 通報されたメッセージ・自動で止まったメッセージの、前後のやり取り（前30件・後10件）。
   運営が会話を見られるのは、この2つから開いたときだけ（DB の admin_view_thread が確かめ、見たことを操作ログに残す）。
   利用者の同意は、初めて送るときにもらっている。チャットの画像は期限つき URL（60分）で出す。 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AdminShell from "@/components/admin/AdminShell";
import { list, obj, s } from "@/components/admin/json";
import { Card, Empty } from "@/components/admin/parts";
import { nicknamesOf, requireAdminPage } from "@/lib/admin";
import { dbCode } from "@/lib/db-errors";
import { dateTimeJst } from "@/lib/format";
import { isUuid } from "@/lib/search";
import { signedUrls } from "@/lib/storage-server";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "会話の確認" };

const STATUS_LABEL: Record<string, string> = { held: "保留中", hidden: "非表示" };

export default async function AdminThreadPage({ params }: PageProps<"/admin/moderation/thread/[messageId]">) {
  const me = await requireAdminPage();
  const { messageId } = await params;
  if (!isUuid(messageId)) notFound();

  const service = createServiceClient();
  const { data, error } = await service.rpc("admin_view_thread", { p_admin: me.id, p_message: messageId.toLowerCase() });
  if (error) {
    const notFlagged = dbCode(error) === "not_flagged";
    if (!notFlagged) console.error("[admin] view thread", error.message);
    return (
      <AdminShell active="moderation" title="会話の確認">
        <Card icon="💬" title="会話の確認">
          <Empty>
            {notFlagged
              ? "この会話は開けません。通報されたメッセージか、保留中・非表示のメッセージからだけ開けます。"
              : "会話を読めませんでした。時間をおいて読み込み直してください。"}
          </Empty>
        </Card>
      </AdminShell>
    );
  }

  const t = obj(data);
  const sellerId = s(t.seller_id);
  const buyerId = s(t.buyer_id);
  const targetId = s(t.target_id);
  const rows = list(t.messages).map((m) => ({
    id: s(m.id),
    sender: s(m.sender_id) || null,
    kind: s(m.kind),
    body: s(m.body),
    images: Array.isArray(m.image_paths) ? m.image_paths.filter((p): p is string => typeof p === "string") : [],
    listingId: s(m.listing_id) || null,
    orderId: s(m.order_id) || null,
    status: s(m.status),
    at: s(m.created_at),
    flagged: m.flagged === true,
  }));
  const [names, signed] = await Promise.all([nicknamesOf(service, [sellerId, buyerId]), signedUrls("chat-images", rows.flatMap((r) => r.images))]);
  const nameOf = (id: string) => names.get(id) ?? "退会したユーザー";
  const senderOf = (id: string | null) =>
    id === sellerId ? `${nameOf(sellerId)}（出品者）` : id === buyerId ? `${nameOf(buyerId)}（購入者）` : "お知らせ（自動）";

  return (
    <AdminShell active="moderation" title="会話の確認">
      <Card
        icon="💬"
        title="通報・保留のメッセージの前後"
        right={
          <Link href="/admin/moderation?type=message" className="adm-link adm-hint">
            ← モデレーションに戻る
          </Link>
        }
      >
        <p className="adm-hint" style={{ marginBottom: 10 }}>
          <Link href={`/admin/users/${sellerId}`} className="adm-link">
            {nameOf(sellerId)}（出品者）
          </Link>{" "}
          と{" "}
          <Link href={`/admin/users/${buyerId}`} className="adm-link">
            {nameOf(buyerId)}（購入者）
          </Link>{" "}
          の会話です。前30件・後10件を出しています。開いたことは操作ログに残ります。確認に要らない内容は、外に持ち出さないでください。
        </p>
        {rows.length === 0 ? (
          <Empty>メッセージがありません。</Empty>
        ) : (
          <ol className="adm-thread">
            {rows.map((m) => (
              <li key={m.id} className={`adm-thread-msg${m.flagged ? " flagged" : ""}${m.id === targetId ? " target" : ""}`}>
                <div className="adm-thread-head">
                  <b>{senderOf(m.sender)}</b>
                  <span className="adm-muted">{dateTimeJst(m.at)}</span>
                  {STATUS_LABEL[m.status] && <span className="badge badge-reject">{STATUS_LABEL[m.status]}</span>}
                  {m.id === targetId && <span className="badge badge-pending">開いたメッセージ</span>}
                  {m.flagged && m.id !== targetId && <span className="badge badge-muted">通報・保留あり</span>}
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
                {m.orderId && (
                  <Link href={`/admin/orders/${m.orderId}`} className="adm-link adm-hint">
                    注文を見る →
                  </Link>
                )}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </AdminShell>
  );
}
