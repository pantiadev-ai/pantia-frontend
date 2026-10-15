/* 商品・出品者の表示に使う形。サーバーとブラウザの両方から読む（ここには型だけを置く） */

/** 一覧のカード1枚（search_listings・weekly_ranking の1件を読みやすい名前にした物） */
export type ListingCard = {
  id: string;
  title: string;
  category: string;
  price: number;
  wornDays: number;
  imagePath: string | null;
  sameDay: boolean;
  optPhoto: boolean;
  optLetter: boolean;
  anonymousOk: boolean;
  preMessageOk: boolean;
  coolShipping: boolean;
  followersOnly: boolean;
  likeCount: number;
  publishedAt: string | null;
  sellerId: string;
  sellerName: string | null;
  sellerAvatar: string | null;
  sellerOnline: boolean;
  /** 売り切れ（ランキングだけ sold も返る） */
  soldOut: boolean;
};

/** 商品ページで選ぶオプション（addToCart・quote_listing に渡す形と同じ名前） */
export type QuoteOptions = {
  worn_days?: number;
  photo?: boolean;
  letter?: boolean;
  anonymous?: boolean;
  video?: boolean;
};

/** quote_listing の答え */
export type Quote = {
  wornDays: number;
  basePrice: number;
  wornSurcharge: number;
  videoFee: number;
  anonymousFee: number;
  subtotal: number;
  total: number;
};
