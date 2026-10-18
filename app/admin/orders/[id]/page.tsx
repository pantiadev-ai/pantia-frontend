/* 注文の詳細（管理画面）。金額の内訳・決済・配送・流れと、運営によるキャンセル（→ 返金）。
   送り先の住所は管理画面でも出さない（要るときは出品者・購入者に聞く）。 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ActionButton from "@/components/admin/ActionButton";
import AdminShell from "@/components/admin/AdminShell";
import { describeAudit } from "@/components/admin/audit";
import { orderBadge } from "@/components/admin/badges";
import { Badge, Card, Dl, Empty } from "@/components/admin/parts";
import { nicknamesOf, requireAdminPage } from "@/lib/admin";
import { dateTimeJst, num, orderNo, yen } from "@/lib/format";
import { CARRIERS, categoryLabel, labelOf, LEDGER_KINDS, PAYMENT_METHODS } from "@/lib/labels";
import { isUuid } from "@/lib/search";
import { listingImage } from "@/lib/storage";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "注文の詳細" };

export default async function AdminOrderDetailPage({ params }: PageProps<"/admin/orders/[id]">) {
  await requireAdminPage();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const service = createServiceClient();
  const { data: o, error } = await service
    .from("orders")
    .select(
      "id, order_no, group_id, listing_id, seller_id, buyer_id, title, category, image_path, total, subtotal, fee, fee_rate, seller_net, base_price, worn_days, worn_surcharge, video_fee, anonymous, anonymous_fee, payment_method, payment_ref, refund_ref, needs_refund, refunded_at, status, cancel_reason, cancelled_at, paid_at, preparing_at, shipped_at, completed_at, auto_completed, carrier, tracking_no, expires_at, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("[admin] order", error.message);
  if (!o) notFound();

  const [ledger, logs, siblings] = await Promise.all([
    service.from("ledger_entries").select("id, user_id, amount, kind, note, created_at").eq("order_id", id).order("created_at", { ascending: true }).limit(50),
    service
      .from("audit_logs")
      .select("id, action, actor_id, target_type, target_id, detail, created_at")
      .eq("target_type", "order")
      .eq("target_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
    service.from("orders").select("id, order_no").eq("group_id", o.group_id).neq("id", id).limit(20),
  ]);
  if (ledger.error) console.error("[admin] order ledger", ledger.error.message);
  if (logs.error) console.error("[admin] order logs", logs.error.message);
  const names = await nicknamesOf(service, [o.seller_id, o.buyer_id, ...(logs.data ?? []).map((l) => l.actor_id), ...(ledger.data ?? []).map((e) => e.user_id)]);
  const who = (uid: string | null) => (uid ? (names.get(uid) ?? "退会したユーザー") : "自動");

  const img = listingImage(o.image_path);
  const refundPending = o.needs_refund && !o.refunded_at;
  const canCancel = o.status !== "cancelled" && o.status !== "completed";
  const steps: [string, string | null][] = [
    ["注文", o.created_at],
    ["支払い", o.paid_at],
    ["発送準備", o.preparing_at],
    ["発送", o.shipped_at],
    [o.auto_completed ? "取引完了（自動）" : "取引完了", o.completed_at],
    ["キャンセル", o.cancelled_at],
    ["返金", o.refunded_at],
  ];

  return (
    <AdminShell active="orders" title={`注文 ${orderNo(o.order_no)}`}>
      <Link href="/admin/orders" className="adm-back">
        ← 注文一覧へ
      </Link>

      {refundPending && (
        <div className="alert-banner danger">
          <span>
            💸 <strong>返金の手続きが要ります。</strong>キャンセル済みですが、決済の返金が済んでいません。
          </span>
        </div>
      )}

      <div className="dual-grid">
        <Card icon="🛍" title={`${orderNo(o.order_no)} ${o.title}`} right={<Badge b={orderBadge(o.status)} />}>
          {img && <img src={img} alt="" width={96} height={96} referrerPolicy="no-referrer" style={{ borderRadius: 10, objectFit: "cover", marginBottom: 12 }} />}
          <Dl
            rows={[
              ["注文ID", <span className="adm-mono" key="id">{o.id}</span>],
              ["カテゴリ", categoryLabel(o.category) || o.category],
              [
                "出品者",
                <Link href={`/admin/users/${o.seller_id}`} className="adm-link" key="s">
                  {who(o.seller_id)}
                </Link>,
              ],
              [
                "購入者",
                <Link href={`/admin/users/${o.buyer_id}`} className="adm-link" key="b">
                  {who(o.buyer_id)}
                </Link>,
              ],
              [
                "商品",
                <Link href={`/admin/items?q=${o.listing_id}`} className="adm-link" key="l">
                  商品を管理画面で見る
                </Link>,
              ],
              ["着用日数", o.worn_days > 0 ? `${num(o.worn_days)}日` : ""],
              ["匿名配送", o.anonymous ? "あり" : "なし"],
              ["動画オプション", o.video_fee > 0 ? "あり" : "なし"],
              ["支払いの期限", o.status === "pending" ? dateTimeJst(o.expires_at) : ""],
              ["キャンセルの理由", o.cancel_reason ? <span className="adm-pre" key="cr">{o.cancel_reason}</span> : ""],
              [
                "同時に買った注文",
                (siblings.data ?? []).length > 0 ? (
                  <span key="sib">
                    {(siblings.data ?? []).map((s, i) => (
                      <span key={s.id}>
                        {i > 0 && "・"}
                        <Link href={`/admin/orders/${s.id}`} className="adm-link">
                          {orderNo(s.order_no)}
                        </Link>
                      </span>
                    ))}
                  </span>
                ) : (
                  ""
                ),
              ],
            ]}
          />
        </Card>

        <Card icon="💴" tone="green" title="金額の内訳">
          <div className="adm-statline">
            <span>商品の価格</span>
            <b>{yen(o.base_price)}</b>
          </div>
          {o.worn_surcharge > 0 && (
            <div className="adm-statline">
              <span>着用日数の延長</span>
              <b>{yen(o.worn_surcharge)}</b>
            </div>
          )}
          {o.video_fee > 0 && (
            <div className="adm-statline">
              <span>動画オプション</span>
              <b>{yen(o.video_fee)}</b>
            </div>
          )}
          {o.anonymous_fee > 0 && (
            <div className="adm-statline">
              <span>匿名配送</span>
              <b>{yen(o.anonymous_fee)}</b>
            </div>
          )}
          <div className="adm-statline">
            <span>小計</span>
            <b>{yen(o.subtotal)}</b>
          </div>
          <div className="adm-statline">
            <span>お支払い（購入者）</span>
            <b className="adm-price">{yen(o.total)}</b>
          </div>
          <div className="adm-statline">
            <span>手数料（{Math.round(o.fee_rate * 1000) / 10}%）</span>
            <b>{yen(o.fee)}</b>
          </div>
          <div className="adm-statline">
            <span>出品者の受け取り</span>
            <b className="adm-ok-text">{yen(o.seller_net)}</b>
          </div>
          <div style={{ marginTop: 14 }}>
            <Dl
              rows={[
                ["支払い方法", labelOf(PAYMENT_METHODS, o.payment_method) || o.payment_method],
                ["決済の番号", o.payment_ref ? <span className="adm-mono" key="pr">{o.payment_ref}</span> : ""],
                ["返金の番号", o.refund_ref ? <span className="adm-mono" key="rr">{o.refund_ref}</span> : ""],
                ["配送会社", o.carrier ? labelOf(CARRIERS, o.carrier) || o.carrier : ""],
                ["追跡番号", o.tracking_no ? <span className="adm-mono" key="tn">{o.tracking_no}</span> : ""],
              ]}
            />
          </div>
        </Card>
      </div>

      <Card icon="🛠" tone="red" title="この注文への操作">
        {!canCancel && !refundPending ? (
          <Empty>{o.status === "completed" ? "取引が完了した注文はキャンセルできません。" : "この注文に今できる操作はありません。"}</Empty>
        ) : (
          <div className="adm-actions">
            {canCancel && (
              <ActionButton
                op="order.cancel"
                id={o.id}
                label="注文をキャンセル"
                className="reject"
                title={`${orderNo(o.order_no)} をキャンセルしますか？`}
                body={
                  o.status === "pending"
                    ? "支払い前の注文を取り消します。出品者・購入者に通知が届きます。"
                    : `元に戻せません。支払い済みの ${yen(o.total)} を購入者に返金し、出品者の売上から取り消します。出品者・購入者に通知が届きます。`
                }
                reason="required"
                reasonLabel="キャンセルの理由"
                reasonMax={500}
                confirmLabel="キャンセルする"
                danger
              />
            )}
            {refundPending && (
              <ActionButton
                op="order.refund"
                id={o.id}
                label="返金をやり直す"
                className="warn"
                title="返金をやり直しますか？"
                body={`${yen(o.total)} の返金を、決済会社にもう一度頼みます。`}
                confirmLabel="返金する"
              />
            )}
          </div>
        )}
      </Card>

      <div className="dual-grid">
        <Card icon="🕒" tone="blue" title="取引の流れ">
          <Dl rows={steps.filter(([, at]) => !!at).map(([label, at]) => [label, dateTimeJst(at)])} />
        </Card>

        <Card icon="📒" tone="yellow" title="この注文の台帳">
          {(ledger.data ?? []).length === 0 ? (
            <Empty>台帳の記録はありません。</Empty>
          ) : (
            <div>
              {(ledger.data ?? []).map((e) => (
                <div className="adm-row" key={e.id}>
                  <div>
                    <div className="adm-row-title">
                      {LEDGER_KINDS[e.kind] ?? e.kind}（{who(e.user_id)}）
                    </div>
                    <div className="adm-row-note">
                      {e.note ? `${e.note}・` : ""}
                      {dateTimeJst(e.created_at)}
                    </div>
                  </div>
                  <b className={e.amount >= 0 ? "adm-ok-text" : "adm-danger-text"}>
                    {e.amount >= 0 ? "+" : "−"}
                    {yen(Math.abs(e.amount))}
                  </b>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card icon="📋" title="この注文の記録">
        {(logs.data ?? []).length === 0 ? (
          <Empty>記録はありません。</Empty>
        ) : (
          <div className="activity-list">
            {(logs.data ?? []).map((l) => {
              const view = describeAudit(l, l.actor_id ? (names.get(l.actor_id) ?? null) : null);
              return (
                <div className="activity-item" key={l.id}>
                  <div className={`act-icon ${view.tone}`} aria-hidden="true">
                    {view.icon}
                  </div>
                  <div className="act-text">
                    <strong>[{view.tag}]</strong> {view.text}
                  </div>
                  <div className="act-time">{dateTimeJst(l.created_at)}</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </AdminShell>
  );
}
