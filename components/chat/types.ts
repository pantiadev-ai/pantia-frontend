/* チャットの画面で使う形。サーバー（ページ・action）とブラウザ（client component）の両方から使うので、ここでは何も import しない */

export type MessageKind = "text" | "image" | "item" | "system" | "shipping";

export type ChatImage = { path: string; url: string | null };

/** メッセージに付いた商品。読めない（非公開・ブロック等）ときは null */
export type ChatListing = { id: string; title: string; price: number | null; imageUrl: string | null };

export type ChatMessage = {
  id: string;
  senderId: string | null;
  kind: MessageKind;
  body: string;
  images: ChatImage[];
  listingId: string | null;
  listing: ChatListing | null;
  orderId: string | null;
  hearted: boolean;
  /** スパムの疑いで止めている（送った本人にだけ見える） */
  held: boolean;
  createdAt: string;
};

export type ChatPage = { messages: ChatMessage[]; hasMore: boolean };

export type ChatLatest = { messages: ChatMessage[]; otherReadAt: string | null };

/** 会話の一覧の1行（名前は伏せ済み・画像は URL にした後の形） */
export type ThreadRow = {
  threadId: string;
  otherId: string | null;
  name: string;
  avatarUrl: string | null;
  role: "seller" | "buyer" | null;
  lastSeenAt: string | null;
  verified: boolean;
  lastMessageAt: string;
  preview: string;
  unread: number;
  muted: boolean;
};

/** 自分の公開中の出品（「自分の商品を紹介」で選ぶ物） */
export type MyListing = { id: string; title: string; price: number | null; imageUrl: string | null };

/** 画面の頭・吹き出しに出す相手と自分 */
export type ChatPerson = { id: string; name: string; avatarUrl: string | null };
