/* 管理画面の検索（上の帯の検索窓から来る）。ユーザー・商品・注文をまとめて探す（それぞれ10件まで）。
   名前・商品名は部分一致（LIKE の記号は文字として扱う）、ID（英数字の列）はぴったり一致、数字だけなら注文番号。
   メールアドレスでは探さない（一覧にメールを出さない決まりのため）。 */
import type { Metadata } from "next";
import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";
import { listingBadge, orderBadge, roleBadge, userStatusBadge } from "@/components/admin/badges";
import { Badge, Card, Empty, FilterBar, Initial } from "@/components/admin/parts";
import { param, requireAdminPage } from "@/lib/admin";
import { dateJst, excerpt, orderNo, yen } from "@/lib/format";
import { escapeLike, isUuid } from "@/lib/search";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "検索" };

const LIMIT = 10;

export default async function AdminSearchPage({ searchParams }: PageProps<"/admin/search">) {
  await requireAdminPage();
  const sp = await searchParams;
  const q = param(sp, "q", 50).normalize("NFKC").trim();

  const searchBar = <FilterBar action="/admin/search" title="ユーザー・商品・注文を検索" search={{ value: q, placeholder: "名前・商品名・注文番号・ID" }} />;

  if (!q) {
    return (
      <AdminShell active="search" title="検索">
        <div className="table-card">
          {searchBar}
          <Empty>検索する言葉を入れてください。名前・商品名の一部、注文番号（#123 など）、ID で探せます。</Empty>
        </div>
      </AdminShell>
    );
  }

  const uuid = isUuid(q);
  const digits = q.replace(/^#/, "");
  const orderNoValue = /^\d{1,9}$/.test(digits) ? Number(digits) : null;
  const like = `%${escapeLike(q)}%`;

  const service = createServiceClient();
  const usersQuery = service.from("profiles").select("id, nickname, role, status, created_at").order("created_at", { ascending: false }).limit(LIMIT);
  const itemsQuery = service.from("listings").select("id, title, price, status, created_at").order("created_at", { ascending: false }).limit(LIMIT);
  const ordersQuery = service.from("orders").select("id, order_no, title, total, status, created_at").order("created_at", { ascending: false }).limit(LIMIT);

  const [users, items, orders] = await Promise.all([
    uuid ? usersQuery.eq("id", q) : usersQuery.ilike("nickname", like),
    uuid ? itemsQuery.eq("id", q) : itemsQuery.ilike("title", like),
    uuid ? ordersQuery.eq("id", q) : orderNoValue != null ? ordersQuery.eq("order_no", orderNoValue) : ordersQuery.ilike("title", like),
  ]);
  if (users.error) console.error("[admin] search users", users.error.message);
  if (items.error) console.error("[admin] search listings", items.error.message);
  if (orders.error) console.error("[admin] search orders", orders.error.message);

  const userRows = users.data ?? [];
  const itemRows = items.data ?? [];
  const orderRows = orders.data ?? [];
  const more = (n: number) => (n >= LIMIT ? `（最初の${LIMIT}件）` : `（${n}件）`);

  return (
    <AdminShell active="search" title="検索">
      <div className="table-card">{searchBar}</div>

      <Card
        icon="👥"
        tone="blue"
        title={`ユーザー${more(userRows.length)}`}
        right={
          userRows.length >= LIMIT && !uuid ? (
            <Link href={`/admin/users?q=${encodeURIComponent(q)}`} className="adm-link">
              ユーザー管理で全部見る →
            </Link>
          ) : undefined
        }
      >
        {users.error ? (
          <Empty>読めませんでした。時間をおいて読み込み直してください。</Empty>
        ) : userRows.length === 0 ? (
          <Empty>該当するユーザーはいません。</Empty>
        ) : (
          <div>
            {userRows.map((u) => (
              <div className="adm-row" key={u.id}>
                <div>
                  <Initial name={u.nickname || "？"} />
                  <Link href={`/admin/users/${u.id}`} className="td-name adm-link">
                    {u.nickname || "（名前なし）"}
                  </Link>
                  <span className="adm-muted adm-hint"> 登録 {dateJst(u.created_at)}</span>
                </div>
                <div className="adm-actions">
                  <Badge b={roleBadge(u.role)} />
                  <Badge b={userStatusBadge(u.status)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        icon="🛍"
        tone="pk"
        title={`商品${more(itemRows.length)}`}
        right={
          itemRows.length >= LIMIT && !uuid ? (
            <Link href={`/admin/items?q=${encodeURIComponent(q)}`} className="adm-link">
              商品管理で全部見る →
            </Link>
          ) : undefined
        }
      >
        {items.error ? (
          <Empty>読めませんでした。時間をおいて読み込み直してください。</Empty>
        ) : itemRows.length === 0 ? (
          <Empty>該当する商品はありません。</Empty>
        ) : (
          <div>
            {itemRows.map((l) => (
              <div className="adm-row" key={l.id}>
                <div>
                  <Link href={`/admin/items?q=${l.id}`} className="adm-row-title adm-link">
                    {excerpt(l.title, 40)}
                  </Link>
                  <div className="adm-row-note">
                    {yen(l.price)}・出品 {dateJst(l.created_at)}
                  </div>
                </div>
                <Badge b={listingBadge(l.status)} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        icon="📦"
        tone="green"
        title={`注文${more(orderRows.length)}`}
        right={
          orderRows.length >= LIMIT && !uuid ? (
            <Link href={`/admin/orders?q=${encodeURIComponent(q)}`} className="adm-link">
              注文管理で全部見る →
            </Link>
          ) : undefined
        }
      >
        {orders.error ? (
          <Empty>読めませんでした。時間をおいて読み込み直してください。</Empty>
        ) : orderRows.length === 0 ? (
          <Empty>該当する注文はありません。</Empty>
        ) : (
          <div>
            {orderRows.map((o) => (
              <div className="adm-row" key={o.id}>
                <div>
                  <Link href={`/admin/orders/${o.id}`} className="adm-row-title adm-link">
                    <span className="adm-mono">{orderNo(o.order_no)}</span> {excerpt(o.title, 36)}
                  </Link>
                  <div className="adm-row-note">
                    {yen(o.total)}・{dateJst(o.created_at)}
                  </div>
                </div>
                <Badge b={orderBadge(o.status)} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </AdminShell>
  );
}
