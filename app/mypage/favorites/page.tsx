/* お気に入りの商品の一覧（本人だけが見られる） */
import type { Metadata } from "next";
import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import MypageShell from "@/components/mypage/MypageShell";
import FavoriteGrid from "@/components/mypage/FavoriteGrid";
import { getFavoriteListings } from "@/components/mypage/data";

export const metadata: Metadata = { title: "お気に入り", robots: { index: false, follow: false } };

const LIMIT = 120;

export default async function FavoritesPage() {
  const viewer = await requireViewer("/mypage/favorites");
  const items = await getFavoriteListings(viewer.id, LIMIT);

  return (
    <MypageShell active="favorites">
      <div className="mp-section-head">
        <h1 className="mp-section-title">
          <span className="icon-pill">♡</span> お気に入り
        </h1>
      </div>
      {items.length === 0 ? (
        <div className="mp-empty">
          お気に入りに入れた商品は、まだありません。
          <br />
          <Link href="/items">商品を探す →</Link>
        </div>
      ) : (
        <>
          <FavoriteGrid items={items} />
          {items.length >= LIMIT && <p className="mp-hint">新しく入れた順に {LIMIT} 件まで出しています。</p>}
        </>
      )}
    </MypageShell>
  );
}
