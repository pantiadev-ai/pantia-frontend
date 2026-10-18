/* モデレーション（見本の panel-moderation）。自動の見張りの設定・今月の数・保留になった投稿の公開／非表示。
   「非表示にしたもの」から公開に戻すこともできる。チャットの画像は期限つき URL（60分）で出す。 */
import type { Metadata } from "next";
import Link from "next/link";
import ActionButton from "@/components/admin/ActionButton";
import AdminShell from "@/components/admin/AdminShell";
import { n, obj } from "@/components/admin/json";
import { Card, Empty, Initial, Pager, Tabs, hrefOf } from "@/components/admin/parts";
import { nicknamesOf, pageOf, param, pick, rangeOf, requireAdminPage } from "@/lib/admin";
import { dateTimeJst, num, stars } from "@/lib/format";
import { postImage } from "@/lib/storage";
import { signedUrls } from "@/lib/storage-server";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "モデレーション" };

const TYPES = ["post", "comment", "message", "review"] as const;
type ModType = (typeof TYPES)[number];
const TYPE_LABEL: Record<ModType, string> = { post: "つぶやき", comment: "コメント", message: "メッセージ", review: "レビュー" };

type Item = {
  id: string;
  author: string | null;
  title: string | null;
  body: string;
  images: string[];
  at: string;
  link: string | null;
  status: string;
};

export default async function AdminModerationPage({ searchParams }: PageProps<"/admin/moderation">) {
  const me = await requireAdminPage();
  const sp = await searchParams;
  const view = pick(param(sp, "view", 8), ["held", "hidden"] as const, "held");
  const type = pick(param(sp, "type", 10), view === "held" ? (["post", "comment", "message"] as const) : TYPES, "post");
  const page = pageOf(sp);
  const [from, to] = rangeOf(page);

  const service = createServiceClient();
  const head = { count: "exact" as const, head: true };
  const [dash, settings, heldPosts, heldComments, heldMessages] = await Promise.all([
    service.rpc("admin_dashboard", { p_admin: me.id, p_months: 1 }),
    service.from("site_settings").select("mod_spam_filter").limit(1).maybeSingle(),
    service.from("posts").select("id", head).eq("status", "held"),
    service.from("post_comments").select("id", head).eq("status", "held"),
    service.from("messages").select("id", head).eq("status", "held"),
  ]);
  if (dash.error) console.error("[admin] dashboard", dash.error.message);
  const stats = obj(obj(dash.data).moderation_month);
  const heldCount: Record<ModType, number> = { post: heldPosts.count ?? 0, comment: heldComments.count ?? 0, message: heldMessages.count ?? 0, review: 0 };
  const heldTotal = heldCount.post + heldCount.comment + heldCount.message;

  // 選んだ種類の一覧を読む（列は1つずつ選ぶ）
  let items: Item[] = [];
  let total = 0;
  let loadError = false;
  if (type === "post") {
    const r = await service.from("posts").select("id, author_id, body, image_paths, status, created_at", { count: "exact" }).eq("status", view).order("created_at", { ascending: view === "held" }).range(from, to);
    loadError = !!r.error;
    total = r.count ?? 0;
    items = (r.data ?? []).map((x) => ({ id: x.id, author: x.author_id, title: null, body: x.body, images: (x.image_paths ?? []).map((p) => postImage(p)).filter((u): u is string => !!u), at: x.created_at, link: `/tweets/${x.id}`, status: x.status }));
  } else if (type === "comment") {
    const r = await service.from("post_comments").select("id, post_id, author_id, body, status, created_at", { count: "exact" }).eq("status", view).order("created_at", { ascending: view === "held" }).range(from, to);
    loadError = !!r.error;
    total = r.count ?? 0;
    items = (r.data ?? []).map((x) => ({ id: x.id, author: x.author_id, title: null, body: x.body, images: [], at: x.created_at, link: `/tweets/${x.post_id}`, status: x.status }));
  } else if (type === "message") {
    const r = await service
      .from("messages")
      .select("id, sender_id, kind, body, image_paths, status, created_at", { count: "exact" })
      .eq("status", view)
      .not("kind", "in", "(system,shipping)")
      .order("created_at", { ascending: view === "held" })
      .range(from, to);
    loadError = !!r.error;
    total = r.count ?? 0;
    const rows = r.data ?? [];
    const signed = await signedUrls(
      "chat-images",
      rows.flatMap((x) => x.image_paths ?? []),
    );
    items = rows.map((x) => ({ id: x.id, author: x.sender_id, title: null, body: x.body, images: (x.image_paths ?? []).map((p) => signed[p]).filter((u): u is string => !!u), at: x.created_at, link: null, status: x.status }));
  } else {
    const r = await service.from("reviews").select("id, order_id, buyer_id, rating, title, body, status, created_at", { count: "exact" }).eq("status", view).order("created_at", { ascending: false }).range(from, to);
    loadError = !!r.error;
    total = r.count ?? 0;
    items = (r.data ?? []).map((x) => ({ id: x.id, author: x.buyer_id, title: `${stars(x.rating)} ${x.title}`.trim(), body: x.body, images: [], at: x.created_at, link: `/admin/orders/${x.order_id}`, status: x.status }));
  }
  if (loadError) console.error("[admin] moderation list", type, view);
  const names = await nicknamesOf(
    service,
    items.map((i) => i.author),
  );

  const typeTabs = (view === "held" ? (["post", "comment", "message"] as const) : TYPES).map((t) => ({
    key: t,
    label: view === "held" && heldCount[t] ? `${TYPE_LABEL[t]}（${num(heldCount[t])}）` : TYPE_LABEL[t],
    href: hrefOf("/admin/moderation", { view: view === "held" ? "" : view, type: t === "post" ? "" : t }),
  }));

  return (
    <AdminShell active="moderation" title="モデレーション">
      <div className="dual-grid">
        <Card icon="🛡" title="自動モデレーション設定">
          <div>
            <div className="adm-row">
              <div>
                <div className="adm-row-title" id="mod-spam">
                  スパムフィルター
                </div>
                <div className="adm-row-note">
                  不審な投稿・メッセージを自動保留（<Link href="/admin/settings" className="adm-link">サイト設定</Link>で切り替え）
                </div>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" checked={!!settings.data?.mod_spam_filter} disabled aria-labelledby="mod-spam" readOnly />
                <span className="toggle-slider" />
              </label>
            </div>
            <div className="adm-row">
              <div>
                <div className="adm-row-title" id="mod-exif">
                  EXIF自動削除
                </div>
                <div className="adm-row-note">位置情報を画像から自動削除（常に有効・切れません）</div>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" checked disabled aria-labelledby="mod-exif" readOnly />
                <span className="toggle-slider" />
              </label>
            </div>
            <div className="adm-row">
              <div>
                <div className="adm-row-title" id="mod-age">
                  18歳未満自動ブロック
                </div>
                <div className="adm-row-note">KYCで未成年確認時に即時停止（常に有効・切れません）</div>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" checked disabled aria-labelledby="mod-age" readOnly />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>
        </Card>

        <Card icon="📊" tone="yellow" title="今月のモデレーション統計">
          <div className="adm-statline">
            <span>🚫 自動検出・保留</span>
            <b style={{ color: "var(--yellow2)" }}>{num(n(stats.held))}件</b>
          </div>
          <div className="adm-statline">
            <span>✅ 手動承認</span>
            <b style={{ color: "var(--green2)" }}>{num(n(stats.approved))}件</b>
          </div>
          <div className="adm-statline">
            <span>❌ 非表示・非公開</span>
            <b style={{ color: "var(--red2)" }}>{num(n(stats.hidden))}件</b>
          </div>
          <div className="adm-statline">
            <span>👤 アカウント停止</span>
            <b style={{ color: "var(--red2)" }}>{num(n(stats.suspended))}件</b>
          </div>
        </Card>
      </div>

      <div className="table-card">
        <div className="table-toolbar">
          <Tabs
            active={view}
            items={[
              { key: "held", label: `保留中（${num(heldTotal)}）`, href: "/admin/moderation" },
              { key: "hidden", label: "非表示にしたもの", href: hrefOf("/admin/moderation", { view: "hidden" }) },
            ]}
          />
          <div style={{ marginLeft: "auto" }}>
            <Tabs active={type} items={typeTabs} />
          </div>
        </div>
        {loadError ? (
          <Empty>一覧を読めませんでした。時間をおいて読み込み直してください。</Empty>
        ) : items.length === 0 ? (
          <Empty>{view === "held" ? `保留中の${TYPE_LABEL[type]}はありません。` : `非表示にした${TYPE_LABEL[type]}はありません。`}</Empty>
        ) : (
          <div className="adm-scroll">
            <table>
              <thead>
                <tr>
                  <th>投稿者</th>
                  <th>内容</th>
                  <th>日時</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const name = it.author ? (names.get(it.author) ?? "退会したユーザー") : "—";
                  return (
                    <tr key={it.id}>
                      <td>
                        <Initial name={name} />
                        {it.author ? (
                          <Link href={`/admin/users/${it.author}`} className="td-name adm-link">
                            {name}
                          </Link>
                        ) : (
                          <span className="td-name">{name}</span>
                        )}
                      </td>
                      <td style={{ maxWidth: 420 }}>
                        {it.title && <div className="adm-row-title">{it.title}</div>}
                        <div className="adm-pre">{it.body || <span className="adm-muted">（文なし）</span>}</div>
                        {it.images.length > 0 && (
                          <div className="adm-docs">
                            {it.images.map((src) => (
                              <a key={src} href={src} target="_blank" rel="noopener noreferrer">
                                <img src={src} alt="添付の画像" loading="lazy" referrerPolicy="no-referrer" />
                              </a>
                            ))}
                          </div>
                        )}
                        {it.link && (
                          <Link href={it.link} className="adm-link adm-hint">
                            {type === "review" ? "注文を見る →" : "つぶやきを開く →"}
                          </Link>
                        )}
                      </td>
                      <td className="adm-muted">{dateTimeJst(it.at)}</td>
                      <td>
                        <div className="adm-actions">
                          <ActionButton
                            op="mod.approve"
                            id={it.id}
                            sub={type}
                            label="公開"
                            className="approve"
                            title={`この${TYPE_LABEL[type]}を公開しますか？`}
                            body={view === "held" ? "問題がないので、ほかの人にも見えるようにします。" : "非表示をやめて、また見えるようにします。"}
                            confirmLabel="公開する"
                          />
                          {view === "held" && (
                            <ActionButton
                              op="mod.hide"
                              id={it.id}
                              sub={type}
                              label="非表示"
                              className="reject"
                              title={`この${TYPE_LABEL[type]}を非表示にしますか？`}
                              body="ほかの人からは見えなくなります。あとで「非表示にしたもの」から戻せます。"
                              confirmLabel="非表示にする"
                              danger
                            />
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
        <Pager base="/admin/moderation" q={{ view: view === "held" ? "" : view, type: type === "post" ? "" : type }} page={page} total={total} />
      </div>
    </AdminShell>
  );
}
