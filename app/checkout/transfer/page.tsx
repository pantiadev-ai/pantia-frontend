/* /checkout/transfer?group=<注文のまとまり> 運営の口座への振込の案内（振込先・振込名義・金額・期限）。
   本人の振込の行だけを読む（bank_transfers の RLS＋購入者で絞る）。振込先の口座は利用者に列の権限が無いので、
   本人だと確かめたあとに service_role で読む。入金は運営が管理画面で確かめる。 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "@/styles/app.css";
import PendingGroupActions from "@/components/commerce/PendingGroupActions";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { requireViewer } from "@/lib/auth";
import { dateTimeJst, orderNo, yen } from "@/lib/format";
import { isUuid } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "お振込のご案内", robots: { index: false } };

type Account = { bank: string; branch: string; type: string; number: string; holder: string };

async function loadAccount(): Promise<Account | null> {
  const { data, error } = await createServiceClient()
    .from("site_settings")
    .select("transfer_bank, transfer_branch, transfer_type, transfer_number, transfer_holder")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !data.transfer_bank || !data.transfer_number) return null;
  return {
    bank: data.transfer_bank,
    branch: data.transfer_branch,
    type: data.transfer_type === "checking" ? "当座" : "普通",
    number: data.transfer_number,
    holder: data.transfer_holder,
  };
}

export default async function TransferPage({ searchParams }: PageProps<"/checkout/transfer">) {
  const sp = await searchParams;
  const group = Array.isArray(sp.group) ? sp.group[0] : sp.group;
  if (!group || !isUuid(group)) notFound();
  const viewer = await requireViewer(`/checkout/transfer?group=${group}`);

  const supabase = await createClient();
  const [{ data: transfer, error: tErr }, { data: rows, error: oErr }] = await Promise.all([
    supabase
      .from("bank_transfers")
      .select("code, amount, confirmed_at")
      .eq("group_id", group)
      .eq("buyer_id", viewer.id)
      .maybeSingle(),
    supabase
      .from("orders")
      .select("id, order_no, title, total, status, expires_at")
      .eq("group_id", group)
      .eq("buyer_id", viewer.id)
      .order("created_at"),
  ]);
  if (tErr) throw new Error(tErr.message);
  if (oErr) throw new Error(oErr.message);
  if (!transfer || !rows || rows.length === 0) notFound();

  const waiting = !transfer.confirmed_at && rows.some((o) => o.status === "pending");
  const expires = rows.find((o) => o.status === "pending")?.expires_at ?? null;
  const account = waiting ? await loadAccount() : null;

  return (
    <div className="pg-app">
      <SiteHeader variant="app" />
      <main className="app-main narrow">
        <nav className="breadcrumb" aria-label="パンくず">
          <Link href="/">ホーム</Link>›<Link href="/orders">注文</Link>›<span>お振込のご案内</span>
        </nav>
        <h1 className="page-title">お振込のご案内</h1>
        {transfer.confirmed_at ? (
          <p className="notice ok">
            お振込を確認しました。出品者が発送の準備をします。<Link href={`/orders?group=${group}`}>注文を見る</Link>
          </p>
        ) : !waiting ? (
          <p className="notice warn">
            お振込の期限が過ぎたため、注文は取り消されました。期限のあとにお振り込みになった場合は、
            <Link href="/contact">お問い合わせ</Link>から振込名義（{transfer.code}）を添えてご連絡ください。
          </p>
        ) : (
          <p className="page-sub">下の口座へ、期限までにお振り込みください。入金を確かめたら、お知らせとメールでお伝えします。</p>
        )}

        {waiting && (
          <div className="card">
            <h2 className="section-title">お振込の内容</h2>
            <dl className="kv">
              <dt>振込先</dt>
              <dd data-testid="transfer-account">
                {account ? (
                  <>
                    {account.bank} {account.branch}
                    <br />
                    {account.type} {account.number}
                    <br />
                    {account.holder}
                  </>
                ) : (
                  <>振込先を読めませんでした。少しおいて、この画面を読み込み直してください。</>
                )}
              </dd>
              <dt>振込名義</dt>
              <dd>
                <span className="strong" data-testid="transfer-code">
                  {transfer.code}
                </span>
                ＋お名前（例：{transfer.code} ヤマダタロウ）
              </dd>
              <dt>お振込の金額</dt>
              <dd className="price" data-testid="transfer-amount">
                {yen(transfer.amount)}
              </dd>
              {expires && (
                <>
                  <dt>お振込の期限</dt>
                  <dd className="strong">{dateTimeJst(expires)}</dd>
                </>
              )}
            </dl>
            <ul className="hint">
              <li>振込名義の先頭に、必ず「{transfer.code}」を入れてください。番号が無いと、どの注文のお振込か分かりません。</li>
              <li>金額はちょうどでお振り込みください。振込手数料はご負担ください。</li>
              <li>期限までにお振込が確認できないと、注文は自動で取り消されます。</li>
              <li>入金を確かめるまで、商品は発送されません。</li>
            </ul>
          </div>
        )}

        <div className="card">
          <h2 className="section-title">ご注文</h2>
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
          {waiting && (
            <>
              <hr className="divider" />
              <PendingGroupActions groupId={group} resumeUrl={null} />
            </>
          )}
        </div>
      </main>
      <SiteFooter variant="app" />
    </div>
  );
}
