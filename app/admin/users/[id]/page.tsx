/* ユーザーの詳細（管理画面）。プロフィール・取引の数・通報・処分の記録・売上の残高と、警告／停止／退会の操作。
   メールアドレスはこの1人分だけ Auth から読む（一覧には出さない）。 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ActionButton from "@/components/admin/ActionButton";
import AdminShell from "@/components/admin/AdminShell";
import { kycAppBadge, kycBadge, orderBadge, reportBadge, reportTypeBadge, roleBadge, userStatusBadge } from "@/components/admin/badges";
import LedgerAdjustForm from "@/components/admin/LedgerAdjustForm";
import { Badge, Card, Dl, Empty } from "@/components/admin/parts";
import { nicknamesOf, requireAdminPage } from "@/lib/admin";
import { dateJst, dateTimeJst, excerpt, num, orderNo, ratingAvg, relTime, san, yen } from "@/lib/format";
import { labelOf, LEDGER_KINDS, REPORT_REASONS } from "@/lib/labels";
import { isUuid } from "@/lib/search";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "ユーザーの詳細" };

const OPEN_ORDER = ["pending", "paid", "preparing", "shipped"];

const SANCTION: Record<string, { label: string; cls: string }> = {
  warning: { label: "警告", cls: "badge-warn" },
  suspend: { label: "利用停止", cls: "badge-suspend" },
  unsuspend: { label: "停止の解除", cls: "badge-active" },
  withdraw: { label: "強制退会", cls: "badge-reject" },
};

export default async function AdminUserDetailPage({ params }: PageProps<"/admin/users/[id]">) {
  const me = await requireAdminPage();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const service = createServiceClient();
  const { data: p, error } = await service
    .from("profiles")
    .select("id, nickname, role, status, kyc_status, created_at, last_seen_at, sales_count, purchase_count, rating_sum, rating_count, follower_count, bio")
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("[admin] user", error.message);
  if (!p) notFound();

  const head = { count: "exact" as const, head: true };
  const [auth, asSeller, asBuyer, openOrders, listings, ledger, ledgerRecent, reports, sanctions, kycApps, orders] = await Promise.all([
    service.auth.admin.getUserById(id),
    service.from("orders").select("id", head).eq("seller_id", id),
    service.from("orders").select("id", head).eq("buyer_id", id),
    service.from("orders").select("id", head).or(`seller_id.eq.${id},buyer_id.eq.${id}`).in("status", OPEN_ORDER),
    service.from("listings").select("id", head).eq("seller_id", id).neq("status", "deleted"),
    // 残高は DB で足す（0009 admin_user_balance）。行を読んで足すと PostgREST の行数の上限で欠ける
    service.rpc("admin_user_balance", { p_admin: me.id, p_user: id }),
    service.from("ledger_entries").select("id, amount, kind, note, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(20),
    service
      .from("reports")
      .select("id, report_no, reporter_id, target_type, reason, detail, status, created_at")
      .or(`target_owner.eq.${id},and(target_type.eq.user,target_id.eq.${id})`)
      .order("created_at", { ascending: false })
      .limit(20),
    service.from("user_sanctions").select("id, admin_id, kind, reason, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(30),
    service.from("kyc_applications").select("id, app_no, status, reject_reason, created_at, decided_at").eq("user_id", id).order("created_at", { ascending: false }).limit(10),
    service
      .from("orders")
      .select("id, order_no, title, total, status, seller_id, buyer_id, created_at")
      .or(`seller_id.eq.${id},buyer_id.eq.${id}`)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  for (const [name, r] of Object.entries({ asSeller, asBuyer, openOrders, listings, ledger, ledgerRecent, reports, sanctions, kycApps, orders })) {
    if (r.error) console.error(`[admin] user ${name}`, r.error.message);
  }
  const user = auth.data?.user ?? null;
  const names = await nicknamesOf(service, [
    ...(sanctions.data ?? []).map((s) => s.admin_id),
    ...(reports.data ?? []).map((r) => r.reporter_id),
  ]);
  const self = me.id === id;
  const name = p.nickname || "（名前なし）";
  const bannedUntil = user?.banned_until && !Number.isNaN(Date.parse(user.banned_until)) ? user.banned_until : null;

  return (
    <AdminShell active="users" title="ユーザーの詳細">
      <Link href="/admin/users" className="adm-back">
        ← ユーザー一覧へ
      </Link>

      {p.status === "suspended" && <div className="alert-banner danger">⛔ この利用者は利用停止中です。</div>}
      {p.status === "withdrawn" && <div className="alert-banner warn">この利用者は退会済みです。</div>}

      <div className="dual-grid">
        <Card icon="👤" title={name} right={<Badge b={userStatusBadge(p.status)} />}>
          <Dl
            rows={[
              ["ユーザーID", <span className="adm-mono" key="id">{p.id}</span>],
              ["ロール", <Badge b={roleBadge(p.role)} key="role" />],
              ["本人確認", <Badge b={kycBadge(p.kyc_status)} key="kyc" />],
              ["メールアドレス", user?.email ?? (auth.error ? "読めませんでした" : "")],
              ["メールの確認", user ? (user.email_confirmed_at ? `済み（${dateJst(user.email_confirmed_at)}）` : "まだ") : ""],
              ["登録日", dateTimeJst(p.created_at)],
              ["最後のログイン", user?.last_sign_in_at ? dateTimeJst(user.last_sign_in_at) : ""],
              ["最後に見えた時刻", p.last_seen_at ? relTime(p.last_seen_at) : ""],
              ["ログインの停止期限", bannedUntil ? dateJst(bannedUntil) : ""],
              ["自己紹介", p.bio ? <span className="adm-pre" key="bio">{p.bio}</span> : ""],
            ]}
          />
        </Card>

        <Card icon="📊" tone="green" title="取引とお金">
          <div className="adm-stat-grid">
            <div className="adm-stat">
              <b>{num(asSeller.count ?? 0)}</b>
              <span>売った注文</span>
            </div>
            <div className="adm-stat">
              <b>{num(asBuyer.count ?? 0)}</b>
              <span>買った注文</span>
            </div>
            <div className="adm-stat">
              <b style={{ color: (openOrders.count ?? 0) > 0 ? "var(--yellow2)" : undefined }}>{num(openOrders.count ?? 0)}</b>
              <span>取引中</span>
            </div>
            <div className="adm-stat">
              <b>{num(listings.count ?? 0)}</b>
              <span>出品（削除を除く）</span>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <div className="adm-statline">
              <span>売上の残高</span>
              <b>
                {ledger.error ? "読めませんでした" : yen(ledger.data ?? 0)}
              </b>
            </div>
            <div className="adm-statline">
              <span>評価</span>
              <b>
                {ratingAvg(p.rating_sum, p.rating_count)}（{num(p.rating_count)}件）
              </b>
            </div>
            <div className="adm-statline">
              <span>フォロワー</span>
              <b>{num(p.follower_count)}人</b>
            </div>
          </div>
          <div className="adm-actions" style={{ marginTop: 14 }}>
            <Link href={`/admin/orders?user=${p.id}`} className="action-btn">
              注文を見る
            </Link>
            <Link href={`/admin/items?seller=${p.id}`} className="action-btn">
              出品を見る
            </Link>
            {p.role === "seller" && p.status !== "withdrawn" && (
              <Link href={`/sellers/${p.id}`} className="action-btn">
                公開ページ
              </Link>
            )}
          </div>
        </Card>
      </div>

      <Card icon="🛠" tone="red" title="この利用者への操作">
        {self ? (
          <Empty>自分自身には操作できません。</Empty>
        ) : p.status === "withdrawn" ? (
          <Empty>退会済みの利用者には操作できません。</Empty>
        ) : (
          <>
            <div className="adm-actions">
              <ActionButton
                op="user.warn"
                id={p.id}
                label="⚠️ 警告を送る"
                className="warn"
                title={`${san(name)}に警告を送りますか？`}
                body="本人に通知が届き、処分の記録に残ります。"
                reason="required"
                reasonLabel="警告の内容"
                reasonMax={500}
                confirmLabel="警告を送る"
              />
              {p.status === "active" && (
                <ActionButton
                  op="user.suspend"
                  id={p.id}
                  label="⛔ 利用を停止"
                  className="reject"
                  title={`${san(name)}の利用を停止しますか？`}
                  body="停止すると、ログインしても出品・購入・メッセージなどができなくなり、出品は表に出なくなります。"
                  reason="required"
                  reasonLabel="停止の理由"
                  reasonMax={500}
                  confirmLabel="停止する"
                  danger
                />
              )}
              {p.status === "suspended" && (
                <>
                  <ActionButton
                    op="user.unsuspend"
                    id={p.id}
                    label="停止を解除"
                    className="approve"
                    title={`${san(name)}の停止を解除しますか？`}
                    body="解除すると、もとどおり使えるようになります。"
                    reason="optional"
                    reasonLabel="解除の理由"
                    reasonMax={500}
                    confirmLabel="解除する"
                  />
                  <ActionButton
                    op="user.withdraw"
                    id={p.id}
                    label="強制退会"
                    className="reject"
                    title={`${san(name)}を強制退会させますか？`}
                    body={"元に戻せません。ログインできなくなり、プロフィール・出品・つぶやきの画像を消します。\n取引中の注文・処理中の振込申請があるとできません。売上の残高は台帳に残ります（振込は個別に対応）。"}
                    reason="required"
                    reasonLabel="退会の理由"
                    reasonMax={500}
                    confirmLabel="退会させる"
                    danger
                  />
                </>
              )}
            </div>
            <p className="adm-hint" style={{ marginTop: 10 }}>
              強制退会は、先に利用を停止してからできます。
            </p>
          </>
        )}
      </Card>

      <div className="dual-grid">
        <Card icon="📋" tone="yellow" title="処分の記録">
          {(sanctions.data ?? []).length === 0 ? (
            <Empty>処分の記録はありません。</Empty>
          ) : (
            <div>
              {(sanctions.data ?? []).map((s) => {
                const k = SANCTION[s.kind] ?? { label: s.kind, cls: "badge-muted" };
                return (
                  <div className="adm-row" key={s.id}>
                    <div>
                      <div className="adm-row-title">
                        <span className={`badge ${k.cls}`}>{k.label}</span> <span className="adm-muted">{dateTimeJst(s.created_at)}</span>
                      </div>
                      <div className="adm-row-note adm-pre">{s.reason || "（理由なし）"}</div>
                    </div>
                    <div className="adm-muted">{s.admin_id ? (names.get(s.admin_id) ?? "管理者") : "自動"}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card icon="🚩" tone="red" title="この利用者への通報" right={<Link href="/admin/reports?status=all" className="adm-link">通報の一覧 →</Link>}>
          {(reports.data ?? []).length === 0 ? (
            <Empty>通報はありません。</Empty>
          ) : (
            <div>
              {(reports.data ?? []).map((r) => (
                <div className="adm-row" key={r.id}>
                  <div>
                    <div className="adm-row-title">
                      <Badge b={reportTypeBadge(r.target_type)} /> {labelOf(REPORT_REASONS, r.reason) || r.reason}{" "}
                      <span className="adm-muted">#{r.report_no}</span>
                    </div>
                    <div className="adm-row-note">
                      {excerpt(r.detail, 80) || "（詳しい内容なし）"}
                      <span className="adm-muted">
                        {" "}
                        ・{r.reporter_id ? (names.get(r.reporter_id) ?? "退会したユーザー") : "不明"}・{dateTimeJst(r.created_at)}
                      </span>
                    </div>
                  </div>
                  <Badge b={reportBadge(r.status)} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="dual-grid">
        <Card icon="🛍" title="最近の注文" right={<Link href={`/admin/orders?user=${p.id}`} className="adm-link">すべて見る →</Link>}>
          {(orders.data ?? []).length === 0 ? (
            <Empty>注文はありません。</Empty>
          ) : (
            <div>
              {(orders.data ?? []).map((o) => (
                <div className="adm-row" key={o.id}>
                  <div>
                    <div className="adm-row-title">
                      <Link href={`/admin/orders/${o.id}`} className="adm-link">
                        {orderNo(o.order_no)}
                      </Link>{" "}
                      {excerpt(o.title, 30)}
                    </div>
                    <div className="adm-row-note">
                      {o.seller_id === id ? "売った" : "買った"}・{yen(o.total)}・{dateJst(o.created_at)}
                    </div>
                  </div>
                  <Badge b={orderBadge(o.status)} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card icon="🪪" tone="blue" title="本人確認の申請">
          {(kycApps.data ?? []).length === 0 ? (
            <Empty>申請はありません。</Empty>
          ) : (
            <div>
              {(kycApps.data ?? []).map((k) => (
                <div className="adm-row" key={k.id}>
                  <div>
                    <div className="adm-row-title">
                      <Link href={`/admin/kyc/${k.id}`} className="adm-link">
                        申請 #{k.app_no}
                      </Link>{" "}
                      <span className="adm-muted">{dateTimeJst(k.created_at)}</span>
                    </div>
                    {k.reject_reason && <div className="adm-row-note">理由: {k.reject_reason}</div>}
                  </div>
                  <Badge b={kycAppBadge(k.status)} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="dual-grid">
        <Card icon="📒" tone="green" title="売上の台帳（新しい20件）">
          {(ledgerRecent.data ?? []).length === 0 ? (
            <Empty>台帳の記録はありません。</Empty>
          ) : (
            <div>
              {(ledgerRecent.data ?? []).map((e) => (
                <div className="adm-row" key={e.id}>
                  <div>
                    <div className="adm-row-title">{LEDGER_KINDS[e.kind] ?? e.kind}</div>
                    <div className="adm-row-note">
                      {e.note ? `${excerpt(e.note, 60)}・` : ""}
                      {dateTimeJst(e.created_at)}
                    </div>
                  </div>
                  <b className={e.amount >= 0 ? "adm-ok-text" : "adm-danger-text"}>
                    {e.amount >= 0 ? "+" : "−"}
                    {yen(Math.abs(e.amount))}
                  </b>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card icon="✏️" tone="yellow" title="台帳の調整">
          {p.status === "withdrawn" ? <Empty>退会済みの利用者の台帳は調整できません。</Empty> : <LedgerAdjustForm userId={p.id} userName={name} />}
        </Card>
      </div>
    </AdminShell>
  );
}
