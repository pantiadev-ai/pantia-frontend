/* プライバシーポリシー。集める情報・使い道・残す期間は、DB の実際の作り（消す仕組みの日数）に合わせて書いている */
import type { Metadata } from "next";
import Link from "next/link";
import { Hero, Rule, RuleList, Section, StaticShell, Sub, Table } from "@/components/static/StaticParts";
import { TERMS_UPDATED, TERMS_VERSION, kycStorageText } from "@/components/static/facts";
import { serverEnv } from "@/lib/env";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "プライバシーポリシー",
  description: `${SITE_NAME}が集める情報、その使い道、残す期間、第三者への提供についての説明です。`,
};

const TOC = [
  { id: "p1", label: "1. 基本の考え方" },
  { id: "p2", label: "2. 集める情報" },
  { id: "p3", label: "3. 使い道" },
  { id: "p4", label: "4. 相手に見える情報" },
  { id: "p5", label: "5. 預け先・第三者提供" },
  { id: "p6", label: "6. 残す期間" },
  { id: "p7", label: "7. 安全のための対策" },
  { id: "p8", label: "8. クッキー" },
  { id: "p9", label: "9. 開示・訂正・削除" },
  { id: "p10", label: "10. 変更・お問い合わせ" },
];

export default function PrivacyPage() {
  const trustdock = serverEnv.kycMode === "trustdock";
  const methods = new Set(serverEnv.paymentMethods);

  const processors: [string, string][] = [
    ["Supabase", "データベース・ログイン・画像の保管"],
    ["Vercel", "サイトの配信"],
  ];
  if (methods.has("card") || methods.has("bank")) processors.push(["Stripe", "クレジットカード・銀行振込の決済"]);
  if (methods.has("paypay")) processors.push(["PayPay", "PayPay の決済"]);
  processors.push(["SendGrid", "メールの送信"]);
  if (trustdock) processors.push(["TRUSTDOCK", "本人確認（18歳以上の確認）"]);

  return (
    <StaticShell toc={TOC} updated={TERMS_UPDATED}>
      <Hero icon="🔒" title="プライバシーポリシー" updated={`最終更新：${TERMS_UPDATED} ・ バージョン ${TERMS_VERSION}`}>
        {SITE_NAME}（以下「本サービス」）が、ご利用の中で受け取る情報をどう扱うかをまとめました。
        <br />
        このサービスの性質上、「誰が使っているか」が知られないことを、いちばん大事にしています。
      </Hero>

      <Section id="p1" num={1} icon="📌" title="基本の考え方">
        <div className="prose">
          <p>本サービスは、サービスを動かすのに要る分だけの情報を受け取り、要らなくなったものは決めた期間で消します。</p>
          <p>受け取った情報を、広告のために売ったり、本人の同意なく第三者に渡したりはしません（法令にもとづく場合を除きます）。</p>
        </div>
      </Section>

      <Section id="p2" num={2} icon="🗂" title="集める情報">
        <Table
          head={["種類", "中身"]}
          rows={[
            ["アカウント", "メールアドレス、パスワード（元に戻せない形で保管）、ニックネーム、出品者か購入者か"],
            ["プロフィール", "アイコン・カバー画像、自己紹介、出品者の年齢・職業（入力した場合。プロフィールに表示されます）"],
            ["本人確認", trustdock ? "TRUSTDOCK による確認の結果、生年月日" : "書類の種類と写真、生年月日、確認の結果"],
            ["取引", "注文の内容、お届け先（氏名・住所・電話番号など）、支払いの状態（カード番号は受け取りません）"],
            ["振込先（出品者）", "銀行名・支店名・口座の種類・口座番号・名義。画面では口座番号の末尾4桁だけを表示します"],
            ["投稿・やりとり", "出品・つぶやき・コメント・メッセージ・レビュー・通報・ブロックの内容、送った画像（位置情報などは消します）"],
            ["お問い合わせ", "種類・返信先のメールアドレス・本文"],
            ["技術的な情報", "ログインの状態を保つクッキー、IP アドレスを元に戻せない形にした値（同じ所からの連続の試みを止めるため）"],
          ]}
        />
      </Section>

      <Section id="p3" num={3} icon="🎯" title="使い道">
        <RuleList>
          <Rule kind="ok">アカウントの作成・ログイン・本人確認（18歳以上であることの確認）</Rule>
          <Rule kind="ok">出品・購入・決済・配送・売上の振込など、取引を成り立たせるため</Rule>
          <Rule kind="ok">お知らせ・取引の連絡・お問い合わせへの返信</Rule>
          <Rule kind="ok">なりすまし・詐欺・規約違反・不正なアクセスを見つけて止めるため</Rule>
          <Rule kind="ok">サービスの不具合を直し、使い勝手を良くするため（個人が分からない形で集計します）</Rule>
        </RuleList>
      </Section>

      <Section id="p4" num={4} icon="👀" title="ほかのユーザーに見える情報">
        <RuleList>
          <Rule kind="note">ニックネーム・アイコン・自己紹介、出品者の年齢・職業（入力した場合）、出品・つぶやきは、公開の画面に出ます</Rule>
          <Rule kind="note">
            通常配送の注文では、支払いから発送までの間だけ、出品者に購入者のお届け先が見えます。匿名配送では、出品者には見えません（転送のため、代行センターにだけ伝えます）
          </Rule>
          <Rule kind="ok" icon="🔐">
            メールアドレス・本人確認の書類・振込先は、ほかのユーザーには見えません
          </Rule>
          <Rule kind="ok" icon="🔐">
            退会・停止したアカウントは、ほかのユーザーから見えなくなります
          </Rule>
        </RuleList>
      </Section>

      <Section id="p5" num={5} icon="🤝" title="預け先・第三者への提供">
        <div className="prose">
          <p>サービスを動かすために、次の会社に情報の処理を任せています。任せる範囲は、それぞれの仕事に要る分だけです。</p>
        </div>
        <Table head={["預け先", "任せている仕事"]} rows={processors} />
        <div className="prose">
          <p>
            これらの会社の中には、日本の外（米国など）にサーバーを置く会社があります。各社の個人情報の扱いは、それぞれの会社のプライバシーポリシーをご確認ください。
          </p>
          <p>法令にもとづく開示の求めがあった場合や、人の生命・身体・財産を守るために必要な場合を除き、本人の同意なく第三者に提供しません。</p>
        </div>
      </Section>

      <Section id="p6" num={6} icon="⏳" title="残す期間">
        <div className="prose">
          <p>決めた期間を過ぎた情報は、自動で消します。</p>
        </div>
        <Table
          head={["情報", "残す期間"]}
          rows={[
            ["本人確認の書類", trustdock ? "当サービスでは書類の写真を保管しません" : "確認を終えてから7日（その後は確認の結果だけ）"],
            ["注文のお届け先", "取引の完了・取り消しから90日"],
            ["お知らせ", "読んだものは90日、読んでいないものは1年"],
            ["カートの中身", "90日"],
            ["送ったメールの記録", "180日"],
            ["決済会社からの通知の記録", "400日"],
            ["運営の操作の記録", "2年"],
            ["連続の試みを止めるための記録", "数分〜1日ほど（決めた時間が過ぎたもの）"],
            ["アカウント・取引の記録", "退会まで。退会後も、法令で残す決まりのある取引の記録は、その期間だけ残します"],
          ]}
        />
      </Section>

      <Section id="p7" num={7} icon="🛡" title="安全のための対策">
        <RuleList>
          <Rule kind="ok" icon="🔐">
            通信はすべて暗号化しています（https）
          </Rule>
          <Rule kind="ok" icon="🔐">
            データベースは、本人と取引の相手だけが要る行を読めるように、行ごとに読み書きの権限を分けています
          </Rule>
          <Rule kind="ok" icon="🔐">
            {kycStorageText()}
          </Rule>
          <Rule kind="ok" icon="🔐">
            管理画面は、パスワードに加えて二段階の確認を使う運営者だけが入れます。運営の操作は記録します
          </Rule>
          <Rule kind="ok" icon="📸">
            送られた画像の位置情報など（EXIF）は消してから保管します
          </Rule>
        </RuleList>
      </Section>

      <Section id="p8" num={8} icon="🍪" title="クッキー">
        <div className="prose">
          <p>
            ログインの状態を保つためのクッキーと、「ログインしたままにする」を選んだかどうかを覚えるクッキーを使います。これらがないとログインできません。
          </p>
          <p>現在、広告を配信するためのクッキーは使っていません。</p>
        </div>
      </Section>

      <Section id="p9" num={9} icon="📝" title="開示・訂正・削除のご依頼">
        <div className="prose">
          <p>
            メールアドレス・パスワード・お届け先は<Link href="/settings">設定</Link>から、プロフィールは
            <Link href="/mypage/profile">プロフィールの編集</Link>
            からいつでも直せます。退会も設定からできます（取引中の注文や残高があるときは、先にそれを済ませてください）。
          </p>
          <p>
            ご自身の情報の開示・訂正・利用の停止・削除のご依頼は、<Link href="/contact">お問い合わせ</Link>
            からご連絡ください。ご本人であることを確かめたうえで、法令に従って対応します。
          </p>
        </div>
      </Section>

      <Section id="p10" num={10} icon="📧" title="変更・お問い合わせ">
        <Sub title="このポリシーの変更">
          <div className="prose">
            <p>法令の変更やサービスの変更に合わせて、このポリシーを変えることがあります。大事な変更は、サービス内のお知らせか登録メールアドレスへの通知で事前にお知らせします。</p>
          </div>
        </Sub>
        <Sub title="お問い合わせ先">
          <div className="contact-card">
            <div className="pt-contact-lines">
              <div>🏢 運営：特定商取引法に基づく表記の「運営会社」（<Link href="/legal">こちら</Link>）</div>
              <div>
                📋 お問い合わせフォーム：<Link href="/contact">こちら</Link>
              </div>
            </div>
          </div>
        </Sub>
      </Section>
    </StaticShell>
  );
}
