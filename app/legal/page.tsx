/* 特定商取引法に基づく表記。（ ）の所は運営会社の情報が決まったら入れる（コードの中の PLACEHOLDER を直す） */
import type { Metadata } from "next";
import Link from "next/link";
import { Hero, Section, StaticShell, Table } from "@/components/static/StaticParts";
import { TERMS_UPDATED, payLimitText, payMethods } from "@/components/static/facts";
import { yen } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表記",
  description: `${SITE_NAME}の特定商取引法に基づく表記です。`,
};

const TOC = [
  { id: "l1", label: "1. 運営者の情報" },
  { id: "l2", label: "2. 代金と支払い" },
  { id: "l3", label: "3. 引き渡し・返品" },
];

/** 運営会社の情報が決まるまでの仮の表示。赤字で出す */
function Fill({ children }: { children: string }) {
  return <span className="pt-fill">（{children}）</span>;
}

export default async function LegalPage() {
  const s = await getSettings();
  const feePct = `${Math.round(s.feeRate * 1000) / 10}%`;
  const methods = payMethods()
    .map((m) => m.name)
    .join("、");
  const payLimit = payLimitText();

  return (
    <StaticShell toc={TOC} updated={TERMS_UPDATED}>
      <Hero icon="🏢" title="特定商取引法に基づく表記" updated={`最終更新：${TERMS_UPDATED}`}>
        {SITE_NAME}は、出品者と購入者をつなぐ個人間取引の場です。
        <br />
        各商品の販売者は、それぞれの出品者です。運営会社は、取引の場とサービス手数料・匿名配送にかかわる役務を提供します。
      </Hero>

      <Section id="l1" num={1} icon="🏢" title="運営者の情報">
        <Table
          head={["項目", "内容"]}
          rows={[
            ["サービス名", SITE_NAME],
            ["運営会社", <Fill key="c">運営会社名</Fill>],
            ["運営責任者", <Fill key="r">運営責任者の氏名</Fill>],
            ["所在地", <Fill key="a">所在地</Fill>],
            ["電話番号", <><Fill>電話番号</Fill>（お問い合わせは、なるべくフォームからお願いします）</>],
            ["メールアドレス", <Fill key="m">メールアドレス</Fill>],
            ["お問い合わせ", <><Link href="/contact">お問い合わせフォーム</Link>（対応時間：<Fill>対応時間</Fill>）</>],
          ]}
        />
      </Section>

      <Section id="l2" num={2} icon="💴" title="代金と支払い">
        <Table
          head={["項目", "内容"]}
          rows={[
            ["販売価格", "各商品ページに表示した金額（出品者が決めます）"],
            [
              "商品代金以外の料金",
              `オプションを選んだ場合のみ：着用日数の延長 1日${yen(s.extendFeePerDay)}、動画 ${yen(s.videoFee)}、匿名配送 ${yen(s.anonymousFee)}。送料は商品代金に含みます。インターネットの通信料はお客さまのご負担です`,
            ],
            ["支払い方法", methods || "ただいま準備中です"],
            ["支払いの時期", payLimit ? `注文のときにお支払いください（期限：${payLimit}）` : "注文のときにお支払いください"],
            ["出品者の手数料", `取引が完了したときに、売上からサービス手数料 ${feePct} を差し引きます。振込の申請は ${yen(s.minPayout)} から`],
          ]}
        />
      </Section>

      <Section id="l3" num={3} icon="📦" title="引き渡し・返品">
        <Table
          head={["項目", "内容"]}
          rows={[
            ["引き渡しの時期", "お支払いを確かめたあと、各商品ページに記載の発送目安に従って出品者が発送します"],
            [
              "返品・キャンセル",
              <>
                商品の性質上、お支払い後の購入者都合による返品・キャンセルはお受けできません。商品説明と大きく異なる・届かないなどの場合は
                <Link href="/contact">お問い合わせ</Link>ください。詳しくは<Link href="/terms#s9">利用規約 9</Link>をご覧ください
              </>,
            ],
            ["動作環境", "最新版の Safari・Chrome・Edge・Firefox"],
            ["ご利用の条件", "18歳以上で、本人確認が済んだ方に限ります"],
          ]}
        />
      </Section>
    </StaticShell>
  );
}
