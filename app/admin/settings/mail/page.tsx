/* メールの文面（サイト設定の下）。お知らせのメールの件名と書き出しを、種類ごとに書き換える（表 mail_templates）。
   お知らせの中身・リンク・署名・止め方の案内は書き換えられない（lib/mail-compose.ts が決まった形で付ける）。
   送るかどうかは、サイト設定の「メール・通知設定」で決める。 */
import type { Metadata } from "next";
import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";
import MailTemplateForm from "@/components/admin/MailTemplateForm";
import { Card, Empty } from "@/components/admin/parts";
import { requireAdminPage } from "@/lib/admin";
import { publicEnv } from "@/lib/env";
import { MAIL_TEMPLATES } from "@/lib/mail-templates";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "メールの文面" };

export default async function AdminMailTemplatesPage() {
  await requireAdminPage();
  const { data, error } = await createServiceClient().from("mail_templates").select("key, subject, body");
  if (error) console.error("[admin] mail_templates", error.message);
  const saved = new Map((data ?? []).map((r) => [r.key, r] as const));
  const siteUrl = publicEnv.siteUrl;

  return (
    <AdminShell active="settings" title="メールの文面">
      <Link href="/admin/settings" className="adm-back">
        ← サイト設定へ
      </Link>

      <Card icon="📧" tone="blue" title="書き換えられるところ">
        <ul className="adm-hint" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
          <li>書き換えられるのは、メールの件名と書き出しだけです。空のままなら既定の文面で送ります。</li>
          <li>
            差し込めるのは {"{お知らせの題}"} と {"{サイト名}"} だけです。
          </li>
          <li>金額・振込先・理由などのお知らせの中身、サイトへのリンク、署名、メールの止め方の案内は、書き出しのあとに決まった形で付きます。</li>
          <li>注文のメールには、お知らせの中身（商品名など）を載せません。振込のご案内だけは、振込先と金額を載せます。</li>
          <li>
            メールを送るかどうかは、<Link href="/admin/settings" className="adm-link">サイト設定</Link>の「メール・通知設定」で決めます。
          </li>
        </ul>
      </Card>

      {error ? (
        <Card icon="⚠️" tone="red" title="文面">
          <Empty>文面を読めませんでした。時間をおいて読み込み直してください。</Empty>
        </Card>
      ) : (
        <div className="adm-mail-list">
          {MAIL_TEMPLATES.map((def) => {
            const row = saved.get(def.key);
            return (
              <MailTemplateForm
                key={def.key}
                def={def}
                initial={{ subject: row?.subject ?? "", body: row?.body ?? "" }}
                siteUrl={siteUrl}
              />
            );
          })}
        </div>
      )}
    </AdminShell>
  );
}
