/* 自分の出品の1行（見本 panel-items の .my-item）。/mypage と /mypage/items で使う */
import { num, yen } from "@/lib/format";
import { categoryLabel, LISTING_STATUS } from "@/lib/labels";
import { listingImage } from "@/lib/storage";
import ListingActions from "./ListingActions";

export type MyListing = {
  id: string;
  title: string;
  price: number | null;
  image_paths: string[] | null;
  status: string;
  category: string | null;
  view_count: number;
  like_count: number;
  sales_count: number;
};

/** 一覧で読む列（自分の出品なので、全部の列が読める。要る物だけ） */
export const MY_LISTING_COLUMNS = "id, title, price, image_paths, status, category, view_count, like_count, sales_count";

export default function MyItemRow({ item, kycOk }: { item: MyListing; kycOk: boolean }) {
  const img = listingImage(item.image_paths?.[0]);
  const cat = categoryLabel(item.category);
  return (
    <div className="my-item">
      <div className="my-item-thumb">
        {img ? <img src={img} alt="" className="my-img" loading="lazy" /> : <div className="mp-noimg">♡</div>}
      </div>
      <div className="my-item-info">
        <div className="my-item-name">{item.title || "（タイトル未入力の下書き）"}</div>
        <div className="my-item-meta">
          <span>👁 {num(item.view_count)}</span>
          <span>♡ {num(item.like_count)}</span>
          {item.sales_count > 0 && <span>🛍 {num(item.sales_count)}</span>}
          {cat && <span>📦 {cat}</span>}
          <span className="item-pub-toggle">
            <span className={`pub-dot${item.status === "published" ? "" : " off"}`}></span>
            {item.status === "hidden" ? "停止中" : (LISTING_STATUS[item.status] ?? item.status)}
          </span>
        </div>
      </div>
      <div className="my-item-price">{item.price != null ? yen(item.price) : "¥ ---"}</div>
      <ListingActions id={item.id} title={item.title} status={item.status} kycOk={kycOk} />
    </div>
  );
}
