"use client";
/* 商品ページの画像（大きい1枚と、押して切り替える小さい画像） */
import { useState } from "react";
import { FavoriteButton } from "@/components/ToggleButtons";

type Props = {
  /** 表示用の URL（サーバーで listingImage を通した物） */
  images: string[];
  title: string;
  categoryText: string;
  categoryIcon: string;
  /** ♡ を出すときだけ（自分の出品には出さない） */
  favorite: { listingId: string; initial: boolean; loggedIn: boolean } | null;
};

export default function Gallery({ images, title, categoryText, categoryIcon, favorite }: Props) {
  const [index, setIndex] = useState(0);
  const current = images[index] ?? images[0];
  return (
    <div className="gallery">
      <div className="main-img">
        {current ? <img src={current} alt={title} className="gallery-main-img" /> : <div className="cat-noimg">{categoryIcon}</div>}
        {categoryText ? <div className="img-badge">{categoryText}</div> : null}
        {favorite ? (
          <FavoriteButton
            id={favorite.listingId}
            initial={favorite.initial}
            loggedIn={favorite.loggedIn}
            className="img-heart"
            labels={["♡", "♥"]}
            ariaLabel="お気に入り"
          />
        ) : null}
      </div>
      {images.length > 1 ? (
        <div className="thumbs">
          {images.map((src, i) => (
            <button
              type="button"
              key={src}
              className={`thumb${i === index ? " active" : ""}`}
              aria-label={`${i + 1}枚目の画像を表示`}
              aria-pressed={i === index}
              onClick={() => setIndex(i)}
            >
              <img src={src} alt="" className="thumb-img" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
