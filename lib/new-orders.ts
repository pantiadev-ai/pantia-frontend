/* 管理画面の「新しい注文」（admin_new_orders の戻り値）を画面用の形に直す。
   count はメニューの印（振込の入金待ち＋キャラの入金済み・発送準備中）、
   items はダッシュボードの一覧（振込の入金待ち＋全部の売手の入金済み・発送準備中）。 */

export type NewOrderItem = {
  id: string;
  orderNo: number;
  title: string;
  total: number;
  status: string;
  paymentMethod: string;
  createdAt: string;
  sellerId: string;
  sellerName: string;
  isCharacter: boolean;
};

export type NewOrders = { count: number; items: NewOrderItem[] };

const EMPTY: NewOrders = { count: 0, items: [] };
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** 形が違えば 0 件・空。id の無い行は落とす */
export function parseNewOrders(data: unknown): NewOrders {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ...EMPTY, items: [] };
  const r = data as Record<string, unknown>;
  const count = Number.isInteger(r.count) && (r.count as number) >= 0 ? (r.count as number) : 0;
  const rows = Array.isArray(r.items) ? r.items : [];
  const items: NewOrderItem[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    if (typeof o.id !== "string" || !o.id) continue;
    items.push({
      id: o.id,
      orderNo: num(o.order_no),
      title: str(o.title),
      total: num(o.total),
      status: str(o.status),
      paymentMethod: str(o.payment_method),
      createdAt: str(o.created_at),
      sellerId: str(o.seller_id),
      sellerName: str(o.seller_name),
      isCharacter: o.is_character === true,
    });
  }
  return { count, items };
}

const STATUS: Record<string, { cls: string; label: string }> = {
  pending: { cls: "badge-pending", label: "振込の入金待ち" },
  paid: { cls: "badge-new", label: "入金済み・発送待ち" },
  preparing: { cls: "badge-ship", label: "発送の準備中" },
};

/** 一覧の状態の印（badges.ts の BadgeInfo と同じ形） */
export function newOrderStatus(status: string): { cls: string; label: string } {
  return STATUS[status] ?? { cls: "badge-muted", label: status };
}
