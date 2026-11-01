/* 注文管理（見本の panel-orders）。入金待ちの銀行振込（入金額を入れて確かめる）、返金待ちの注文（やり直し・振込は手で返金）、
   注文の一覧・絞り込み・検索。送り先の住所はここでは読まない。 */
import type { Metadata } from "next";
import Link from "next/link";
import ActionButton from "@/components/admin/ActionButton";
import AdminShell from "@/components/admin/AdminShell";
import { orderBadge } from "@/components/admin/badges";
import { Badge, Empty, FilterBar, Pager, TableTitle } from "@/components/admin/parts";
import { nicknamesOf, pageOf, param, pick, rangeOf, requireAdminPage } from "@/lib/admin";
import { dateTimeJst, excerpt, num, orderNo, yen } from "@/lib/format";
import { labelOf, ORDER_STATUS, PAYMENT_METHODS } from "@/lib/labels";
import { escapeLike, isUuid } from "@/lib/search";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "注文管理" };

const STATUSES = ["", ...Object.keys(ORDER_STATUS)];
const METHODS = ["", ...PAYMENT_METHODS.map((m) => m.value)];
/** 入金待ちの表に出す振込（期限のあとに振り込まれることもあるので、取り消し済みも30日までは残す） */
const TRANSFER_DAYS = 30;

function transferSince(): string {
  return new Date(Date.now() - TRANSFER_DAYS * 86_400_000).toISOString();
}

type TransferGroup = { state: "waiting" | "expired" | "cancelled"; nos: number[]; expiresAt: string | null };

/** 振込の group ごとに、注文の番号と状態をまとめる */
function transferGroups(
  rows: { group_id: string; order_no: number; status: string; expires_at: string | null; cancel_reason: string | null }[],
) {
  const out = new Map<string, TransferGroup>();
  for (const r of rows) {
    const g = out.get(r.group_id) ?? { state: "cancelled", nos: [], expiresAt: null };
    g.nos.push(r.order_no);
    if (r.status === "pending") {
      g.state = "waiting";
      g.expiresAt = r.expires_at;
    } else if (g.state !== "waiting" && r.cancel_reason === "expired") {
      g.state = "expired";
    }
    out.set(r.group_id, g);
  }
  return out;
}

const TRANSFER_STATE = {
  waiting: { cls: "badge-pending", label: "入金待ち" },
  expired: { cls: "badge-reject", label: "期限切れ" },
  cancelled: { cls: "badge-reject", label: "取り消し済み" },
} as const;

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  await requireAdminPage();
  const sp = await searchParams;
  const q = param(sp, "q", 50);
  const status = pick(param(sp, "status", 12), STATUSES, "");
  const method = pick(param(sp, "method", 12), METHODS, "");
  const userParam = param(sp, "user", 36);
  const user = isUuid(userParam) ? userParam : "";
  const page = pageOf(sp);
  const [from, to] = rangeOf(page);

  const service = createServiceClient();
  const cols = "id, order_no, title, total, status, payment_method, seller_id, buyer_id, created_at, cancelled_at, cancel_reason";
  let query = service.from("orders").select(cols, { count: "exact" });
  if (status) query = query.eq("status", status);
  if (method) query = query.eq("payment_method", method);
  if (user) query = query.or(`seller_id.eq.${user},buyer_id.eq.${user}`);
  if (q) {
    const no = q.replace(/^#/, "");
    if (/^\d{1,9}$/.test(no)) query = query.eq("order_no", Number(no));
    else if (isUuid(q)) query = query.eq("id", q);
    else query = query.ilike("title", `%${escapeLike(q)}%`);
  }

  const since = transferSince();
  const [orders, refunds, openTransfers] = await Promise.all([
    query.order("created_at", { ascending: false }).range(from, to),
    service.from("orders").select(cols).eq("needs_refund", true).is("refunded_at", null).order("cancelled_at", { ascending: true }).limit(50),
    service
      .from("bank_transfers")
      .select("group_id, code, buyer_id, amount, created_at")
      .is("confirmed_at", null)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(100),
  ]);
  if (orders.error) console.error("[admin] orders", orders.error.message);
  if (refunds.error) console.error("[admin] refunds", refunds.error.message);
  if (openTransfers.error) console.error("[admin] transfers", openTransfers.error.message);
  const rows = orders.data ?? [];
  const waiting = refunds.data ?? [];
  const transfers = openTransfers.data ?? [];
  const transferOrders = transfers.length
    ? await service
        .from("orders")
        .select("group_id, order_no, status, expires_at, cancel_reason")
        .in(
          "group_id",
          transfers.map((t) => t.group_id),
        )
        .order("order_no")
    : null;
  if (transferOrders?.error) console.error("[admin] transfer orders", transferOrders.error.message);
  const groups = transferGroups(transferOrders?.data ?? []);
  const names = await nicknamesOf(
    service,
    [...rows, ...waiting].flatMap((o) => [o.seller_id, o.buyer_id]).concat(user, transfers.map((t) => t.buyer_id)),
  );
  const who = (id: string | null) => (id ? (names.get(id) ?? "退会したユーザー") : "—");
  const filter = { q, status, method, user };

  return (
    <AdminShell active="orders" title="注文管理">
      {transfers.length > 0 && (
        <div className="table-card" data-testid="transfer-table">
          <div className="table-toolbar">
            <TableTitle icon="🏦" tone="yellow">
              入金待ちの銀行振込（{num(transfers.length)}件）
            </TableTitle>
          </div>
          <div className="alert-banner warn" style={{ margin: "0 16px 12px" }}>
            🏦 口座の入金を見て、振込名義の先頭の番号が合う行の「入金を確認」を押し、入金額を入れてください。金額が請求額と違うときは確定しません。
            期限切れの行も、あとから振り込まれたら確認できます（商品が売れていれば返金待ちに入ります）。
          </div>
          <div className="adm-scroll">
            <table>
              <thead>
                <tr>
                  <th>振込名義</th>
                  <th>購入者</th>
                  <th>注文</th>
                  <th>請求額</th>
                  <th>期限</th>
                  <th>状態</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => {
                  const g = groups.get(t.group_id);
                  const st = TRANSFER_STATE[g?.state ?? "cancelled"];
                  return (
                    <tr key={t.group_id}>
                      <td className="adm-mono adm-price">{t.code}</td>
                      <td>{who(t.buyer_id)}</td>
                      <td className="adm-mono">{(g?.nos ?? []).map((n) => orderNo(n)).join("・") || "—"}</td>
                      <td className="adm-price">{yen(t.amount)}</td>
                      <td className="adm-muted">{g?.expiresAt ? dateTimeJst(g.expiresAt) : "—"}</td>
                      <td>
                        <Badge b={st} />
                      </td>
                      <td>
                        <div className="adm-actions">
                          <ActionButton
                            op="transfer.confirm"
                            id={t.group_id}
                            label="入金を確認"
                            className="approve"
                            title="振込の入金を確認しますか？"
                            body={`振込名義「${t.code}」の入金を確かめます。口座で見た入金額を入れてください（請求額 ${yen(t.amount)}）。`}
                            reason="required"
                            reasonLabel="入金額（円）"
                            reasonMax={20}
                            confirmLabel="確認する"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {waiting.length > 0 && (
        <div className="table-card">
          <div className="table-toolbar">
            <TableTitle icon="💸" tone="red">
              返金の手続きが要る注文（{num(waiting.length)}件）
            </TableTitle>
          </div>
          <div className="alert-banner danger" style={{ margin: "0 16px 12px" }}>
            ⚠️ キャンセルしたのに、決済の返金が済んでいません。「返金をやり直す」を押してください。何度やっても失敗するときは、決済会社の管理画面で返金してください。
            銀行振込の注文は、購入者に返金先の口座を聞いて振り込み、「返金済みにする」を押してください。
          </div>
          <div className="adm-scroll">
            <table>
              <thead>
                <tr>
                  <th>注文ID</th>
                  <th>購入者</th>
                  <th>商品</th>
                  <th>金額</th>
                  <th>支払い方法</th>
                  <th>キャンセル日時</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {waiting.map((o) => (
                  <tr key={o.id}>
                    <td className="adm-mono adm-price">
                      <Link href={`/admin/orders/${o.id}`} className="adm-link">
                        {orderNo(o.order_no)}
                      </Link>
                    </td>
                    <td>{who(o.buyer_id)}</td>
                    <td>{excerpt(o.title, 24)}</td>
                    <td className="adm-price">{yen(o.total)}</td>
                    <td>{labelOf(PAYMENT_METHODS, o.payment_method) || o.payment_method}</td>
                    <td className="adm-muted">{dateTimeJst(o.cancelled_at)}</td>
                    <td>
                      <div className="adm-actions">
                        {o.payment_method === "transfer" ? (
                          <ActionButton
                            op="order.refund_manual"
                            id={o.id}
                            label="返金済みにする"
                            className="warn"
                            title="返金済みにしますか？"
                            body={`${orderNo(o.order_no)}（${yen(o.total)}）を、購入者の口座へ振り込んだあとに押してください。購入者にお知らせが届きます。`}
                            reason="optional"
                            reasonLabel="メモ（振込日など）"
                            reasonMax={100}
                            confirmLabel="返金済みにする"
                          />
                        ) : (
                          <ActionButton
                            op="order.refund"
                            id={o.id}
                            label="返金をやり直す"
                            className="warn"
                            title="返金をやり直しますか？"
                            body={`${orderNo(o.order_no)}（${yen(o.total)}）の返金を、決済会社にもう一度頼みます。`}
                            confirmLabel="返金する"
                          />
                        )}
                        <Link href={`/admin/orders/${o.id}`} className="action-btn">
                          詳細
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {user && (
        <div className="alert-banner warn">
          <span>
            👤 <strong>{who(user)}</strong>さんの注文（売った・買った）だけを表示しています。
          </span>
          <Link href={`/admin/users/${user}`} className="adm-link" style={{ marginLeft: "auto" }}>
            ユーザーの詳細へ
          </Link>
          <Link href="/admin/orders" className="adm-link">
            絞り込みを外す
          </Link>
        </div>
      )}

      <div className="table-card">
        <FilterBar
          action="/admin/orders"
          keep={{ user }}
          search={{ value: q, placeholder: "注文番号・商品名で検索" }}
          selects={[
            {
              name: "status",
              label: "状態",
              value: status,
              options: [{ value: "", label: "全ステータス" }, ...Object.entries(ORDER_STATUS).map(([value, s]) => ({ value, label: s.label }))],
            },
            {
              name: "method",
              label: "支払い方法",
              value: method,
              options: [{ value: "", label: "全支払い方法" }, ...PAYMENT_METHODS.map((m) => ({ value: m.value, label: m.label }))],
            },
          ]}
        />
        {orders.error ? (
          <Empty>一覧を読めませんでした。時間をおいて読み込み直してください。</Empty>
        ) : rows.length === 0 ? (
          <Empty>{q || status || method || user ? "条件に合う注文はありません。" : "まだ注文はありません。"}</Empty>
        ) : (
          <div className="adm-scroll">
            <table>
              <thead>
                <tr>
                  <th>注文ID</th>
                  <th>購入者</th>
                  <th>出品者</th>
                  <th>商品</th>
                  <th>金額</th>
                  <th>日時</th>
                  <th>ステータス</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td className="adm-mono adm-price">{orderNo(o.order_no)}</td>
                    <td>{who(o.buyer_id)}</td>
                    <td>{who(o.seller_id)}</td>
                    <td>{excerpt(o.title, 24)}</td>
                    <td className="adm-price">{yen(o.total)}</td>
                    <td className="adm-muted">{dateTimeJst(o.created_at)}</td>
                    <td>
                      <Badge b={orderBadge(o.status)} />
                    </td>
                    <td>
                      <Link href={`/admin/orders/${o.id}`} className="action-btn">
                        詳細
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager base="/admin/orders" q={filter} page={page} total={orders.count ?? 0} />
      </div>
    </AdminShell>
  );
}
