# セキュリティ設計メモ（パンティア）

> 新しいアプリ・サービスを作るときに、**コードを書く前に**埋める。型の正本は
> `C:\Users\OWNER\Dropbox\AI関連\knowledge\core\28_security_baseline.md`（§0 新しく作るときの道順）。
> 当てはまらない欄は消さずに「なし（理由）」と書く。まだ決められない値は「仮（決める人・決める日）」と書く。
> **「仮」は公開の前に全部なくす**（`node scripts/security-design-check.mjs --release` が「仮」の残りで落ちる）。
> 機能を足したら、同じ日にここも直す。

パンティアは、18歳以上・本人確認済みの人だけが使う、リユースインナーの個人間売買（C2C）サイト。
Next.js 16（Vercel）＋ Supabase（DB・Auth・Storage・Realtime）。常駐サーバー（Railway など）は使わない。

## 1. 何を預かるか（28 §P1・§P3）

| データ | 例 | 分類（公開／業務／個人情報／機微） | 置き場 | 消す日・消し方 | 消す日を決めた人・根拠 |
|---|---|---|---|---|---|
| 会員の基本 | メールアドレス・ニックネーム・役割 | 個人情報 | Supabase Auth・profiles | 退会でニックネーム等を消し（withdraw_account）、Auth の利用者は止める（ban。取引の記録が利用者を指すので行は消さない。メールアドレスは Auth に残り、同じアドレスで登録し直せない） | 開発（仕様書 §2・§7 の退会）。 仮（社長・公開前に、残したメールアドレスを伏せ字に替えるか決める） |
| 公開プロフィール | 自己紹介・年代・職業・身長・体型・アイコン | 公開（本人が出す） | profiles・avatars の箱 | 退会で消す。停止中・退会は他人から見えない（profiles_read） | 開発（仕様書 §6） |
| 生年月日・本人確認の書類 | 身分証の写真・生年月日 | 機微 | kyc_applications・kyc-documents の箱（非公開） | 書類は審査の結果が出て7日後に消す（cleanup_retention と cron の cleanup） | 開発（年齢の確認だけに使い、長く持たない）。 仮（社長・公開前に7日でよいか決める） |
| 配送先 | 氏名・住所・電話 | 個人情報 | order_addresses・saved_addresses | 取引の完了・取消から90日で消す（返金待ちは残す） | 開発（問い合わせ対応の期間） |
| 振込先の口座 | 銀行・支店・口座番号・名義 | 機微 | bank_accounts（本人と運営者だけ） | 退会で消す | 開発 |
| 取引・お金 | 注文・売上の台帳・振込申請 | 業務 | orders・ledger_entries・payouts | 7年残す（帳簿の保存）。退会しても取引の相手のために消さない | 開発（法人税法の保存期間）。 仮（社長・公開前に税理士と確認） |
| やりとり | チャット・つぶやき・コメント・レビュー | 個人情報（本人が書いた物） | messages・posts・post_comments・reviews・chat-images の箱 | 退会でつぶやき・画像を消す。チャットは相手の控えとして残す（名前は「退会したユーザー」） | 開発（相手の取引の証拠） |
| 通報・制裁 | 通報の中身・警告・停止の理由 | 業務 | reports・user_sanctions・audit_logs | 操作の記録は2年で消す | 開発 |
| 決済の受け取り記録 | 決済会社からの通知の中身 | 業務 | payment_events | 400日で消す | 開発（チャージバックの期限） |
| 送ったお知らせの控え | メールの件名・本文 | 個人情報 | mail_outbox | 180日で消す | 開発 |
| お知らせ | 注文・メッセージの通知 | 業務 | notifications | 既読は90日・未読も1年で消す | 開発 |

機微（マイナンバー・健康・子供の声や写真・口座など）を持つなら、持つ理由と見られる人: 身分証の写真と生年月日は「18歳以上の確認」のためだけに持つ。見られるのは運営者だけ（審査の間、5分の期限つきURL）。本人も上げたあとは見られない。口座は振込のためだけに持ち、本人と運営者だけが見る（画面では下4桁）。マイナンバーは受け取らない（提出の画面で「マイナンバーの面は出さない」と案内する）。

## 2. 役割と権限（だれが何をできるか。28 §A・§B1・ASVS V8）

| 役割（例: 職人・事務・会社の管理者・運営者・ログインなし） | 見られる物 | 書ける・消せる物 | 他の会社・他の人の物に届かない仕組み（RLS の方針・関数の中の確認など） |
|---|---|---|---|
| ログインなし | 公開の出品・出品者・つぶやき・ランキング・規約 | なし | anon は RLS の公開の行だけ。profiles は列ごとの許可で公開の列だけ |
| 購入者（buyer） | 上に加えて、自分の注文・カート・お気に入り・フォロー・チャット・お知らせ | 購入（本人確認済み）・レビュー・コメント・いいね・フォロー・通報・チャット | RLS の `= auth.uid()`。お金と状態の変更は DB の関数の中で本人と状態を確かめる |
| 出品者（seller） | 上に加えて、自分の売上・振込・出品の管理・自分宛ての注文の配送先（支払い後〜発送まで。匿名配送は見えない） | 出品（公開は本人確認済み）・つぶやき・発送・振込申請 | 出品・つぶやきは seller/author = auth.uid() を方針と関数で二重に。配送先は order_addresses の方針で期間を絞る |
| 運営者（admin_users） | 全部（本人確認の書類は期限つきURL） | 本人確認の審査・停止・警告・退会・出品の非表示・取消と返金・振込・設定 | 管理の関数は service_role だけが呼べ、最初に assert_admin(p_admin) で確かめる。画面は requireAdmin() で、運営者でなければ 404 |

役割・所属・運営者の印を、利用者が自分で書き換えられない仕組み（28 §A2）: profiles の更新の許可は列ごと（ニックネーム・自己紹介など）で、role・kyc_status・status は許可に無い。役割の変更は申請（request_role_change）→運営者の承認だけ。運営者の印は別の表 admin_users にあり、利用者からは読めも書けもしない。

## 3. 入口（外から呼べる所の全部。28 §B・§M・§N）

| 入口（画面・API・cron・webhook・WebSocket・共有URL） | ログインの要否 | 所属・役割の確認 | 回数の上限 | 備考 |
|---|---|---|---|---|
| 公開の画面（/・/items・/items/[id]・/sellers・/sellers/[id]・/ranking・/tweets・/tweets/[id]・/terms・/privacy・/legal・/help・/contact） | 不要 | なし（RLS の公開の行だけ） | なし | proxy.ts の一覧に無いパスはログインが要る側に倒す |
| ログイン・登録・再設定（/auth・/auth/reset・/auth/update-password・/auth/callback・/auth/suspended） | 不要 | なし | loginEmail・loginIp・signupIp・resetEmail・resetIp | 戻り先は safeNext で自サイトの中だけ |
| 利用者の画面（/mypage・/timeline・/messages・/cart・/checkout・/orders/[id]・/notifications・/kyc・/listings/new・/listings/[id]/edit） | 要 | requireViewer（停止・退会は /auth/suspended へ） | 操作ごと（下） | 他人の注文などは RLS で 0 件 → 404 |
| server action（出品・カート・購入・発送・受取・レビュー・つぶやき・コメント・いいね・フォロー・ブロック・通報・チャット・本人確認・振込申請・プロフィール・退会・画像の上げ） | 要 | actionViewer＋役割・本人確認（assertKyc）。DB の関数でも同じ確認 | listingUser・checkoutUser・messageUser・postUser・commentUser・reactUser・reportUser・kycUser・payoutUser・uploadUser | 入力は zod で形を確かめる。formData をそのまま DB に書かない（O4） |
| 管理画面（/admin 以下）と管理の server action | 要（運営者は MFA） | requireAdmin／actionAdmin → service_role で管理の関数（中で assert_admin） | なし（運営者だけ） | 管理画面があること自体を見せない（404） |
| webhook（/api/webhooks/stripe・/api/webhooks/paypay・/api/webhooks/kyc） | 不要 | 署名の照合（鍵が未設定なら 503 で拒否） | なし | 同じ通知の二度受けは payment_events の一意で止める。金額も照合する |
| cron（/api/cron/expire-orders・/api/cron/auto-complete・/api/cron/retry-refunds・/api/cron/cleanup） | 不要 | CRON_SECRET の照合（未設定・16文字未満なら 503・違えば 401） | なし | 最後まで走った時刻を cron_runs に残す |
| /api/cron/health | 不要（外形監視が見る） | なし | なし | 遅れている cron の名前だけを返す（時刻・件数は返さない）。遅れがあれば 503 |
| Realtime（チャット・お知らせ） | 要 | RLS がそのまま効く（会話の当事者・本人だけに届く） | なし | 書き込みは server action だけ。購読は読むだけ |

ログインの仕組み（Supabase Auth／自前／なし）と、新規登録を開けるか: Supabase Auth（メールとパスワード）。登録はサーバーの action から行い、回数の上限をかける。運営者が設定で登録を閉じられ、閉じている間は DB の登録の処理（handle_new_user）でも止める。Google・X のログインは、Supabase 側で有効にして環境変数 NEXT_PUBLIC_OAUTH_PROVIDERS に書いたときだけボタンを出す。登録の時に出品者か購入者かを選ぶ（出品者は年齢・職業も入れる。出品の公開には本人確認が要る）。外部アカウントのログインで初めて来た人は購入者で始まり、出品者へは役割の変更の申請（request_role_change）から。 仮（社長・公開前に Google・X を使うか決める）。

セッションの期限と、停止・退会のあとに止まる仕組み（28 §L）: Supabase Auth の既定（アクセス用1時間・更新用は使い切り）。「ログインしたままにする」を外すと、クッキーをブラウザを閉じるまでにする。停止・退会は profiles.status で、ページ・action・DB の関数（is_end_user）の全部が毎回見るので、次の操作から止まる。退会は Auth の利用者も消す。

パスワードの変更（28 §L・ASVS V6）: 今のパスワードを知らない人（ログインしたままの端末を借りた人）に変えさせないため、変更は再設定のメールのリンクを通った時だけ。/auth/callback が再設定のリンクの時だけ、人の id と期限（15分）を HMAC-SHA256 で署名した札を httpOnly の cookie（pt_pw_reset・path /auth）に置き、updatePassword と画面がそれを確かめる（lib/recovery-grant.ts）。札は一度きり（変えたら消す）。変えたあとは、ほかの端末のログインを切る。設定の画面からの変更（changePassword）は、今のパスワードを確かめてから変える。

## 4. 秘密（鍵・パスワード。28 §C・§J）

| 秘密 | 置き場（.env.local・Vercel・GitHub secrets など） | 範囲 | 漏れたら何を差し替えるか |
|---|---|---|---|
| SUPABASE_SERVICE_ROLE_KEY | Vercel（本番と Preview は別の Supabase の値）・手元の .env.local | サーバーだけ（パスワードの再設定の札の署名にも、用途別の鍵を作ってから使う） | Supabase の JWT 秘密を作り直す（anon も替わる）。差し替えると、出ている再設定の札は使えなくなる（15分で切れる物なので害はない） |
| CRON_SECRET | Vercel | サーバーだけ | 新しい値にして出し直す |
| STRIPE_SECRET_KEY・STRIPE_WEBHOOK_SECRET | Vercel | サーバーだけ（制限つきキーにする） | Stripe の管理画面で鍵と webhook の署名秘密を回す |
| PAYPAY_API_KEY・PAYPAY_API_SECRET・PAYPAY_MERCHANT_ID | Vercel | サーバーだけ | PayPay の管理画面で鍵を作り直す |
| TRUSTDOCK_API_TOKEN・TRUSTDOCK_WEBHOOK_SECRET | Vercel | サーバーだけ | TRUSTDOCK に作り直しを頼む |
| SENDGRID_API_KEY | Vercel（Mail Send だけの権限） | サーバーだけ | SendGrid で鍵を消して作り直す |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Vercel（ブラウザに配る。秘密ではない） | 公開 | 守りの本体は RLS なので差し替え不要。JWT 秘密を回したときだけ替わる |

自前で暗号にする物（無ければ「なし」）。あるなら AES-256-GCM・タグ16バイト（28 §J1）: なし（口座番号は Supabase の保存時の暗号化と RLS に任せ、画面は下4桁）。webhook の署名・パスワードの再設定の札は HMAC-SHA256 を timingSafeEqual で比べる。

## 5. ファイル・写真・音声（28 §A8・§A8-2・§O7）

| 種類 | 上げ方（サーバー経由／署名URLで直接） | 中身の先頭で種類を確かめるか | 大きさ・数の上限 | 位置情報（EXIF）・メタデータの除き方 | 置き場のパスの形と、その確認 |
|---|---|---|---|---|---|
| 出品の写真（listing-images・公開） | サーバー経由（server action）。ブラウザで長辺2048pxに縮めてから送る | sharp で開けた物だけ（開けなければ拒否） | 1枚 8MB・4000万画素まで。1出品5枚 | sharp で webp に作り直し、メタデータを付けない | `<出品者のid>/<uuid>.webp`。DB の paths_ok（check 制約）とアプリの両方で確かめる |
| アイコン・表紙（avatars・公開） | 同上 | 同上 | 各1枚 | 同上 | `<本人のid>/<uuid>.webp`（profiles の check 制約） |
| つぶやきの写真（post-images・公開） | 同上 | 同上 | 1投稿4枚 | 同上 | `<投稿者のid>/<uuid>.webp` |
| チャットの写真（chat-images・非公開） | 同上。当事者かを確かめてから置く | 同上 | 1通4枚 | 同上 | `<会話のid>/<uuid>.webp`。見せるときは当事者だけに60分の期限つきURL |
| 本人確認の書類（kyc-documents・非公開） | 同上 | 同上 | 1回3枚 | 同上 | `<本人のid>/<uuid>.webp`。運営者だけに5分の期限つきURL。結果から7日で消す |

写り込み・録り込み（顔・表札・車のナンバー・他人の声など）の扱いと、利用者への案内: 出品とつぶやきの画面に「顔・住所・他人が写らないように」と出す。通報の理由に「画像」を置き、運営者が非表示にできる。顔の自動ぼかし・画像の自動判定は付けない。 仮（社長・公開前に外部の画像判定を入れるか決める）。

## 6. 外へ送る物（AI・外部 API・メール。28 §I・§O6）

| 送り先 | 送る中身 | 個人情報を伏せるか | 費用の上限 |
|---|---|---|---|
| Stripe（カード・銀行振込） | 注文の金額・注文番号 | 品名は送らない（「パンティアのご注文」） | 決済の手数料だけ |
| PayPay | 注文の金額・注文番号 | 品名は送らない | 決済の手数料だけ |
| TRUSTDOCK | 本人確認の依頼（書類は TRUSTDOCK の画面で本人が上げる） | 利用者の id だけ | 1件ごとの契約の料金。 仮（社長・契約のとき） |
| SendGrid | お知らせのメール（宛先・定型文） | 品名・住所は書かない | 無料枠。送れなければ控えだけ残す |

AI を使うなら（使わないなら「なし」）:
- 呼び出しはゲートウェイ経由だけか（28 §B11）: なし（AI を使わない）
- AI の答えの見せ方（HTML として出さない・リンクや命令をそのまま実行しない）: なし（AI を使わない）
- 利用者の文・書類の中の「指示を書き換えようとする文」への備え（道具を持たせるなら、取り返しのつかない操作は人の確認。28 §I4・OWASP LLM Top 10）: なし（AI を使わない）

## 7. 消えても戻す・気づく（28 §D・§F）

| 守る物 | 夜間バックアップ（`C:\Users\OWNER\dev\ai-kakumei-backup\targets.json` など） | 載せる日 |
|---|---|---|
| DB | 客先の Supabase（swqrhatsooeqoqfzugaj）。客先の契約の PITR か、当社の夜間バックアップに載せるか。2026-10-18 の時点で、客先の契約は日次バックアップ0件・PITR なし（Management API で確認）。 仮（社長・公開前） | 本番の migration は 2026-10-18 に当てた（10本・事後確認 NG 0）。守り方が決まった日に載せる |
| ファイル（Storage・VPS のファイル）。無ければ「なし」 | 出品・アイコン・つぶやき・チャットの写真（本人確認の書類は7日で消すので載せない）。 仮（社長・公開前） | 本番の migration を当てた日 |

- 外形監視に載せる URL（`uptime_targets.json`）: https://pantia-frontend-app.vercel.app/auth（200）・https://pantia-frontend-app.vercel.app/api/cron/health（合言葉なしで 200）・Supabase の入口。 仮（社長・客先の監視に載せるか公開前に決める）
- cron があるなら、最後まで走った時刻の記録と `/api/cron/health`: あり。expire-orders・auto-complete・retry-refunds・cleanup（どれも1日1回。vercel.json）が cron_runs に残し、health が「最後に終わってから26時間を過ぎた物」を 503 で返す。期限切れの支払い待ちは、購入の手続きの中でもその場で取り消す（lib/order-sweep.ts）ので、1日1回でも売り場は詰まらない

## 8. ASVS 5.0 の章（28 §2-2）

触る章に「該当」、触らない章に「対象外（理由）」。該当の章は、28 の項目を通した印として項目の番号を書く。

| 章 | 該当／対象外 | 通した 28 の項目 |
|---|---|---|
| V1 符号化・無害化 | 該当（検索・チャット・つぶやき） | A12（escapeLike・safeSearch）・O1（シェルなし）・O2（外の値を正規表現にしない）・O3（React の自動エスケープ。dangerouslySetInnerHTML を使わない） |
| V2 検証・業務の流れ | 該当（購入・発送・受取・振込の順序） | A7（手数料などの設定は service_role だけ）・B7・O4（zod）・O5（状態の移り方は DB の関数だけ） |
| V3 ブラウザ側（CSP・CSRF・CORS・クッキー） | 該当 | B9（CSP は report-only から）・N1（route の POST は Origin を確かめる）・N2・N3・L4 |
| V4 API・WebSocket | 該当（Realtime） | M1（Realtime は RLS が効いたまま）・M2 |
| V5 ファイル | 該当（写真・本人確認の書類） | A8・A8-2（paths_ok）・O7（sharp で作り直し） |
| V6 認証 | 該当 | B6・B7（回数の上限）・H6（運営者は MFA） |
| V7 セッション | 該当 | B10・L1（停止・退会で次の操作から止まる）・L2・L3・L4 |
| V8 認可（他の会社・他の人のデータに届かない） | 該当 | A1・A2・A3・B1・B2（service_role は確認のあとだけ） |
| V11 暗号 | 該当（webhook の署名） | J1（自前の暗号はしない）・J3（timingSafeEqual） |
| V12 通信 | 該当 | B9（HSTS）・R1 |
| V13 設定・秘密 | 該当 | C1〜C6・R2・R3 |
| V14 データ保護 | 該当（本人確認の書類・住所・口座） | P1〜P4・A8-3（本人確認の書類は非公開の箱と期限つきURL） |
| V15 依存・供給網 | 該当 | C7・K1〜K7（security-gate.mjs と依存の例外）・H2・H3 |
| V16 記録・エラー | 該当 | F（cron_runs と health）・Q1（audit_logs）・Q2（画面に中身を出さない）・Q3 |

## 9. 例外（型どおりにしない所）

理由と期限（最長3か月）と、決めた人: 依存の例外は security-exceptions.json の1件（braces・開発用だけ・2027-01-15 まで・開発が 2026-10-15 に確認）。リポは客先（pantiadev-ai）の物なので、組織 Andsllc2016 の門・ブランチ保護は客先の設定に任せる（28 §0 の段2の例外）。 仮（社長・公開前に客先と取り決め）。
