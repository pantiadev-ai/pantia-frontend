/* ヘルプ（よくある質問）。答えの数は設定・環境変数から取る */
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Hero, Section, StaticShell } from "@/components/static/StaticParts";
import { KYC_DOCS_TEXT, kycMethodText, kycStorageText, payLimitText, payMethods } from "@/components/static/facts";
import { yen } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "ヘルプ",
  description: `${SITE_NAME}のよくある質問。出品・購入・本人確認・発送・匿名配送・振込・退会について。`,
};

const TOC = [
  { id: "h1", label: "1. はじめての方" },
  { id: "h2", label: "2. 本人確認" },
  { id: "h3", label: "3. 出品" },
  { id: "h4", label: "4. 購入・支払い" },
  { id: "h5", label: "5. メッセージ" },
  { id: "h6", label: "6. 発送・受け取り" },
  { id: "h7", label: "7. 匿名配送" },
  { id: "h8", label: "8. 売上・振込" },
  { id: "h9", label: "9. アカウント・退会" },
  { id: "h10", label: "10. 困ったときは" },
];

function Q({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details>
      <summary>{q}</summary>
      <div className="pt-faq-a">{children}</div>
    </details>
  );
}

export default async function HelpPage() {
  const s = await getSettings();
  const feePct = `${Math.round(s.feeRate * 1000) / 10}%`;
  const methods = payMethods()
    .map((m) => m.name)
    .join("・");
  const payLimit = payLimitText();

  return (
    <StaticShell toc={TOC}>
      <Hero icon="💡" title="ヘルプ">
        {SITE_NAME}の使い方と、よくある質問をまとめました。
        <br />
        ここで解決しないときは、<Link href="/contact">お問い合わせ</Link>からご連絡ください。
      </Hero>

      <Section id="h1" num={1} icon="🌸" title="はじめての方">
        <div className="pt-faq">
          <Q q="どんなサービスですか？">
            <p>
              18歳以上で本人確認が済んだ方だけが使える、着用済みの下着・衣類などの個人間取引の場です。出品者（女性）が出品し、購入者（男性）が購入します。運営は取引の場を用意し、取引の当事者にはなりません。
            </p>
          </Q>
          <Q q="出品者と購入者、何ができますか？">
            <p>
              <strong>出品者</strong>：出品・つぶやき・メッセージ。<strong>購入者</strong>
              ：購入・フォロー・お気に入り・いいね・コメント・メッセージ。
            </p>
            <p>役割はあとから設定で変更を申請できます（運営が確認します）。</p>
          </Q>
          <Q q="登録にお金はかかりますか？">
            <p>無料です。出品者は、商品が売れたときにだけサービス手数料（{feePct}）がかかります。</p>
          </Q>
          <Q q="確認のメールが届きません">
            <p>迷惑メールのフォルダをご確認ください。リンクの期限が切れたときは、もう一度登録するか、ログイン画面の「パスワードを忘れた方」からやり直してください。</p>
          </Q>
        </div>
      </Section>

      <Section id="h2" num={2} icon="🪪" title="本人確認">
        <div className="pt-faq">
          <Q q="なぜ本人確認が要るのですか？">
            <p>18歳以上であることを確かめるためです。本人確認が済むまで、出品の公開・購入・メッセージ・つぶやき・コメントは使えません（フォロー・いいね・お気に入りはログインだけで使えます）。</p>
          </Q>
          <Q q="使える書類とやり方は？">
            <p>
              {KYC_DOCS_TEXT}のどれか1点です。{kycMethodText()}。<Link href="/kyc">本人確認の画面</Link>から始められます。
            </p>
          </Q>
          <Q q="送った書類の写真はどうなりますか？">
            <p>{kycStorageText()}。ほかのユーザーには一切見えません。</p>
          </Q>
          <Q q="確認が通りませんでした">
            <p>お知らせに理由が届きます。写真がぼやけている・書類の一部が切れている・有効期限が切れている、などが多い理由です。再提出できるときは、直してからもう一度送ってください。</p>
          </Q>
        </div>
      </Section>

      <Section id="h3" num={3} icon="👗" title="出品">
        <div className="pt-faq">
          <Q q="出品するには？">
            <p>
              出品者として登録し、本人確認を済ませてから、<Link href="/listings/new">出品の画面</Link>
              で写真・説明・価格を入れます。下書きは本人確認の前でも保存できますが、公開できるのは本人確認が済んでからです。
            </p>
          </Q>
          <Q q="オプションの料金は？">
            <p>
              着用日数の延長は1日{yen(s.extendFeePerDay)}、動画は{yen(s.videoFee)}、写真・手紙は無料です。匿名配送を受けると、購入者が{yen(s.anonymousFee)}を払います。
            </p>
          </Q>
          <Q q="「購入前にメッセージ必須」とは？">
            <p>この設定にした商品は、購入者がメッセージで相談し、出品者が返信してから購入できるようになります。条件を先に話し合いたいときに使います。</p>
          </Q>
          <Q q="写真の位置情報は大丈夫？">
            <p>送った写真の位置情報など（EXIF）は自動で消します。ただ、背景に部屋の様子や郵便物などが写らないよう、ご自身でも確かめてください。顔が分かる写真は出品できません。</p>
          </Q>
        </div>
      </Section>

      <Section id="h4" num={4} icon="🛍" title="購入・支払い">
        <div className="pt-faq">
          <Q q="購入するには？">
            <p>購入者として登録し、本人確認を済ませてから、商品をカートに入れて購入の手続きに進みます。</p>
          </Q>
          <Q q="支払い方法と期限は？">
            <p>{methods ? `${methods}が使えます。` : "ただいま支払い方法を準備しています。"}</p>
            {payLimit ? <p>お支払いの期限は、{payLimit}です。期限を過ぎた注文は自動で取り消され、商品はほかの人が買えるようになります。</p> : null}
          </Q>
          <Q q="支払う前の注文を取り消したい">
            <p>
              <Link href="/orders">注文の画面</Link>から、お支払い前の注文はご自身で取り消せます。
            </p>
          </Q>
          <Q q="支払ったあとにキャンセルできますか？">
            <p>
              商品の性質上、購入者のご都合によるキャンセル・返品はお受けできません。出品者が発送前に取り消した場合は、全額返金します。詳しくは
              <Link href="/terms#s9">利用規約 9</Link>をご覧ください。
            </p>
          </Q>
        </div>
      </Section>

      <Section id="h5" num={5} icon="💬" title="メッセージ">
        <div className="pt-faq">
          <Q q="出品者にメッセージを送れますか？">
            <p>本人確認が済んだ購入者は、メッセージを受け付けている出品者か、取引したことのある出品者に送れます。</p>
          </Q>
          <Q q="出品者から購入者に送れますか？">
            <p>出品者からは、自分の商品を購入（支払い済み）した購入者にだけ送れます。</p>
          </Q>
          <Q q="嫌なメッセージが来ました">
            <p>相手をブロックし、メッセージの画面から通報してください。ブロックした相手とは、メッセージのやりとりができなくなります。</p>
          </Q>
        </div>
      </Section>

      <Section id="h6" num={6} icon="📦" title="発送・受け取り">
        <div className="pt-faq">
          <Q q="発送したら何をすればいい？（出品者）">
            <p>取引の画面の「発送」から、配送会社（ヤマト運輸・佐川急便・日本郵便・その他）と追跡番号を入れてください。購入者に自動で知らせます。</p>
          </Q>
          <Q q="受け取ったら何をすればいい？（購入者）">
            <p>取引の画面で受け取りの操作をしてください。操作がなくても、発送から{s.autoCompleteDays}日たつと自動で取引が完了します。</p>
          </Q>
          <Q q="商品が届きません">
            <p>
              まず追跡番号で配送の状況を確かめてください。発送から7日以上たっても届かないときは、<Link href="/contact">お問い合わせ</Link>
              からご連絡ください。出品者に確認します。
            </p>
          </Q>
        </div>
      </Section>

      <Section id="h7" num={7} icon="🕶" title="匿名配送">
        <div className="pt-faq">
          <Q q="匿名配送とは？">
            <p>
              出品者は代行センターへ送り、代行センターから購入者へ転送します。出品者に購入者の住所は見えず、購入者に届く荷物の差出人は「代行センター」になります。料金は{yen(s.anonymousFee)}
              で、購入者が払います。
            </p>
          </Q>
          <Q q="どの商品でも使えますか？">
            <p>出品者が匿名配送を受け付けている商品だけです。商品ページに表示があります。</p>
          </Q>
          <Q q="通常配送だと何が見えますか？">
            <p>支払いから発送までの間だけ、出品者に購入者のお届け先が見えます。出品者から直接送るため、差出人の書き方によっては出品者の住所が伝わることがあります。</p>
          </Q>
        </div>
      </Section>

      <Section id="h8" num={8} icon="💰" title="売上・振込">
        <div className="pt-faq">
          <Q q="売上はいつ残高に入りますか？">
            <p>
              取引が完了したときです。商品の代金とオプション料金（着用日数の延長・動画）の合計から、サービス手数料 {feePct}
              を引いた額が入ります。匿名配送の料金は売上に入りません。
            </p>
          </Q>
          <Q q="振込を申請するには？">
            <p>
              <Link href="/payout">振込の画面</Link>で口座を登録し、残高が{yen(s.minPayout)}以上になったら申請できます（本人確認が済んでいることが条件です）。
              {s.payoutFee > 0 ? `振込1回につき手数料${yen(s.payoutFee)}を差し引きます。` : "振込手数料はかかりません。"}
            </p>
          </Q>
          <Q q="いつ振り込まれますか？">
            <p>申請のあと、運営が確認してから振り込みます。目安は数営業日です。</p>
          </Q>
        </div>
      </Section>

      <Section id="h9" num={9} icon="👤" title="アカウント・退会">
        <div className="pt-faq">
          <Q q="パスワードを忘れました">
            <p>
              <Link href="/auth/reset">パスワードの再設定</Link>から、登録したメールアドレスに再設定のリンクを送れます。
            </p>
          </Q>
          <Q q="メールアドレスやお届け先を変えたい">
            <p>
              <Link href="/settings">設定</Link>から変えられます。
            </p>
          </Q>
          <Q q="退会したい">
            <p>
              <Link href="/settings">設定</Link>から退会できます。ただし、次のどれかがあるうちは退会できません。
            </p>
            <p>・取引中の注文がある　・残高が残っている（先に振込を申請してください）　・振込の手続き中</p>
            <p>退会すると、プロフィール・出品・つぶやきはほかのユーザーから見えなくなります。</p>
          </Q>
          <Q q="アカウントが止められました">
            <p>
              <Link href="/contact">お問い合わせ</Link>の「利用停止について」からご連絡ください。
            </p>
          </Q>
        </div>
      </Section>

      <Section id="h10" num={10} icon="📧" title="困ったときは">
        <div className="prose">
          <p>
            ここで解決しないときは、<Link href="/contact">お問い合わせ</Link>からご連絡ください。規則は<Link href="/terms">利用規約</Link>、情報の扱いは
            <Link href="/privacy">プライバシーポリシー</Link>にまとめています。
          </p>
        </div>
      </Section>
    </StaticShell>
  );
}
