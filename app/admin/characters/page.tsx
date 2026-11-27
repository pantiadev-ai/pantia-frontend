/* キャラ（運営で入れた売手）の一覧。キャラはここの「キャラを新しく作る」で作るか、ユーザーの詳細で印を付け外しする。
   ここから、キャラの名前で出品する画面（/admin/characters/<id>/new）と、そのキャラの出品の一覧へ移る。
   取引（メッセージ・発送）と出品の編集は、運営がキャラでログインして行う（2026-11-18 に決めた）。 */
import type { Metadata } from "next";
import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";
import CharacterCreateForm from "@/components/admin/CharacterCreateForm";
import CharacterLinkIssuer from "@/components/admin/CharacterLinkIssuer";
import { characterBadge, kycBadge, userStatusBadge } from "@/components/admin/badges";
import { Badge, Card, Empty, FilterBar, Initial, Pager } from "@/components/admin/parts";
import { nicknamesOf, pageOf, param, rangeOf, requireAdminPage } from "@/lib/admin";
import { dateJst, excerpt } from "@/lib/format";
import { escapeLike, isUuid } from "@/lib/search";
import { getSettings } from "@/lib/settings";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "キャラ" };

export default async function AdminCharactersPage({ searchParams }: PageProps<"/admin/characters">) {
  await requireAdminPage();
  const sp = await searchParams;
  const q = param(sp, "q", 50);
  const page = pageOf(sp);
  const [from, to] = rangeOf(page);

  const service = createServiceClient();
  let query = service
    .from("character_accounts")
    .select("user_id, note, marked_by, marked_at, created_via, password_set_at, profile:profiles!character_accounts_user_id_fkey!inner(id, nickname, status, kyc_status)", {
      count: "exact",
    });
  if (q) query = isUuid(q) ? query.eq("user_id", q) : query.ilike("profile.nickname", `%${escapeLike(q)}%`);

  const [list, settings] = await Promise.all([query.order("marked_at", { ascending: false }).range(from, to), getSettings()]);
  if (list.error) console.error("[admin] characters", list.error.message);
  const rows = list.data ?? [];
  const ids = rows.map((r) => r.user_id);
  const [names, counts] = await Promise.all([nicknamesOf(service, rows.map((r) => r.marked_by)), listingCounts(service, ids)]);

  return (
    <AdminShell active="characters" title="キャラ">
      <Card icon="✨" title="キャラを新しく作る">
        <CharacterCreateForm closed={!settings.registrationOpen} />
      </Card>

      <Card icon="🎭" tone="blue" title="キャラの決まり">
        <ul className="adm-hint" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9, fontSize: 12 }}>
          <li>キャラは、運営のメールアドレスで登録した売手のアカウントです。</li>
          <li>キャラは「キャラを新しく作る」で作るか、ふつうに登録した売手をユーザーの詳細の「キャラにする」で印を付けます。</li>
          <li>代理登録で作ったアカウントも、ユーザーの詳細の「キャラにする」でキャラにできます（理由のメモが必須）。本人から頼まれて代理で登録した人には使いません。</li>
          <li>印を付けると、本人確認は省いて「確認済み」になります（アクティビティログに残ります）。</li>
          <li>ここから、キャラの名前で出品できます。管理者の名前は商品ページに出ません。</li>
          <li>メッセージ・発送・出品の編集は、キャラでログインして、ふつうの売手と同じ画面で行います。</li>
          <li>印を外しても、本人確認と出品はそのまま残ります。</li>
        </ul>
      </Card>

      <div className="table-card">
        <FilterBar action="/admin/characters" search={{ value: q, placeholder: "名前・ユーザーIDで検索" }} />
        {list.error ? (
          <Empty>一覧を読めませんでした。時間をおいて読み込み直してください。</Empty>
        ) : rows.length === 0 ? (
          <Empty>{q ? "条件に合うキャラはいません。" : "まだキャラはいません。上の「キャラを新しく作る」で作るか、ユーザーの詳細の「キャラにする」で印を付けます。"}</Empty>
        ) : (
          <div className="adm-scroll">
            <table>
              <thead>
                <tr>
                  <th>キャラ</th>
                  <th>KYC</th>
                  <th>ステータス</th>
                  <th>出品</th>
                  <th>印を付けた日</th>
                  <th>付けた運営</th>
                  <th>メモ</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const p = r.profile;
                  return (
                    <tr key={r.user_id}>
                      <td>
                        <Initial name={p.nickname} />
                        <Link href={`/admin/users/${r.user_id}`} className="td-name adm-link">
                          {p.nickname || "（名前なし）"}
                        </Link>{" "}
                        <Badge b={characterBadge} />
                      </td>
                      <td>
                        <Badge b={kycBadge(p.kyc_status)} />
                      </td>
                      <td>
                        <Badge b={userStatusBadge(p.status)} />
                      </td>
                      <td>{counts.has(r.user_id) ? `${counts.get(r.user_id)}件` : <span className="adm-muted">—</span>}</td>
                      <td className="adm-muted">{dateJst(r.marked_at)}</td>
                      <td>{names.get(r.marked_by) ?? "管理者"}</td>
                      <td className="adm-muted">{r.note ? excerpt(r.note, 30) : ""}</td>
                      <td>
                        <div className="adm-actions">
                          <Link href={`/admin/characters/${r.user_id}/new`} className="action-btn approve">
                            出品する
                          </Link>
                          <Link href={`/admin/items?seller=${r.user_id}`} className="action-btn">
                            出品を見る
                          </Link>
                          {r.created_via === "create" && !r.password_set_at && p.status === "active" && (
                            <CharacterLinkIssuer userId={r.user_id} userName={p.nickname} />
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
        <Pager base="/admin/characters" q={{ q }} page={page} total={list.count ?? 0} />
      </div>
    </AdminShell>
  );
}

/** キャラごとの出品の数（削除したものは数えない）。読めなかったキャラは数を出さない */
async function listingCounts(service: ReturnType<typeof createServiceClient>, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const results = await Promise.all(
    ids.map((id) =>
      service.from("listings").select("id", { count: "exact", head: true }).eq("seller_id", id).neq("status", "deleted"),
    ),
  );
  results.forEach((res, i) => {
    if (res.error) console.error("[admin] characters count", res.error.message);
    else out.set(ids[i], res.count ?? 0);
  });
  return out;
}
