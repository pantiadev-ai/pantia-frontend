/* 商品管理（見本の panel-items）。一覧・状態の絞り込み・検索と、運営による非公開／戻す。
   商品を消す操作は置かない（非公開にして残す。証拠として要るため）。 */
import type { Metadata } from "next";
import Link from "next/link";
import ActionButton from "@/components/admin/ActionButton";
import AdminShell from "@/components/admin/AdminShell";
import { listingBadge } from "@/components/admin/badges";
import { Badge, Empty, FilterBar, Pager } from "@/components/admin/parts";
import { nicknamesOf, pageOf, param, pick, rangeOf, requireAdminPage } from "@/lib/admin";
import { dateJst, num, yen } from "@/lib/format";
import { CATEGORIES, categoryLabel } from "@/lib/labels";
import { escapeLike, isUuid } from "@/lib/search";
import { listingImage } from "@/lib/storage";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "商品管理" };

const STATUSES = ["", "published", "private", "draft", "sold", "hidden", "deleted", "reported"] as const;
const CATS = ["", ...CATEGORIES.map((c) => c.value)] as const;
const CAT_ICON: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.icon]));
const ACTIVE_REPORT = ["open", "reviewing"];

export default async function AdminItemsPage({ searchParams }: PageProps<"/admin/items">) {
  await requireAdminPage();
  const sp = await searchParams;
  const q = param(sp, "q", 50);
  const status = pick(param(sp, "status", 12), STATUSES, "");
  const category = pick(param(sp, "category", 12), CATS, "");
  const sellerParam = param(sp, "seller", 36);
  const seller = isUuid(sellerParam) ? sellerParam : "";
  const page = pageOf(sp);
  const [from, to] = rangeOf(page);

  const service = createServiceClient();

  // 「通報あり」は、未対応・対応中の通報が付いた商品
  let reportedIds: string[] = [];
  if (status === "reported") {
    const { data, error } = await service
      .from("reports")
      .select("target_id")
      .eq("target_type", "listing")
      .in("status", ACTIVE_REPORT)
      .limit(1000);
    if (error) console.error("[admin] reported listings", error.message);
    reportedIds = [...new Set((data ?? []).map((r) => r.target_id).filter((x): x is string => isUuid(x)))];
  }

  let query = service
    .from("listings")
    .select("id, seller_id, title, category, price, status, image_paths, view_count, like_count, created_at", { count: "exact" });
  if (status === "reported") query = query.in("id", reportedIds.length > 0 ? reportedIds : ["00000000-0000-0000-0000-000000000000"]);
  else if (status) query = query.eq("status", status);
  if (category) query = query.eq("category", category);
  if (seller) query = query.eq("seller_id", seller);
  if (q) query = isUuid(q) ? query.eq("id", q) : query.ilike("title", `%${escapeLike(q)}%`);

  const items = await query.order("created_at", { ascending: false }).range(from, to);
  if (items.error) console.error("[admin] listings", items.error.message);
  const rows = items.data ?? [];

  const [names, flagged] = await Promise.all([
    nicknamesOf(service, [...rows.map((r) => r.seller_id), seller]),
    rows.length > 0
      ? service
          .from("reports")
          .select("target_id")
          .eq("target_type", "listing")
          .in("status", ACTIVE_REPORT)
          .in(
            "target_id",
            rows.map((r) => r.id),
          )
      : Promise.resolve({ data: [] as { target_id: string | null }[], error: null }),
  ]);
  const flaggedSet = new Set((flagged.data ?? []).map((r) => r.target_id));
  const filter = { q, status, category, seller };

  return (
    <AdminShell active="items" title="商品管理">
      {seller && (
        <div className="alert-banner warn">
          <span>
            👤 <strong>{names.get(seller) ?? "このユーザー"}</strong>さんの出品だけを表示しています。
          </span>
          <Link href={`/admin/users/${seller}`} className="adm-link" style={{ marginLeft: "auto" }}>
            ユーザーの詳細へ
          </Link>
          <Link href="/admin/items" className="adm-link">
            絞り込みを外す
          </Link>
        </div>
      )}

      <div className="table-card">
        <FilterBar
          action="/admin/items"
          keep={{ seller }}
          search={{ value: q, placeholder: "商品名・商品IDで検索" }}
          selects={[
            {
              name: "status",
              label: "状態",
              value: status,
              options: [
                { value: "", label: "全ステータス" },
                { value: "published", label: "公開中" },
                { value: "private", label: "非公開（出品者）" },
                { value: "hidden", label: "運営により非公開" },
                { value: "sold", label: "売り切れ" },
                { value: "draft", label: "下書き" },
                { value: "deleted", label: "削除済み" },
                { value: "reported", label: "通報あり" },
              ],
            },
            {
              name: "category",
              label: "カテゴリ",
              value: category,
              options: [{ value: "", label: "全カテゴリ" }, ...CATEGORIES.map((c) => ({ value: c.value, label: c.label }))],
            },
          ]}
        />
        {items.error ? (
          <Empty>一覧を読めませんでした。時間をおいて読み込み直してください。</Empty>
        ) : rows.length === 0 ? (
          <Empty>{q || status || category || seller ? "条件に合う商品はありません。" : "まだ出品はありません。"}</Empty>
        ) : (
          <div className="adm-scroll">
            <table>
              <thead>
                <tr>
                  <th>商品</th>
                  <th>出品者</th>
                  <th>カテゴリ</th>
                  <th>価格</th>
                  <th>出品日</th>
                  <th>閲覧数</th>
                  <th>ステータス</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((it) => {
                  const img = listingImage(it.image_paths?.[0]);
                  const reported = flaggedSet.has(it.id);
                  const sellerName = names.get(it.seller_id) ?? "退会したユーザー";
                  return (
                    <tr key={it.id}>
                      <td>
                        <span className="td-thumb">{img ? <img src={img} alt="" loading="lazy" referrerPolicy="no-referrer" /> : ((it.category && CAT_ICON[it.category]) || "📦")}</span>
                        <span className="td-name">{it.title || "（題名なし）"}</span>
                      </td>
                      <td>
                        <Link href={`/admin/users/${it.seller_id}`} className="adm-link">
                          {sellerName}
                        </Link>
                      </td>
                      <td>{categoryLabel(it.category) || it.category}</td>
                      <td className="adm-price">{yen(it.price)}</td>
                      <td className="adm-muted">{dateJst(it.created_at)}</td>
                      <td>{num(it.view_count)}</td>
                      <td>
                        <Badge b={listingBadge(it.status)} /> {reported && <span className="badge badge-warn">通報あり</span>}
                      </td>
                      <td>
                        <div className="adm-actions">
                          {(it.status === "published" || it.status === "private" || it.status === "sold") && (
                            <Link href={`/items/${it.id}`} className="action-btn">
                              表示
                            </Link>
                          )}
                          {reported && (
                            <Link href={`/admin/reports?type=listing&q=${it.id}`} className="action-btn warn">
                              通報
                            </Link>
                          )}
                          {it.status !== "hidden" && it.status !== "deleted" && (
                            <ActionButton
                              op="listing.hide"
                              id={it.id}
                              label="非公開"
                              className="reject"
                              title="この商品を運営の判断で非公開にしますか？"
                              body={`「${it.title}」を一覧と検索から外します。出品者には理由つきで通知が届きます。`}
                              reason="required"
                              reasonLabel="非公開にする理由"
                              confirmLabel="非公開にする"
                              danger
                            />
                          )}
                          {it.status === "hidden" && (
                            <>
                              <ActionButton
                                op="listing.publish"
                                id={it.id}
                                label="公開に戻す"
                                className="approve"
                                title="この商品を公開に戻しますか？"
                                body={`「${it.title}」をまた一覧と検索に出します。`}
                                reason="optional"
                                reasonLabel="戻す理由"
                                confirmLabel="公開に戻す"
                              />
                              <ActionButton
                                op="listing.private"
                                id={it.id}
                                label="出品者の非公開に"
                                title="出品者の非公開に戻しますか？"
                                body={`「${it.title}」を、出品者が自分で公開し直せる状態（非公開）にします。`}
                                reason="optional"
                                reasonLabel="理由"
                                confirmLabel="非公開に戻す"
                              />
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager base="/admin/items" q={filter} page={page} total={items.count ?? 0} />
      </div>
    </AdminShell>
  );
}
