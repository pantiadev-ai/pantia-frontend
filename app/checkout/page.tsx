/* /checkout?items=<出品id,…> 購入の手続き（見本なし。pg-app の型）。
   選んだ商品はカートから読み直す（画面の値段は使わない）。買えない物が混じっていればカートへ戻す。 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import "@/styles/app.css";
import CheckoutForm, { type MethodChoice } from "@/components/commerce/CheckoutForm";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { availableMethods } from "@/lib/adapters/payment";
import { requireViewer } from "@/lib/auth";
import { loadCart, MAX_PER_CHECKOUT, optionLabels, savedAddress } from "@/lib/commerce";
import { yen } from "@/lib/format";
import { isUuid } from "@/lib/search";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "購入手続き", robots: { index: false } };

const METHOD_TEXT: Record<MethodChoice["value"], Omit<MethodChoice, "value">> = {
  card: { label: "クレジットカード", note: "Stripe の画面で入力します。30分以内にお支払いください。" },
  bank: { label: "銀行振込", note: "振込先の口座をお知らせします。72時間以内にお振り込みください（振込手数料はご負担ください）。" },
  paypay: { label: "PayPay", note: "PayPay の画面でお支払いください。30分以内にお支払いください。" },
  mock: { label: "テスト決済", note: "試験用です。本物のお金は動きません（本番では使えません）。" },
};

export default async function CheckoutPage({ searchParams }: PageProps<"/checkout">) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.items) ? sp.items[0] : sp.items;
  const ids = [...new Set((raw ?? "").split(",").filter(isUuid))].slice(0, MAX_PER_CHECKOUT);
  const viewer = await requireViewer(`/checkout${ids.length ? `?items=${ids.join(",")}` : ""}`);
  if (ids.length === 0) redirect("/cart");

  const [cart, settings, address] = await Promise.all([loadCart(viewer.id), getSettings(), savedAddress(viewer.id)]);
  const lines = cart.filter((l) => ids.includes(l.listingId));
  // カートから消えた・買えなくなった物があれば、カートで確かめてもらう
  if (lines.length !== ids.length || lines.some((l) => l.problem || !l.quote)) redirect("/cart");

  const total = lines.reduce((s, l) => s + (l.quote?.total ?? 0), 0);
  const canBuy = viewer.role === "buyer" && viewer.kycStatus === "approved";
  const methods: MethodChoice[] = availableMethods().map((m) => ({ value: m, ...METHOD_TEXT[m] }));
  const anonymous = lines.some((l) => l.options.anonymous);

  return (
    <div className="pg-app">
      <SiteHeader variant="app" />
      <main className="app-main">
        <nav className="breadcrumb" aria-label="パンくず">
          <Link href="/">ホーム</Link>›<Link href="/cart">カート</Link>›<span>購入手続き</span>
        </nav>
        <h1 className="page-title">購入手続き</h1>
        <p className="page-sub">お届け先とお支払い方法を選んで、注文を確定してください。</p>
        {settings.maintenance && <p className="notice warn">ただいまメンテナンス中のため、購入を受け付けていません。</p>}
        {!canBuy && (
          <p className="notice warn">
            購入は、本人確認（18歳以上の確認）が済んだ購入者のアカウントでできます。<Link href="/kyc">本人確認へ</Link>
          </p>
        )}
        <div className="grid-side">
          <CheckoutForm listingIds={ids} methods={canBuy ? methods : []} initialAddress={address} closed={settings.maintenance || !canBuy} />
          <aside className="card">
            <h2 className="section-title">ご注文の内容</h2>
            <div className="stack">
              {lines.map((l) => (
                <div key={l.listingId}>
                  <div className="strong ellipsis">{l.title}</div>
                  <div className="muted">
                    {l.sellerName}
                    {optionLabels(l.options).length > 0 && `　${optionLabels(l.options).join("・")}`}
                  </div>
                  <div className="row between">
                    <span className="sub">
                      商品 {yen(l.quote!.basePrice)}
                      {l.quote!.wornSurcharge > 0 && ` ＋ 着用延長 ${yen(l.quote!.wornSurcharge)}`}
                      {l.quote!.videoFee > 0 && ` ＋ 動画 ${yen(l.quote!.videoFee)}`}
                      {l.quote!.anonymousFee > 0 && ` ＋ 匿名配送 ${yen(l.quote!.anonymousFee)}`}
                    </span>
                    <span className="strong">{yen(l.quote!.total)}</span>
                  </div>
                </div>
              ))}
            </div>
            <hr className="divider" />
            <div className="row between">
              <span className="strong">お支払い合計（送料・税込）</span>
              <span className="price">{yen(total)}</span>
            </div>
            {anonymous && (
              <p className="hint">匿名配送の商品は、運営の転送先を経由してお届けします。出品者にお名前・ご住所は伝わりません。</p>
            )}
            <p className="hint">お支払いの期限までに払われなかった注文は、自動で取り消されます。</p>
          </aside>
        </div>
      </main>
      <SiteFooter variant="app" />
    </div>
  );
}
