/* 注文の1行（見本の .order-item）。押すと /orders/<id> へ */
import Link from "next/link";
import { dateTimeJst, yen } from "@/lib/format";
import { ORDER_STATUS } from "@/lib/labels";
import { listingImage } from "@/lib/storage";
import { orderStatusClass } from "./ui";

type Props = {
  id: string;
  title: string;
  imagePath: string | null;
  price: number;
  status: string;
  createdAt: string;
  /** 相手の名前（出品者から見るときは maskName を通した物） */
  who: string;
};

export default function OrderRow({ id, title, imagePath, price, status, createdAt, who }: Props) {
  const img = listingImage(imagePath);
  return (
    <Link href={`/orders/${id}`} className="order-item">
      <div className="order-thumb">
        {img ? <img src={img} alt="" className="order-img" loading="lazy" /> : <div className="mp-noimg">♡</div>}
      </div>
      <div className="order-info">
        <div className="order-name">{title}</div>
        <div className="order-meta">
          {who} ・ {dateTimeJst(createdAt)}
        </div>
      </div>
      <div className="order-price">{yen(price)}</div>
      <div className={orderStatusClass(status)}>{ORDER_STATUS[status]?.label ?? status}</div>
    </Link>
  );
}
