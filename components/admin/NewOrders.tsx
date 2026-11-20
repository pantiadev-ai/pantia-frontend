/* ダッシュボードのカード「🛍 新しい注文」。振込の入金待ち・入金済みで発送待ち・発送の準備中を新しい順に。
   数えるのはページの側（lib/admin の newOrders）。ここは並べるだけ。 */
import Link from "next/link";
import { characterBadge } from "@/components/admin/badges";
import { Badge, Card, Empty } from "@/components/admin/parts";
import { orderNo, relTime, yen } from "@/lib/format";
import { newOrderStatus, type NewOrders as NewOrdersData } from "@/lib/new-orders";

export default function NewOrders({ data }: { data: NewOrdersData }) {
  return (
    <Card
      icon="🛍"
      tone="blue"
      title="新しい注文"
      right={
        <Link href="/admin/orders" className="adm-link" style={{ whiteSpace: "nowrap" }}>
          注文管理へ →
        </Link>
      }
    >
      {data.items.length === 0 ? (
        <Empty>新しい注文はありません</Empty>
      ) : (
        <div className="activity-list">
          {data.items.map((o) => (
            <div className="activity-item" key={o.id}>
              <div className="act-icon blue" aria-hidden="true">
                🛍
              </div>
              {/* 長い商品名でも横にはみ出さず折り返す（iPhone の狭い幅） */}
              <div className="act-text" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                <Link href={`/admin/orders/${o.id}`} className="adm-link">
                  <strong>{orderNo(o.orderNo)}</strong> {o.title || "（商品名なし）"}
                </Link>
                <div className="adm-chips" style={{ marginTop: 4, alignItems: "center" }}>
                  <Badge b={newOrderStatus(o.status)} />
                  <span className="adm-price">{yen(o.total)}</span>
                  <span>売手：{o.sellerName || "（名前なし）"}</span>
                  {o.isCharacter && <Badge b={characterBadge} />}
                </div>
              </div>
              <div className="act-time">{relTime(o.createdAt)}</div>
            </div>
          ))}
        </div>
      )}
      <p className="adm-hint">
        左のメニューの数は、振込の入金待ちと、キャラの注文（入金済み・発送の準備中）の合計です（運営が動く注文）。
      </p>
    </Card>
  );
}
