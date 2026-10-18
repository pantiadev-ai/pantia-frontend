/* お気に入りの商品のカード（マイページの先頭と /mypage/favorites で使う） */
import Link from "next/link";
import { FavoriteButton } from "@/components/ToggleButtons";
import { displayName, yen } from "@/lib/format";
import { categoryLabel } from "@/lib/labels";
import { listingImage } from "@/lib/storage";
import type { FavoriteCard } from "./data";

export default function FavoriteGrid({ items }: { items: FavoriteCard[] }) {
  return (
    <div className="mp-card-grid">
      {items.map((it) => {
        const img = listingImage(it.imagePath);
        const meta = [displayName(it.sellerName), categoryLabel(it.category), it.wornDays ? `${it.wornDays}日着用` : ""]
          .filter(Boolean)
          .join("・");
        return (
          <div className="mp-card" key={it.id}>
            <Link href={`/items/${it.id}`} className="mp-card-img" aria-label={it.title || "商品"}>
              {img ? <img src={img} alt="" loading="lazy" /> : <div className="mp-noimg">♡</div>}
            </Link>
            <div className="mp-card-body">
              <Link href={`/items/${it.id}`} className="mp-card-title">
                {it.title || "（タイトルなし）"}
              </Link>
              <div className="mp-card-meta">{meta}</div>
              <div className="mp-card-foot">
                <span className="mp-card-price">{it.status === "sold" ? "売り切れ" : yen(it.price)}</span>
                <FavoriteButton
                  id={it.id}
                  initial
                  loggedIn
                  className="mp-fav-btn"
                  activeClassName="active"
                  labels={["♡ 入れる", "♥ 登録中"]}
                  ariaLabel="お気に入り"
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
