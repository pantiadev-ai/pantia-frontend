/* マイページ。出品者はダッシュボード（売上・対応が要る注文・最近の出品）、購入者は最近の注文・お気に入り・フォロー中 */
import type { Metadata } from "next";
import { requireViewer } from "@/lib/auth";
import MypageShell from "@/components/mypage/MypageShell";
import SellerDashboard from "@/components/mypage/SellerDashboard";
import BuyerHome from "@/components/mypage/BuyerHome";

export const metadata: Metadata = { title: "マイページ", robots: { index: false, follow: false } };

export default async function MypagePage({ searchParams }: PageProps<"/mypage">) {
  const viewer = await requireViewer("/mypage");
  const sp = await searchParams;
  const period = sp.period === "week" || sp.period === "year" ? sp.period : "month";

  return (
    <MypageShell active="dashboard">
      {viewer.role === "seller" ? <SellerDashboard viewer={viewer} period={period} /> : <BuyerHome viewer={viewer} />}
    </MypageShell>
  );
}
