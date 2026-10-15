/* /cart カート（見本なし。pg-app の型）。ログインが要る。
   中身は本人の分だけ（RLS）。値段は DB の見積もり（quote_listing）。買えなくなった商品は理由を出して選べなくする。 */
import type { Metadata } from "next";
import Link from "next/link";
import "@/styles/app.css";
import CartList from "@/components/commerce/CartList";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { requireViewer } from "@/lib/auth";
import { loadCart, MAX_PER_CHECKOUT, optionLabels } from "@/lib/commerce";

export const metadata: Metadata = { title: "カート", robots: { index: false } };

export default async function CartPage() {
  const viewer = await requireViewer("/cart");
  const lines = await loadCart(viewer.id);
  const canBuy = viewer.role === "buyer" && viewer.kycStatus === "approved";

  return (
    <div className="pg-app">
      <SiteHeader variant="app" />
      <main className="app-main">
        <nav className="breadcrumb" aria-label="パンくず">
          <Link href="/">ホーム</Link>›<span>カート</span>
        </nav>
        <h1 className="page-title">カート</h1>
        <p className="page-sub">購入する商品を選んで、購入手続きへ進んでください。値段は今の値段で計算しています。</p>
        {viewer.role !== "buyer" && <p className="notice warn">出品者のアカウントでは購入できません。</p>}
        {lines.length === 0 ? (
          <div className="card empty">
            <p>カートは空です。</p>
            <Link className="btn primary" href="/items">
              商品を探す
            </Link>
          </div>
        ) : (
          <CartList
            max={MAX_PER_CHECKOUT}
            canBuy={canBuy}
            rows={lines.map((l) => ({
              listingId: l.listingId,
              title: l.title,
              imageUrl: l.imageUrl,
              sellerName: l.sellerName,
              optionText: optionLabels(l.options),
              total: l.quote?.total ?? null,
              problem: l.problem,
            }))}
          />
        )}
      </main>
      <SiteFooter variant="app" />
    </div>
  );
}
