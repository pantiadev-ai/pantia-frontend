/* 商品のカード（items_list・seller_profile の .item-card）。
   カードの中にボタン（♡）を置くため、カード全体は div にし、商品名のリンクの ::after でカード全体を覆う。 */
import Link from "next/link";
import { FavoriteButton } from "@/components/ToggleButtons";
import { categoryLabel, CATEGORIES } from "@/lib/labels";
import { displayName, yen } from "@/lib/format";
import { listingImage } from "@/lib/storage";
import { isRecent, itemBadge } from "./card-helpers";
import type { ListingCard } from "./types";

type Props = {
  item: ListingCard;
  /** ♡ を出すか（自分の出品には出さない） */
  heart: boolean;
  favorited: boolean;
  loggedIn: boolean;
  /** 出品者の名前を出すか（出品者ページの中では出さない） */
  showSeller?: boolean;
};

export default function ItemCard({ item, heart, favorited, loggedIn, showSeller = true }: Props) {
  const img = listingImage(item.imagePath);
  const badge = item.soldOut ? "SOLD" : itemBadge(item);
  const icon = CATEGORIES.find((c) => c.value === item.category)?.icon ?? "♡";
  return (
    <div className={`item-card cat-card${item.soldOut ? " cat-soldout" : ""}`}>
      <div className="item-thumb">
        {img ? <img src={img} alt={item.title} className="item-img" loading="lazy" /> : <div className="cat-noimg">{icon}</div>}
        {item.category ? <div className="item-tag">{categoryLabel(item.category)}</div> : null}
        {heart ? (
          <FavoriteButton
            id={item.id}
            initial={favorited}
            loggedIn={loggedIn}
            className="item-heart cat-over"
            labels={["♡", "♥"]}
            ariaLabel="お気に入り"
          />
        ) : null}
        {!item.soldOut && isRecent(item.publishedAt, 3) ? <div className="item-new">NEW</div> : null}
        {item.followersOnly ? <div className="cat-fo">フォロワー限定</div> : null}
      </div>
      <div className="item-info">
        <Link href={`/items/${item.id}`} className="item-name cat-stretch">
          {item.title}
        </Link>
        {showSeller ? (
          <div className="item-seller">
            {item.sellerOnline ? <div className="item-seller-dot" /> : null} {displayName(item.sellerName)}
          </div>
        ) : null}
        <div className="item-footer">
          <div className="item-price">{yen(item.price)}</div>
          {badge ? <div className="item-badge">{badge}</div> : null}
        </div>
      </div>
    </div>
  );
}
