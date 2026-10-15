/* お問い合わせ。ログインしていなくても送れる（停止中の人の相談も受ける）。ログイン中ならメールアドレスを入れておく */
import type { Metadata } from "next";
import Link from "next/link";
import ContactForm from "@/components/static/ContactForm";
import { Hero, Rule, RuleList, Section, StaticShell } from "@/components/static/StaticParts";
import { getViewer } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "お問い合わせ",
  description: `${SITE_NAME}へのお問い合わせフォームです。`,
};

const TOC = [
  { id: "c1", label: "1. 送る前に" },
  { id: "c2", label: "2. お問い合わせフォーム" },
];

export default async function ContactPage() {
  const viewer = await getViewer();
  const enabled = serverEnv.contactTo !== null;

  return (
    <StaticShell toc={TOC}>
      <Hero icon="📧" title="お問い合わせ">
        取引のトラブル、本人確認、振込、アカウントのことなど、お気軽にご連絡ください。
        <br />
        内容を確認のうえ、入力いただいたメールアドレスへ順次ご返信します（目安：数営業日）。
      </Hero>

      <Section id="c1" num={1} icon="💡" title="送る前に">
        <RuleList>
          <Rule kind="note">
            よくある質問は<Link href="/help">ヘルプ</Link>にまとめています。先にご覧いただくと早く解決することがあります
          </Rule>
          <Rule kind="note">取引についてのご連絡は、注文番号（取引の画面に出ています）を書いていただくと確認が早くなります</Rule>
          <Rule kind="ng">パスワード・カード番号・本人確認の書類の写真は、絶対に送らないでください</Rule>
        </RuleList>
      </Section>

      <Section id="c2" num={2} icon="📝" title="お問い合わせフォーム">
        {enabled ? null : <div className="pt-closed-box">ただいまお問い合わせを受け付けていません。時間をおいて、もう一度お試しください。</div>}
        <ContactForm defaultEmail={viewer?.email ?? ""} enabled={enabled} />
      </Section>
    </StaticShell>
  );
}
