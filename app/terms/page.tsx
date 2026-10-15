/* 利用規約（見本 terms.html の文をもとに、このサイトの実際の仕組みに合わせた） */
import type { Metadata } from "next";
import Link from "next/link";
import { Hero, Rule, RuleList, Section, StaticShell, Sub, Table } from "@/components/static/StaticParts";
import {
  KYC_DOCS_TEXT,
  TERMS_UPDATED,
  TERMS_VERSION,
  kycMethodText,
  kycStorageText,
  payLimitText,
  payMethods,
} from "@/components/static/facts";
import { yen } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "利用規約",
  description: `${SITE_NAME}の利用規約。18歳以上・本人確認済みの方だけが使えるサービスのルールです。`,
};

const TOC = [
  { id: "s1", label: "1. はじめに" },
  { id: "s2", label: "2. 年齢・本人確認" },
  { id: "s3", label: "3. アカウント" },
  { id: "s4", label: "4. 出品者のルール" },
  { id: "s5", label: "5. 購入者のルール" },
  { id: "s6", label: "6. 禁止事項" },
  { id: "s7", label: "7. 決済・手数料" },
  { id: "s8", label: "8. 配送・取引" },
  { id: "s9", label: "9. キャンセル・返品" },
  { id: "s10", label: "10. プライバシー" },
  { id: "s11", label: "11. コンテンツ" },
  { id: "s12", label: "12. アカウント停止" },
  { id: "s13", label: "13. 免責事項" },
  { id: "s14", label: "14. 規約の変更" },
  { id: "s15", label: "15. お問い合わせ" },
];

export default async function TermsPage() {
  const s = await getSettings();
  const feePct = `${Math.round(s.feeRate * 1000) / 10}%`;
  const methods = payMethods();
  const payLimit = payLimitText();

  return (
    <StaticShell toc={TOC} updated={TERMS_UPDATED}>
      <Hero icon="📋" title="利用規約" updated={`最終更新：${TERMS_UPDATED} ・ バージョン ${TERMS_VERSION}`}>
        本規約は、{SITE_NAME}（以下「本サービス」）をご利用いただく際のルールと注意事項をまとめたものです。
        <br />
        ご登録の前に必ずお読みください。登録・ご利用をもって、本規約の内容に同意いただいたものとみなします。
      </Hero>

      <div className="important-banner fade-in" role="note">
        <div className="ib-icon" aria-hidden="true">
          ⚠️
        </div>
        <div>
          <div className="ib-title">ご利用前に必ずご確認ください</div>
          <div className="ib-text">
            本サービスは<strong>18歳以上の方のみ</strong>ご利用いただけます。未成年の方のご登録・ご利用は固くお断りしています。
            また、本サービスは使用済み下着等の個人間取引を仲介するプラットフォームです。取引はユーザー間で行われ、 当サービスは取引の当事者にはなりません。
          </div>
        </div>
      </div>

      <Section id="s1" num={1} icon="📌" title="はじめに">
        <div className="prose">
          <p>
            {SITE_NAME}（以下「本サービス」または「当サービス」）は、出品者と購入者をつなぐ個人間取引プラットフォームです。本規約は本サービスのすべてのユーザー（出品者・購入者を問わず）に適用されます。
          </p>
          <p>
            本規約に加え、<Link href="/privacy">プライバシーポリシー</Link>および<Link href="/help">ヘルプ</Link>
            に書いたルールも、本規約と一体のルールとして扱います。矛盾が生じた場合は、本規約が優先されます。
          </p>
        </div>
        <Sub title="本サービスの役割">
          <RuleList>
            <Rule kind="note">
              当サービスは<strong>取引の場（プラットフォーム）</strong>を提供するものであり、取引そのものの当事者ではありません
            </Rule>
            <Rule kind="note">商品の品質・状態・真正性について、当サービスは直接の保証を行いません</Rule>
            <Rule kind="note">ユーザー間のトラブルについては、当サービスが間に入ってサポートしますが、解決を保証するものではありません</Rule>
          </RuleList>
        </Sub>
      </Section>

      <Section id="s2" num={2} icon="🔞" title="年齢・本人確認">
        <div className="age-warning">
          <div className="age-warning-icon" aria-hidden="true">
            🚫
          </div>
          <div className="age-warning-text">
            本サービスは18歳未満の方のご利用を禁止しています。年齢を偽った登録が発覚した場合、即時アカウント停止・利用停止措置を行います。
          </div>
        </div>
        <div className="prose">
          <p>
            すべてのユーザーは、登録後に本人確認（18歳以上であることの確認）を済ませる必要があります。本人確認が済むまでの間、出品の公開・購入・メッセージ・つぶやき・コメントは使えません。
          </p>
        </div>
        <RuleList>
          <Rule kind="ok">
            <strong>対応書類：</strong>
            {KYC_DOCS_TEXT}のいずれか1点
          </Rule>
          <Rule kind="ok">
            <strong>確認方法：</strong>
            {kycMethodText()}
          </Rule>
          <Rule kind="ng">
            <strong>他人名義の書類使用は禁止：</strong>発覚した場合は即時アカウント停止・利用停止
          </Rule>
          <Rule kind="ng">
            <strong>書類の改ざん・偽造は禁止：</strong>刑事上の問題となる可能性があります
          </Rule>
        </RuleList>
      </Section>

      <Section id="s3" num={3} icon="👤" title="アカウントについて">
        <div className="prose">
          <p>
            ユーザーは出品者または購入者のいずれかで登録できます。1人につき1アカウントのみ作成可能です。複数アカウントの作成・運用は禁止しています。
          </p>
        </div>
        <Table
          head={["項目", "出品者", "購入者"]}
          rows={[
            ["登録費用", "無料", "無料"],
            ["本人確認", "必須（出品の公開前）", "必須（購入前）"],
            ["主な機能", "出品・つぶやき・メッセージ", "購入・フォロー・お気に入り・いいね・コメント"],
            ["振込口座登録", "必要（売上を受け取るとき）", "不要"],
            ["役割の変更", "設定から申請（運営が確認）", "設定から申請（運営が確認）"],
          ]}
        />
        <RuleList>
          <Rule kind="ng">
            <strong>複数アカウントの作成・運用禁止</strong>（発覚した場合はすべてのアカウントを停止）
          </Rule>
          <Rule kind="ng">
            <strong>アカウントの譲渡・売買・貸し借り禁止</strong>
          </Rule>
          <Rule kind="note">
            ログイン情報は自己管理をお願いします。不正アクセス被害に気づいた場合は、すぐに<Link href="/contact">お問い合わせ</Link>からご連絡ください
          </Rule>
        </RuleList>
      </Section>

      <Section id="s4" num={4} icon="👗" title="出品者のルール">
        <div className="prose">
          <p>
            出品者は本規約を守ったうえで商品を出品してください。出品内容に虚偽がある場合や、ルール違反が確認された場合には、商品の削除・アカウント停止等の措置を行う場合があります。
          </p>
        </div>
        <Sub title="出品できるもの・できないもの">
          <RuleList>
            <Rule kind="ok">
              <strong>出品可能：</strong>自分自身が実際に着用した下着・衣類・靴下など
            </Rule>
            <Rule kind="ok">
              <strong>出品可能：</strong>本人の体液（唾液・母乳等）を含む商品（適切な梱包のうえ）
            </Rule>
            <Rule kind="ok">
              <strong>出品可能：</strong>自分が所持・使用した衣類・アクセサリー等（状態を正確に記載のうえ）
            </Rule>
            <Rule kind="ng">
              <strong>出品不可：</strong>他人の物品・本人以外が着用したもの
            </Rule>
            <Rule kind="ng">
              <strong>出品不可：</strong>顔・個人情報が特定できる画像・動画
            </Rule>
            <Rule kind="ng">
              <strong>出品不可：</strong>商品説明と実態が異なるもの（虚偽記載）
            </Rule>
            <Rule kind="ng">
              <strong>出品不可：</strong>プラットフォーム外取引（サービス外決済）を誘導する行為
            </Rule>
          </RuleList>
        </Sub>
        <Sub title="出品時の注意事項">
          <RuleList>
            <Rule kind="note" icon="📸">
              画像の位置情報など（EXIF）は当サービスが自動で消しますが、画像・背景に個人情報が映り込まないようご自身でもご確認ください
            </Rule>
            <Rule kind="note" icon="📦">
              着用日数・オプション内容は正確に記載してください。実態と異なる場合は購入者からのクレーム対象となります
            </Rule>
            <Rule kind="note" icon="⏰">
              購入後は記載の発送目安を守るよう努めてください。著しく遅れる場合は、メッセージで購入者へ連絡してください
            </Rule>
          </RuleList>
        </Sub>
      </Section>

      <Section id="s5" num={5} icon="🛍" title="購入者のルール">
        <div className="prose">
          <p>購入者は本規約を守ったうえでサービスをご利用ください。嫌がらせや不当な要求など、出品者への不適切な行為は禁止しています。</p>
        </div>
        <RuleList>
          <Rule kind="ok">購入前のオプション・着用日数の確認・相談はメッセージ機能をご利用ください</Rule>
          <Rule kind="ok">「購入前にメッセージが必要」と書かれた商品は、出品者からの返信があってから購入できます</Rule>
          <Rule kind="ok">商品受取後、問題があった場合はサポートへご連絡ください</Rule>
          <Rule kind="ng">
            <strong>禁止：</strong>出品者への個人情報（本名・住所・連絡先）の聞き出し行為
          </Rule>
          <Rule kind="ng">
            <strong>禁止：</strong>プラットフォーム外での直接取引の誘導・要求
          </Rule>
          <Rule kind="ng">
            <strong>禁止：</strong>嫌がらせ・脅迫・性的な内容を含む不適切なメッセージの送信
          </Rule>
          <Rule kind="ng">
            <strong>禁止：</strong>悪意のある根拠のない通報・クレーム
          </Rule>
          <Rule kind="ng">
            <strong>禁止：</strong>チャージバック（不正なカード取り消し申請）の乱用
          </Rule>
        </RuleList>
      </Section>

      <Section id="s6" num={6} icon="🚫" title="禁止事項">
        <div className="prose">
          <p>以下に該当する行為を禁止します。違反が確認された場合は、警告・投稿削除・アカウント停止などの措置を講じます。</p>
        </div>
        <Table
          head={["禁止行為", "内容・詳細"]}
          rows={[
            ["🔞 年齢詐称", "18歳未満であるにもかかわらず、年齢を偽って登録・利用する行為"],
            ["🔄 外部誘導", "サービス外（SNS・LINEなど）での直接取引・決済を誘導・要求する行為"],
            ["🤖 自動操作", "ボット・スクレイピングなどによる自動アクセス・データ収集"],
            ["🎭 なりすまし", "他のユーザーや著名人・芸能人などを装った行為"],
            ["📢 スパム", "同じ内容を繰り返し投稿する行為・迷惑メッセージの送信"],
            ["💻 不正アクセス", "他人のアカウントへの不正ログイン・ハッキング行為"],
            ["💸 詐欺行為", "代金受取後に商品を発送しない・虚偽の商品を送付する行為"],
            ["😡 嫌がらせ", "他のユーザーへの中傷・脅迫・しつこい連絡"],
            ["📸 無断転載", "出品者の画像・コンテンツを無断でSNS等に転載・拡散する行為"],
            ["🧪 法令抵触品", "日本国内において取引が制限または禁止されている物品の出品"],
          ]}
        />
      </Section>

      <Section id="s7" num={7} icon="💳" title="決済・手数料">
        <div className="fee-cards">
          <div className="fee-card">
            <div className="fee-num">{feePct}</div>
            <div className="fee-label">サービス手数料</div>
            <div className="fee-sub">売上から自動で差し引き</div>
          </div>
          <div className="fee-card">
            <div className="fee-num">{yen(s.minPayout)}〜</div>
            <div className="fee-label">最低振込申請額</div>
            <div className="fee-sub">運営が確認のうえ振込</div>
          </div>
        </div>
        <Sub title="対応決済方法">
          <RuleList>
            {methods.map((m) => (
              <Rule key={m.key} kind="ok" icon={m.icon}>
                <strong>{m.name}：</strong>
                {m.desc}
              </Rule>
            ))}
          </RuleList>
          {payLimit ? (
            <div className="prose" style={{ marginTop: 10 }}>
              <p>お支払いの期限は、{payLimit}です。期限までにお支払いが済まない注文は、自動で取り消されます。</p>
            </div>
          ) : null}
        </Sub>
        <Sub title="オプション料金">
          <div className="prose">
            <p>
              着用日数の延長は1日{yen(s.extendFeePerDay)}、動画は{yen(s.videoFee)}、匿名配送は{yen(s.anonymousFee)}
              です（写真・手紙は無料）。どれも商品の代金と一緒にお支払いいただきます。
            </p>
          </div>
        </Sub>
        <Sub title="売上の受け取りについて">
          <div className="prose">
            <p>
              取引が完了すると、売上（商品の代金と、着用日数の延長・動画のオプション料金の合計から、サービス手数料{feePct}を引いた額）が残高に入ります。匿名配送の料金は配送の費用にあてるため、売上には入りません。
            </p>
            <p>
              残高が{yen(s.minPayout)}以上になると振込を申請できます。申請のあと、運営が確認してご登録の口座へ振り込みます（目安：数営業日）。
              {s.payoutFee > 0
                ? `振込1回につき、振込手数料${yen(s.payoutFee)}を差し引きます。`
                : "振込手数料は当サービスが負担します。"}
            </p>
          </div>
        </Sub>
        <RuleList>
          <Rule kind="note" icon="⚠️">
            サービス外での取引・決済は保護の対象外となります。必ずプラットフォーム内でお取引ください
          </Rule>
          <Rule kind="note" icon="⚠️">
            不正なチャージバックが確認された場合、アカウント停止および請求対応を行う場合があります
          </Rule>
        </RuleList>
      </Section>

      <Section id="s8" num={8} icon="📦" title="配送・取引について">
        <Sub title="基本的な取引の流れ">
          <ol className="flow">
            {[
              ["購入者が商品を購入・決済", "支払いが済むと、出品者へ通知が届きます"],
              ["出品者が商品を梱包・発送", "記載の発送目安で発送し、取引の画面の「発送」から配送会社と追跡番号を入力してください（購入者へ自動で知らせます）"],
              ["購入者が受取確認", `商品を受け取ったら、取引の画面で受け取りの操作をお願いします（発送から${s.autoCompleteDays}日たつと自動で完了します）`],
              ["売上が出品者の残高に反映", "取引が完了すると、サービス手数料を差し引いた金額が残高に入ります"],
            ].map(([t, d], i, arr) => (
              <li className="flow-step" key={t}>
                <div className="flow-left">
                  <div className="flow-num">{i + 1}</div>
                  {i < arr.length - 1 ? <div className="flow-line" /> : null}
                </div>
                <div className="flow-content">
                  <div className="flow-title">{t}</div>
                  <div className="flow-desc">{d}</div>
                </div>
              </li>
            ))}
          </ol>
        </Sub>
        <RuleList>
          <Rule kind="ok" icon="📦">
            <strong>匿名配送オプション（推奨・{yen(s.anonymousFee)}）：</strong>
            出品者は代行センターへ送り、代行センターから購入者へ転送します。出品者に購入者の住所は見えず、購入者に届く荷物の差出人は「代行センター」になります
          </Rule>
          <Rule kind="note">
            通常配送では、支払いから発送までの間だけ、出品者に購入者のお届け先が見えます。出品者から直接発送するため、差出人の書き方によっては出品者の住所が伝わる場合があります
          </Rule>
          <Rule kind="note">配送中の紛失・破損については、配送会社への問い合わせをお願いします。当サービスが補填するものではありません</Rule>
        </RuleList>
      </Section>

      <Section id="s9" num={9} icon="🔄" title="キャンセル・返品について">
        <div className="prose">
          <p>
            商品の性質上、<strong>購入確定後のキャンセル・返品は原則お受けできません。</strong>
            購入前に商品説明・オプション内容・出品者のプロフィールを十分ご確認ください。
          </p>
        </div>
        <Table
          head={["状況", "対応"]}
          rows={[
            ["お支払い前", "購入者が取引の画面から取り消せます。お支払いの期限を過ぎた注文は自動で取り消されます"],
            ["商品説明と大きく異なる", <>
              <Link href="/contact">サポート</Link>へご連絡ください。状況を確認のうえ対応を検討します
            </>],
            ["商品が届かない（発送から7日以上）", <>
              <Link href="/contact">サポート</Link>へご連絡ください。出品者への確認・対応を行います
            </>],
            ["出品者都合でのキャンセル（発送前）", "全額返金します"],
            ["購入者都合でのキャンセル希望（支払い後）", "発送前であれば出品者の同意のもと対応を検討しますが、確約はできません"],
            ["「イメージと違った」等の理由", "商品の性質上、対応できません。購入前の十分な確認をお願いします"],
          ]}
        />
      </Section>

      <Section id="s10" num={10} icon="🔒" title="プライバシー・個人情報">
        <div className="prose">
          <p>
            当サービスは、ユーザーのプライバシー保護を最優先に考えています。集める情報・使い道・第三者への提供については
            <Link href="/privacy">プライバシーポリシー</Link>に詳しく記載しています。
          </p>
        </div>
        <RuleList>
          <Rule kind="ok" icon="🔐">
            <strong>本人確認書類：</strong>
            {kycStorageText()}
          </Rule>
          <Rule kind="ok" icon="🔐">
            <strong>決済情報：</strong>カード情報は決済会社（Stripe）が処理・管理し、当サービスはカード番号を持ちません
          </Rule>
          <Rule kind="ok" icon="🔐">
            <strong>住所情報：</strong>匿名配送を使うと、出品者・購入者のどちらにも相手の住所は見えません
          </Rule>
          <Rule kind="ok" icon="📸">
            <strong>画像の位置情報など（EXIF）</strong>は自動で消します
          </Rule>
          <Rule kind="ng">他のユーザーの個人情報をSNS等に公開・拡散することは禁止します</Rule>
          <Rule kind="ng">メッセージ内で取得した個人情報を本サービス外で利用することは禁止します</Rule>
        </RuleList>
      </Section>

      <Section id="s11" num={11} icon="📝" title="投稿コンテンツ">
        <div className="prose">
          <p>
            ユーザーが投稿した商品画像・つぶやき・コメント・レビュー等（以下「投稿コンテンツ」）の著作権は投稿者本人に帰属します。ただし、当サービスへの投稿をもって、サービス内での表示・利用に必要な範囲での使用許諾をいただいたものとします。
          </p>
        </div>
        <RuleList>
          <Rule kind="ng">他者の著作物（画像・文章等）を無断で投稿することは禁止します</Rule>
          <Rule kind="ng">第三者の権利（著作権・肖像権・プライバシー権等）を侵害するコンテンツの投稿は禁止します</Rule>
          <Rule kind="ng">他のユーザーの投稿をSNS等に無断で転載・拡散することは禁止します</Rule>
          <Rule kind="note">規約違反が疑われるコンテンツは、非表示・削除する場合があります</Rule>
        </RuleList>
      </Section>

      <Section id="s12" num={12} icon="⚠️" title="アカウント停止・利用制限">
        <div className="prose">
          <p>以下の場合に、事前通知なしにアカウントの停止・機能制限・サービス利用の禁止を行う場合があります。</p>
        </div>
        <RuleList>
          <Rule kind="ng" icon="🚫">
            本規約への重大な違反が確認された場合
          </Rule>
          <Rule kind="ng" icon="🚫">
            他のユーザーへの迷惑行為・嫌がらせ・詐欺行為
          </Rule>
          <Rule kind="ng" icon="🚫">
            複数の通報が寄せられ、調査の結果違反が認められた場合
          </Rule>
          <Rule kind="ng" icon="🚫">
            年齢詐称・本人確認書類の偽造・不正使用
          </Rule>
          <Rule kind="ng" icon="🚫">
            不正な決済・チャージバックの乱用
          </Rule>
        </RuleList>
        <div className="prose" style={{ marginTop: 14 }}>
          <p>
            停止措置に不服がある場合は、<Link href="/contact">お問い合わせ</Link>
            からご連絡ください。内容を確認のうえ、対応を検討します。ただし、すべての停止措置が解除されるとは限りません。
          </p>
        </div>
      </Section>

      <Section id="s13" num={13} icon="📋" title="免責事項">
        <div className="prose">
          <p>当サービスは取引の場を提供するものであり、以下の事項について直接の責任を負いません。</p>
        </div>
        <RuleList>
          <Rule kind="note">ユーザー間の取引に起因するトラブル・損害（商品の品質・配送遅延・不着等）</Rule>
          <Rule kind="note">システムメンテナンス・障害による一時的なサービス停止</Rule>
          <Rule kind="note">ユーザー自身の不注意による個人情報の漏洩</Rule>
          <Rule kind="note">第三者によるサービスへの不正アクセス・サイバー攻撃による被害（当サービスが相当な対策を講じていた場合）</Rule>
          <Rule kind="note">サービス変更・終了に伴うユーザーへの影響</Rule>
        </RuleList>
        <div className="prose" style={{ marginTop: 14 }}>
          <p>ただし、当サービスの故意または重大な過失による損害については、この限りではありません。</p>
        </div>
      </Section>

      <Section id="s14" num={14} icon="🔄" title="規約の変更">
        <div className="prose">
          <p>当サービスは、サービスの改善・法令の変更等に伴い、本規約を変更することがあります。</p>
          <p>
            重要な変更がある場合は、サービス内のお知らせまたは登録メールアドレスへの通知により事前にお知らせします。変更後も引き続きサービスをご利用いただいた場合は、変更後の規約に同意いただいたものとみなします。
          </p>
          <p>定期的に本ページをご確認いただくことを推奨します。</p>
        </div>
      </Section>

      <Section id="s15" num={15} icon="📧" title="お問い合わせ">
        <div className="prose">
          <p>本規約に関するご質問・ご不明点は、以下よりお問い合わせください。</p>
        </div>
        <div className="contact-card">
          <div className="pt-contact-lines">
            <div>
              📋 お問い合わせフォーム：<Link href="/contact">こちら</Link>
            </div>
            <div>
              ❓ よくある質問：<Link href="/help">ヘルプ</Link>
            </div>
            <div>🕐 返信の目安：数営業日以内（土日祝・年末年始を除く）</div>
          </div>
        </div>
        <div className="prose" style={{ marginTop: 14 }}>
          <p>いただいたご連絡には順次対応いたします。内容によってはお時間をいただく場合がございますが、ご了承ください。</p>
        </div>
      </Section>
    </StaticShell>
  );
}
