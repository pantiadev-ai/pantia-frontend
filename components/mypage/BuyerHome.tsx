/* 購入者のマイページ。最近の注文・お気に入りの先頭・フォロー中の出品者の先頭を並べる */
import Link from "next/link";
import type { Viewer } from "@/lib/auth";
import { displayName } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getFavoriteListings, getFollowingSellers, publicNames } from "./data";
import FavoriteGrid from "./FavoriteGrid";
import FollowingList from "./FollowingList";
import OrderRow from "./OrderRow";

export default async function BuyerHome({ viewer }: { viewer: Viewer }) {
  const supabase = await createClient();
  const [ordersRes, favorites, following] = await Promise.all([
    supabase
      .from("orders")
      .select("id, title, image_path, total, status, created_at, seller_id")
      .eq("buyer_id", viewer.id)
      .order("created_at", { ascending: false })
      .limit(5),
    getFavoriteListings(viewer.id, 4),
    getFollowingSellers(viewer.id, 4),
  ]);
  if (ordersRes.error) console.error("[mypage] buyer orders", ordersRes.error.message);
  const orders = ordersRes.data ?? [];
  const sellers = await publicNames(orders.map((o) => o.seller_id));

  return (
    <>
      <div>
        <div className="mp-section-head">
          <h2 className="mp-section-title">
            <span className="icon-pill">🛍</span> 最近の注文
          </h2>
          <Link href="/orders" className="mp-more">
            全て見る →
          </Link>
        </div>
        {orders.length === 0 ? (
          <div className="mp-empty">
            まだ注文はありません。
            <br />
            <Link href="/items">商品を探す →</Link>
          </div>
        ) : (
          <div className="orders-list">
            {orders.map((o) => (
              <OrderRow
                key={o.id}
                id={o.id}
                title={o.title}
                imagePath={o.image_path}
                price={o.total}
                status={o.status}
                createdAt={o.created_at}
                who={displayName(sellers.get(o.seller_id))}
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mp-section-head">
          <h2 className="mp-section-title">
            <span className="icon-pill">♡</span> お気に入り
          </h2>
          <Link href="/mypage/favorites" className="mp-more">
            全て見る →
          </Link>
        </div>
        {favorites.length === 0 ? (
          <div className="mp-empty">お気に入りに入れた商品が、ここに出ます。</div>
        ) : (
          <FavoriteGrid items={favorites} />
        )}
      </div>

      <div>
        <div className="mp-section-head">
          <h2 className="mp-section-title">
            <span className="icon-pill">👥</span> フォロー中
          </h2>
          <Link href="/mypage/following" className="mp-more">
            全て見る →
          </Link>
        </div>
        {following.length === 0 ? (
          <div className="mp-empty">
            フォローした出品者が、ここに出ます。
            <br />
            <Link href="/sellers">出品者を探す →</Link>
          </div>
        ) : (
          <FollowingList rows={following} />
        )}
      </div>
    </>
  );
}
