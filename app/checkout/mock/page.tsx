/* /checkout/mock?group=<注文のまとまり> テスト決済（PAYMENT_MODE=mock・本番以外だけ。それ以外は 404）。
   本人の支払い待ちの注文だけを出す（RLS＋購入者で絞る）。 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "@/styles/app.css";
import MockPayPanel from "@/components/commerce/MockPayPanel";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { mockAllowed } from "@/lib/adapters/payment";
import { requireViewer } from "@/lib/auth";
import { dateTimeJst, orderNo, yen } from "@/lib/format";
import { isUuid } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "テスト決済", robots: { index: false } };

export default async function MockPayPage({ searchParams }: PageProps<"/checkout/mock">) {
  if (!mockAllowed()) notFound();
  const sp = await searchParams;
  const group = Array.isArray(sp.group) ? sp.group[0] : sp.group;
  if (!group || !isUuid(group)) notFound();
  const viewer = await requireViewer(`/checkout/mock?group=${group}`);

  const { data: rows, error } = await (await createClient())
    .from("orders")
    .select("id, order_no, title, total, status, payment_method, expires_at")
    .eq("group_id", group)
    .eq("buyer_id", viewer.id)
    .order("created_at");
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) notFound();

  const total = rows.reduce((s, o) => s + o.total, 0);
  const payable = rows.every((o) => o.payment_method === "mock") && rows.some((o) => o.status === "pending");
  const expires = rows.find((o) => o.status === "pending")?.expires_at ?? null;

  return (
    <div className="pg-app">
      <SiteHeader variant="app" />
      <main className="app-main narrow">
        <h1 className="page-title">テスト決済</h1>
        <p className="notice warn">試験用の画面です。本物のお金は動きません。本番では表示されません。</p>
        <div className="card">
          <div className="stack">
            {rows.map((o) => (
              <div className="row between" key={o.id}>
                <span className="ellipsis">
                  <span className="muted">{orderNo(o.order_no)}</span> {o.title}
                </span>
                <span className="strong">{yen(o.total)}</span>
              </div>
            ))}
          </div>
          <hr className="divider" />
          <div className="row between">
            <span className="strong">お支払い合計</span>
            <span className="price">{yen(total)}</span>
          </div>
          {expires && <p className="hint">お支払いの期限: {dateTimeJst(expires)}</p>}
          <hr className="divider" />
          {payable ? (
            <MockPayPanel groupId={group} payable={payable} />
          ) : (
            <p className="notice">
              この注文は、もう支払い待ちではありません。<Link href={`/orders?group=${group}`}>注文を見る</Link>
            </p>
          )}
        </div>
      </main>
      <SiteFooter variant="app" />
    </div>
  );
}
