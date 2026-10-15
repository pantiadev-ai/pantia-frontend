# 開発の決まり（パンティア）

画面・server action を足すときに守ること。DB の設計は `supabase/migrations/`、セキュリティの設計は `SECURITY.md`。

## 1. 使っている物

- Next.js 16（App Router）。`middleware.ts` ではなく `proxy.ts`。`params`・`searchParams`・`cookies()`・`headers()` は **await する**。ページの型は `PageProps<"/items/[id]">`、レイアウトは `LayoutProps<"/">`（`npx next typegen` で作られる。import 不要）。
- React 19、TypeScript strict、Supabase（`@supabase/ssr`）、zod 4、Stripe。Tailwind は使わない。
- 画面の文字はすべて日本語。コードのコメントも日本語で、短く「なぜ」を書く（まわりのファイルと同じ書き方）。
- `dangerouslySetInnerHTML` は使わない。画像は `<img>`（Next の画像最適化は使わない）。

## 2. 見た目

- デザイン見本は `design/mockup/*.html`。CSS は見本ごとに `.pg-<名前>` の中だけに効くよう書き換えた物が `styles/*.css`。

| 見本 | 囲いのクラス | CSS | 頭（SiteHeader の variant） | 足（SiteFooter の variant） |
|---|---|---|---|---|
| index.html | `pg-base` | `@/styles/base.css` | `index` | `index` |
| items_list.html | `pg-items-list` | `@/styles/items-list.css` | `list` | `list` |
| item_detail.html | `pg-item-detail` | `@/styles/item-detail.css` | `detail` | `detail` |
| item_form.html | `pg-item-form` | `@/styles/item-form.css` | `form` | なし |
| seller_profile.html | `pg-seller-profile` | `@/styles/seller-profile.css` | `seller` | `seller` |
| tweets.html | `pg-tweets` | `@/styles/tweets.css` | `tweets` | `tweets` |
| timeline.html | `pg-timeline` | `@/styles/timeline.css` | `timeline` | なし |
| mypage.html | `pg-mypage` | `@/styles/mypage.css` | `mypage` | `mypage` |
| chat.html | `pg-chat` | `@/styles/chat.css` | 見本の `chat-header-bar` をページ内で書く | なし |
| auth.html | `pg-auth` | `@/styles/auth.css` | 見本の `auth-header` をページ内で書く | `auth` |
| terms.html | `pg-terms` | `@/styles/terms.css` | `terms` | `terms` |
| admin.html | `pg-admin` | `@/styles/admin.css` | 見本の `topbar` をページ内で書く | なし |
| 見本なし | `pg-app` | `@/styles/app.css` | `app` | `app` |

- ページの一番外を `<div className="pg-…">` で囲み、その CSS をページで import する。見本の HTML の形・クラス名をそのまま使い、ダミーの文字を DB の値に替える。見本の「LABEL NAME」は使わない（`SiteHeader`／`SiteFooter` が「♡ パンティア」を出す）。
- 見本の JS（タブ切り替え・モーダル・トースト等）は React の client component で作り直す。`.fade-in` は `RevealOnScroll`（app/layout.tsx に入れ済み）が `.visible` を付ける。
- 見本の無い画面は `pg-app` と `styles/app.css` の部品（card・table・btn・field・chip・notice・tabs・empty・pager など。ファイルの頭に一覧）で作る。
- 全ページ共通の小さな部品は `app/globals.css` の `pt-` で始まるクラス（pt-msg・pt-modal・pt-btn・pt-banner・pt-uploader）。
- 自分の画面だけの追加の見た目は、自分のフォルダに CSS を置き、`.pg-…` の下に書く（共通のファイルは直さない。下の 6）。

## 3. URL の一覧（リンクはここに合わせる）

| URL | 中身 | ログイン |
|---|---|---|
| `/` | トップ | 不要 |
| `/items` | 商品一覧（`?q=&category=&sort=&page=` など） | 不要 |
| `/items/[id]` | 商品の詳しい所（カート・購入・お気に入り・通報） | 不要 |
| `/sellers` | 女の子一覧（`?q=`） | 不要 |
| `/sellers/[id]` | 出品者のプロフィール | 不要 |
| `/ranking` | 週間ランキング | 不要 |
| `/tweets`、`/tweets/[id]` | つぶやき（`?q=&tag=`） | 不要 |
| `/timeline` | フォロー中のつぶやき・投稿欄 | 要 |
| `/auth` | ログイン（`?tab=register` で新規登録の3段）。`?next=` で戻り先 | 不要 |
| `/auth/reset`、`/auth/update-password`、`/auth/callback`、`/auth/suspended` | 再設定・メールの戻り先・停止中 | 不要 |
| `/mypage` | マイページ（出品者はダッシュボード、購入者は購入履歴・お気に入り・フォロー中） | 要 |
| `/mypage/items` | 自分の出品の一覧 | 出品者 |
| `/mypage/sales` | 受けた注文・売上 | 出品者 |
| `/mypage/tweets` | 自分のつぶやき・投稿欄 | 出品者 |
| `/mypage/profile` | プロフィールの編集（アイコン・カバー・紹介文・属性） | 要 |
| `/listings/new`、`/listings/[id]/edit` | 出品・出品の編集 | 出品者 |
| `/payout` | 振込先の口座・振込申請・履歴 | 出品者 |
| `/cart`、`/checkout`（`?items=id,id`）、`/checkout/mock` | カート・購入手続き | 購入者 |
| `/orders`、`/orders/[id]` | 注文の一覧・1件（発送・受取・キャンセル・レビューもここ） | 要 |
| `/messages`、`/messages/[id]` | メッセージ（一覧・会話） | 要 |
| `/notifications` | お知らせ | 要 |
| `/kyc` | 本人確認（18歳以上の確認） | 要 |
| `/settings` | アカウント設定（メール・パスワード・お届け先・通知・ブロック一覧・役割の変更・退会） | 要 |
| `/admin`、`/admin/[panel]` | 管理画面（MFA 必須） | 管理者 |
| `/terms`、`/privacy`、`/legal`、`/help`、`/contact` | 規約・プライバシー・特商法・ヘルプ・お問い合わせ | 不要 |

`proxy.ts` は一覧にないパスをログイン必須に倒す。ログインなしで見せるページを足したら `proxy.ts` の `PUBLIC_EXACT`／`PUBLIC_PATTERNS` も直す（担当は全体の取りまとめ役。報告に書く）。

## 4. データの読み書き

- サーバーの画面・action は `createClient()`（`@/lib/supabase/server`）。**利用者の権限で動き、RLS が効く**。型は `@/lib/database.types` の `Database`。
- `createServiceClient()`（RLS を通らない）は、**ログイン・役割・当事者の確認を済ませた後に**、管理画面・決済・cron・本人確認の書類など決まった所だけで使う。画面の表示に使わない。
- DB の関数と引数の一覧: スクラッチの `api.txt`、表と列と権限と RLS: `schema.txt`（場所は依頼文）。詳しくは `supabase/migrations/` を読む。
- 利用者に見せない列（profiles の nickname は本人だけ、orders の payment_ref など）は select しない。select できる列は `schema.txt` の GRANT の行。
- 他人の名前は `profiles.public_name`（停止・退会なら null）を `displayName()` で出す。購入者の名前を出品者に見せるときは `maskName()`（「K***さん」）。

### ページ

```ts
import { getViewer, requireViewer, requireAdmin } from "@/lib/auth";
const v = await requireViewer("/mypage");          // ログインしていなければ /auth?next=… へ。停止中は /auth/suspended
if (v.role !== "seller") redirect("/mypage");       // 役割の確認はページでも行う
```

- URL の id は `isUuid()` で確かめ、だめなら `notFound()`。検索の文字は `.ilike()` なら `escapeLike()`、`.or()` に入れるなら `safeSearch()`（`@/lib/search`）。
- 数・日付・名前は `@/lib/format`（yen・dateJst・relTime・maskName・displayName・ratingAvg・stars など）、選択肢の表示名は `@/lib/labels`、サイトの設定（手数料・最低振込額など）は `getSettings()`（`@/lib/settings`）。

### server action（`lib/actions/<名前>.ts`、先頭に `"use server"`）

```ts
"use server";
import { actionViewer, assertKyc, ActionError, runAction, type ActionResult } from "@/lib/auth";
import { throwDb } from "@/lib/db-errors";
import { RULES, takeRateLimit } from "@/lib/rate-limit";

export async function doSomething(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const v = await actionViewer();                 // ①ログイン ②有効
    if (v.role !== "seller") throw new ActionError("出品者のアカウントで使えます。"); // ③役割
    assertKyc(v);                                  // 本人確認が要る操作だけ
    const parsed = Schema.safeParse(input);        // zod で形を確かめる（formData をそのまま DB に渡さない）
    if (!parsed.success) throw new ActionError("入力の内容を確かめてください。");
    const limit = await takeRateLimit([{ rule: RULES.postUser, kind: "user", id: v.id }], { failClosed: true });
    if (!limit.ok) throw new ActionError(limit.message);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(...);
    throwDb(error);                                // pantia:〇〇 を日本語の文にして返す（lib/db-errors.ts）
    revalidatePath("/…");
    return { ok: true, data: { id: data }, message: "保存しました。" };
  });
}
```

- action が受け取るのは、ログイン中の本人の id ではなく **相手・対象の id だけ**。本人は必ず `actionViewer()` から取る。
- 外に出す export は async 関数だけ（型は可）。
- 画面側は `useAction()` と `FormMessage`（`@/components/useAction`）で結果の文を出す。
- 回数の上限の表は `lib/rate-limit-rules.ts` の `RULES`。数えられないときは止める（`failClosed: true`）。ログイン・登録だけ `false`。
- route handler（`app/api/**`）の POST は `sameOrigin(req)`（`@/lib/origin`）で Origin を確かめる。

### 共通の部品

| 部品 | 使い方 |
|---|---|
| `SiteHeader`／`SiteFooter` | 上の表の variant。`active` でメニューの今いる所、`search` で検索欄 |
| `ImageUploader` | `kind`（listing・avatar・cover・post・chat）、`value`／`onChange`（`{path,url}[]`）、`max`。保存するときは `path` だけを DB に渡す |
| `ReportButton` | `type`（user・listing・post・comment・message）、`targetId`、`loggedIn` |
| `FollowButton`／`FavoriteButton`／`LikeButton`／`BlockButton` | `id`・`initial`・`loggedIn`・`labels: [オフ, オン]`（`{n}` は数）・`count`・`className` |
| `PostComposer`（`@/components/posts/PostComposer`） | つぶやきの投稿欄。`listings`（紐づけられる自分の出品） |
| `addToCart(listingId, options)`（`@/lib/actions/cart`） | options は `{worn_days?, photo?, letter?, anonymous?, video?}` |
| `startThread(otherUserId)`（`@/lib/actions/chat`） | 会話を開いて `/messages/[id]` へ移る |
| 画像の URL | 公開の箱は `listingImage(path)`・`avatarImage(path)`・`postImage(path)`（`@/lib/storage`）。チャットの画像は `signedUrls("chat-images", paths)`（サーバーだけ） |

## 5. 決めたこと（仮。最後の報告に一覧で出す）

- 出品者は「出品・つぶやき・メッセージ」、購入者は「購入・フォロー・お気に入り・いいね・コメント」。
- 購入は本人確認が済んだ購入者だけ。出品の公開は本人確認が済んだ出品者だけ（下書きは確認の前でも可）。
- メッセージ・つぶやき・コメントは本人確認が要る。フォロー・いいね・お気に入りはログインして有効なら可。
- 着用日数の延長は1日500円（設定 `extend_fee_per_day`）。写真・手紙は無料、匿名配送 +300円、動画 +800円（どれも設定の値を表示）。
- 「購入前にメッセージ必須」（request_only）の出品は、出品者から先に連絡が要る。
- 入力中の表示は作らない。メッセージのハートはある。
- 画像の審査（顔・不適切）は未接続。スパムの言葉の判定だけ。写真の位置情報（EXIF）は必ず消す。
- 退会・停止した人は他人から見えない。名前は「退会したユーザー」。
- つぶやきの閲覧数は作らない。
- サービス名・送信元・メールの仕組みは環境変数（管理画面では見るだけ）。

## 6. 手分けの決まり（並行で作っている間）

- 自分の担当のフォルダとファイルだけを作る・直す。**共通のファイル（`lib/` の既存ファイル、`components/` の既存ファイル、`styles/`、`app/globals.css`、`app/layout.tsx`、`proxy.ts`、`supabase/`）は直さない。** 直したいときは、最後の報告に「何をどう直したいか」を書く。
- `next build`・`next dev`・`git commit`・`git push` はしない（取りまとめ役が最後にまとめてやる）。
- 確認は依頼文の `check.mjs`（型と書き方。同時に1本ずつ順番に流れる）に自分の担当のパスを渡して流す。指摘0件まで直す。
- DB（検証用・本番とも）には触らない。
