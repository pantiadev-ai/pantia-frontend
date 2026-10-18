/* 入口（index）の新着商品のカード。形は見本の .item-card（base.css）。
   ♡ のボタンを中に置くため、カードは div にし、商品名のリンクでカード全体を覆う。 */
import Link from "next/link";
import { FavoriteButton } from "@/components/ToggleButtons";
import { categoryLabel, CATEGORIES } from "@/lib/labels";
import { displayName, yen } from "@/lib/format";
import { listingImage } from "@/lib/storage";
import type { ListingCard } from "./types";

type Props = { item: ListingCard; heart: boolean; favorited: boolean; loggedIn: boolean };

/** 名前の横に出す一言（即日発送・画像付・匿名配送・手紙同封） */
function sellerNote(c: ListingCard): string {
  if (c.sameDay) return "即日発送";
  if (c.optPhoto) return "画像付";
  if (c.anonymousOk) return "匿名配送";
  if (c.optLetter) return "手紙同封";
  return "";
}

export default function HomeItemCard({ item, heart, favorited, loggedIn }: Props) {
  const img = listingImage(item.imagePath);
  const note = sellerNote(item);
  const icon = CATEGORIES.find((c) => c.value === item.category)?.icon ?? "♡";
  return (
    <div className="item-card cat-card">
      <div className="item-thumb-wrap">
        {img ? <img src={img} className="item-img" alt={item.title} loading="lazy" /> : <div className="cat-noimg item-img">{icon}</div>}
        {item.category ? <span className="item-tag">{categoryLabel(item.category)}</span> : null}
        {heart ? (
          <FavoriteButton id={item.id} initial={favorited} loggedIn={loggedIn} className="fav-btn cat-over" labels={["♥", "♥"]} ariaLabel="お気に入り" />
        ) : null}
      </div>
      <div className="item-body">
        <Link href={`/items/${item.id}`} className="item-title cat-stretch">
          {item.title}
        </Link>
        <div className="item-seller-info">
          <span>{displayName(item.sellerName)}</span>
          {note ? (
            <>
              {" ・ "}
              <span>{note}</span>
            </>
          ) : null}
        </div>
        <div className="item-foot">
          <div className="item-price">{yen(item.price)}</div>
        </div>
      </div>
    </div>
  );
}
