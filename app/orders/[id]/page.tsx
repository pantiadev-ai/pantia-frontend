/* /orders/<id> 注文の詳細（見本なし。pg-app の型）。見られるのは購入者と出品者だけ（RLS）。
   お届け先: 購入者は自分の分。出品者は匿名配送でなければ発送まで（RLS）、匿名配送なら運営の転送先（service_role で読む）。 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "@/styles/app.css";
import { BuyerReceive, ContactButton, ReviewForm, SellerActions } from "@/components/commerce/OrderActions";
import PendingGroupActions from "@/components/commerce/PendingGroupActions";
import { publicNames } from "@/components/mypage/data";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { requireViewer } from "@/lib/auth";
import { cancelReasonLabel, optionLabels, ORDER_COLUMNS } from "@/lib/commerce";
import { dateTimeJst, displayName, maskName, orderNo, stars, yen } from "@/lib/format";
import { CARRIERS, labelOf, ORDER_STATUS, PAYMENT_METHODS } from "@/lib/labels";
import { refreshGroupForBuyer, resumeUrlForBuyer } from "@/lib/order-view";
import { isUuid } from "@/lib/search";
import { getSettings } from "@/lib/settings";
import { listingImage } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "注文の詳細", robots: { index: false } };

async function readOrder(id: string) {
  const { data, error } = await (await createClient()).from("orders").select(ORDER_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export default async function OrderDetailPage({ params }: PageProps<"/orders/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const viewer = await requireViewer(`/orders/${id}`);

  let order = await readOrder(id);
  if (!order) notFound();
  const isBuyer = order.buyer_id === viewer.id;
  const isSeller = order.seller_id === viewer.id;
  // 管理者も RLS では見えないので、ここに来るのは当事者だけ。念のため当事者以外は 404
  if (!isBuyer && !isSeller) notFound();
  // 出品者には、まだ払われていない注文を見せない（一覧にも出していない）
  if (isSeller && order.status === "pending") notFound();

  let resume: string | null = null;
  if (isBuyer && order.status === "pending") {
    await refreshGroupForBuyer(order.group_id, viewer.id);
    order = (await readOrder(id)) ?? order;
    if (order.status === "pending") resume = await resumeUrlForBuyer(order.group_id, viewer.id);
  }

  const supabase = await createClient();
  const otherId = isBuyer ? order.seller_id : order.buyer_id;
  const [settings, names, addressRes, reviewRes] = await Promise.all([
    getSettings(),
    publicNames(otherId ? [otherId] : []),
    supabase.from("order_addresses").select("name, postal, prefecture, address1, address2, phone").eq("order_id", id).maybeSingle(),
    supabase.from("reviews").select("rating, body, created_at").eq("order_id", id).maybeSingle(),
  ]);
  if (addressRes.error) console.error("[orders] address", addressRes.error.message);
  const address = addressRes.data;
  const review = reviewRes.data;

  // 匿名配送の出品者には、運営の転送先だけを見せる（購入者の住所は見せない）
  let forwarding: string | null = null;
  if (isSeller && order.anonymous && (order.status === "paid" || order.status === "preparing")) {
    const { data } = await createServiceClient().from("site_settings").select("forwarding_address").limit(1).maybeSingle();
    forwarding = data?.forwarding_address?.trim() || null;
  }

  const st = ORDER_STATUS[order.status];
  const otherName = otherId ? (isBuyer ? displayName(names.get(otherId)) : maskName(names.get(otherId))) : "退会したユーザー";
  const img = listingImage(order.image_path);
  const opts = optionLabels(order.options);
  const autoDue = order.shipped_at ? new Date(new Date(order.shipped_at).getTime() + settings.autoCompleteDays * 86_400_000) : null;
  const autoNote = autoDue
    ? `受け取りの連絡がないときは、${dateTimeJst(autoDue)}ごろに自動で取引を完了します。`
    : `発送から${settings.autoCompleteDays}日たつと、自動で取引を完了します。`;

  return (
    <div className="pg-app">
      <SiteHeader variant="app" />
      <main className="app-main">
        <nav className="breadcrumb" aria-label="パンくず">
          <Link href="/">ホーム</Link>›<Link href="/orders">注文</Link>›<span>{orderNo(order.order_no)}</span>
        </nav>
        <div className="row between wrap">
          <h1 className="page-title">注文の詳細</h1>
          <span className={`chip ${st?.tone ?? "gray"}`}>{st?.label ?? order.status}</span>
        </div>
        <p className="page-sub">
          注文番号 {orderNo(order.order_no)}・{dateTimeJst(order.created_at)}
        </p>

        {isBuyer && order.status === "pending" && (
          <div className="notice warn">
            <p>お支払いをお待ちしています。{order.expires_at && `期限は ${dateTimeJst(order.expires_at)} です（過ぎると自動で取り消されます）。`}</p>
            <PendingGroupActions groupId={order.group_id} resumeUrl={resume} />
          </div>
        )}
        {order.status === "cancelled" && (
          <div className="notice">
            <p>
              この注文は取り消されました{order.cancel_reason ? `（${cancelReasonLabel(order.cancel_reason)}）` : ""}。
            </p>
            {/* 返金が済むと needs_refund は false に戻り、refunded_at が入る（0004 mark_refunded） */}
            {(order.needs_refund || order.refunded_at) && (
              <p className="sub">
                {order.refunded_at
                  ? `${dateTimeJst(order.refunded_at)} に返金しました。カード会社・銀行での反映には数日かかることがあります。`
                  : "返金の手続き中です。返金が済むとお知らせします。"}
              </p>
            )}
          </div>
        )}

        <div className="grid-side">
          <div className="stack">
            <section className="card">
              <div className="list-row">
                {img ? (
                  <img className="thumb" src={img} alt="" />
                ) : (
                  <span className="thumb" aria-hidden="true" />
                )}
                <div className="grow">
                  {order.listing_id ? (
                    <Link className="strong" href={`/items/${order.listing_id}`}>
                      {order.title}
                    </Link>
                  ) : (
                    <span className="strong">{order.title}</span>
                  )}
                  {opts.length > 0 && <div className="muted">{opts.join("・")}</div>}
                </div>
              </div>
              <dl className="kv">
                <dt>商品</dt>
                <dd>{yen(order.base_price)}</dd>
                {order.worn_surcharge > 0 && (
                  <>
                    <dt>着用の延長</dt>
                    <dd>{yen(order.worn_surcharge)}</dd>
                  </>
                )}
                {order.video_fee > 0 && (
                  <>
                    <dt>動画</dt>
                    <dd>{yen(order.video_fee)}</dd>
                  </>
                )}
                {order.anonymous_fee > 0 && (
                  <>
                    <dt>匿名配送</dt>
                    <dd>{yen(order.anonymous_fee)}</dd>
                  </>
                )}
                <dt>合計（送料・税込）</dt>
                <dd className="strong">{yen(order.total)}</dd>
                {isSeller && (
                  <>
                    <dt>販売手数料</dt>
                    <dd>−{yen(order.fee)}</dd>
                    <dt>売上になる額</dt>
                    <dd className="strong">{yen(order.seller_net)}</dd>
                  </>
                )}
                {isBuyer && (
                  <>
                    <dt>お支払い方法</dt>
                    <dd>{labelOf(PAYMENT_METHODS, order.payment_method)}</dd>
                  </>
                )}
              </dl>
            </section>

            <section className="card">
              <h2 className="section-title">取引の流れ</h2>
              <dl className="kv">
                <dt>注文</dt>
                <dd>{dateTimeJst(order.created_at)}</dd>
                {order.paid_at && (
                  <>
                    <dt>支払い</dt>
                    <dd>{dateTimeJst(order.paid_at)}</dd>
                  </>
                )}
                {order.preparing_at && (
                  <>
                    <dt>発送の準備</dt>
                    <dd>{dateTimeJst(order.preparing_at)}</dd>
                  </>
                )}
                {order.shipped_at && (
                  <>
                    <dt>発送</dt>
                    <dd>
                      {dateTimeJst(order.shipped_at)}
                      {order.carrier && `　${labelOf(CARRIERS, order.carrier)}`}
                      {order.tracking_no && `　追跡番号 ${order.tracking_no}`}
                    </dd>
                  </>
                )}
                {order.completed_at && (
                  <>
                    <dt>取引完了</dt>
                    <dd>
                      {dateTimeJst(order.completed_at)}
                      {order.auto_completed && "（自動で完了）"}
                    </dd>
                  </>
                )}
                {order.cancelled_at && (
                  <>
                    <dt>取り消し</dt>
                    <dd>{dateTimeJst(order.cancelled_at)}</dd>
                  </>
                )}
              </dl>
            </section>

            {isSeller && (order.status === "paid" || order.status === "preparing") && (
              <SellerActions orderId={order.id} status={order.status} />
            )}
            {isBuyer && order.status === "shipped" && <BuyerReceive orderId={order.id} autoCompleteNote={autoNote} />}
            {isBuyer && order.status === "completed" && !review && <ReviewForm orderId={order.id} />}
            {review && (
              <section className="card">
                <h2 className="section-title">{isBuyer ? "あなたのレビュー" : "購入者のレビュー"}</h2>
                <p aria-label={`星${review.rating}つ`}>{stars(review.rating)}</p>
                {review.body && <p>{review.body}</p>}
                <p className="hint">{dateTimeJst(review.created_at)}</p>
              </section>
            )}
          </div>

          <aside className="stack">
            <section className="card">
              <h2 className="section-title">{isBuyer ? "出品者" : "購入者"}</h2>
              <div className="row between">
                {isBuyer && otherId ? <Link href={`/sellers/${otherId}`}>{otherName}</Link> : <span>{otherName}</span>}
                {otherId && order.status !== "pending" && (
                  <ContactButton otherUserId={otherId} label="メッセージ" />
                )}
              </div>
            </section>

            <section className="card">
              <h2 className="section-title">お届け先</h2>
              {forwarding ? (
                <>
                  <p className="notice">匿名配送の注文です。下の運営の転送先へ発送してください。購入者の住所はお知らせしません。</p>
                  <p style={{ whiteSpace: "pre-wrap" }}>{forwarding}</p>
                </>
              ) : isSeller && order.anonymous && (order.status === "paid" || order.status === "preparing") ? (
                <p className="notice warn">匿名配送の転送先を準備中です。運営からのお知らせをお待ちください。</p>
              ) : address ? (
                <>
                  {isBuyer && order.anonymous && <p className="hint">匿名配送です。出品者にこの住所は伝わりません。</p>}
                  <p>
                    〒{address.postal}
                    <br />
                    {address.prefecture}
                    {address.address1}
                    {address.address2 && (
                      <>
                        <br />
                        {address.address2}
                      </>
                    )}
                    <br />
                    {address.name} 様
                    <br />
                    {address.phone}
                  </p>
                </>
              ) : (
                <p className="muted">
                  {isSeller ? "取引が終わったため、お届け先は表示されません。" : "お届け先の記録は、取引の終了から90日で消えます。"}
                </p>
              )}
            </section>

            <p className="hint">
              困ったときは、まず相手にメッセージで相談してください。解決しないときは<Link href="/contact">お問い合わせ</Link>へ。
            </p>
          </aside>
        </div>
      </main>
      <SiteFooter variant="app" />
    </div>
  );
}
