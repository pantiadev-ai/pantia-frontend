/* 出品者のアカウントで、ほかの出品者のページ・商品のページを見たときの、押せない送るボタンと理由。
   出品者どうしの会話は DB（open_thread）が断る。ボタンごと消していたら、客先に「送るボタンが無くなった」と
   思われたので、場所を残して理由を添える（2026-11-10） */
export const SELLER_CANNOT_MESSAGE = "出品者のアカウントからは送れません（購入者のアカウントで送れます）";

type Props = {
  /** 理由の文の id（ボタンの aria-describedby に使う。ページの中で1つだけ） */
  id: string;
  className?: string;
  noteClassName?: string;
};

export default function SellerMessageDisabled({ id, className, noteClassName }: Props) {
  return (
    <>
      <button type="button" className={className} disabled aria-describedby={id}>
        ✉ メッセージを送る
      </button>
      <p id={id} className={noteClassName}>
        {SELLER_CANNOT_MESSAGE}
      </p>
    </>
  );
}
