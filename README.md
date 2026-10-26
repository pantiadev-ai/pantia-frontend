# パンティア（pantia-frontend）

18歳以上・本人確認済みの人だけが使う、個人間売買（C2C）のサイト。

- 画面とサーバーの処理: Next.js 16（App Router・server action）。Vercel に置く
- DB・ログイン・画像・リアルタイム: Supabase（Postgres・Auth・Storage・Realtime）
- 常駐のサーバーは使わない。定期の処理は Vercel Cron（`vercel.json`）

決まり・URL の一覧・仮に決めたこと: `docs/CONVENTIONS.md`。
セキュリティの設計（預かるデータ・入口・秘密・バックアップ）: `SECURITY.md`。

## 手元で動かす

```bash
npm ci
cp .env.example .env.local   # 値を入れる（下の「環境変数」）
npm run dev
```

確認のコマンド:

| コマンド | 中身 |
|---|---|
| `npm run typecheck` | 型（`next typegen` のあと `tsc --noEmit`） |
| `npm run lint` | eslint |
| `npm run test:unit` | 小さな部品の試験（`tests/unit/`） |
| `npm run security:deps` | 依存の脆弱性の門（例外は `security-exceptions.json`） |
| `npm run security:design` | `SECURITY.md` の埋まり具合（公開前は `-- --release`） |

## 環境変数

見本と説明は `.env.example`。未設定のまま使うと、その場で「環境変数 X が未設定です」と止まる（予備の値で素通りさせない。`lib/env.ts`）。

- **`NEXT_PUBLIC_SITE_URL` は build の時にも要る**（`/robots.txt`・`/sitemap.xml` を build の時に作るため）。Vercel では Production と Preview の両方に入れる。Preview は Preview の URL にする。
- `NEXT_PUBLIC_*` は build の時にブラウザ用のコードへ埋め込まれる。値を替えたら出し直す。
- 決済・メール・本人確認は、契約が済むまで仮の動き（`PAYMENT_MODE=mock`・`MAIL_MODE=mock`・`KYC_MODE=manual`）で全部つながる。
  - `PAYMENT_MODE=mock` は本番（`VERCEL_ENV=production`）では購入を受け付けない。本番で売り買いを始める前に `live` と各社の鍵を入れる。
  - `MAIL_MODE=mock` の間は送らずに `mail_outbox` に控えだけ残す（管理画面の「送信メール」で見られる）。
- `CRON_SECRET` は32文字以上の乱数。未設定・16文字未満なら cron は 503 で止まる。

## Supabase の準備

1. **migration を番号順に当てる**（`supabase/migrations/`）。本番は「migration が先、アプリがあと」。
   - 本番に当てる前に `supabase/post-deploy/00_precheck.sql` を流す（読むだけ）。作る表・関数・箱の名前が本番に無いか、旧表の形、拡張機能などを1つの表で返す。`NG` が1つでもあれば当てない。
   - 1本ずつ SQL Editor で流す（各ファイルは1回の実行で全部通るか全部戻る）。
   - 当てた後に `supabase/post-deploy/05_postcheck.sql`（読むだけ）で `NG` が無いこと、Advisors の Security で ERROR が 0 件なことを確かめてからアプリを出す。
   - 0008 の引っ越しは、アプリを切り替える直前に `select public.migrate_legacy_data();` だけをもう一度流す（その間に前の画面で登録した人と出品を拾う。何度流しても同じ結果。ファイルごと流し直すと表を作る所で止まる）。
   - 新しいアプリを出して動きを確かめた後に `supabase/post-deploy/10_lock_legacy.sql`（前の表を閉じる）。
2. **Auth の設定**（Supabase の管理画面）:
   - URL Configuration の Site URL に `NEXT_PUBLIC_SITE_URL`、Redirect URLs に `${NEXT_PUBLIC_SITE_URL}/auth/callback**` を足す（Preview の URL も使うなら同じ形で）。
   - Email Templates（登録の確認・パスワード再設定・メールアドレス変更）のリンクを token_hash 型にする。例（パスワード再設定）:
     `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/auth/update-password`
     （`/auth/callback` は `?code=` と `?token_hash=&type=` の両方を受ける。メールを別の端末・別のブラウザで開いても通るのは token_hash 型）
   - **SMTP を自前の物にする**（SendGrid など）。Supabase の既定の送り口は1時間に数通しか送れず、登録の確認・再設定のメールが届かなくなる。
   - 新規登録の時に利用者の行を作る DB の処理（`handle_new_user`）が失敗すると、Supabase は「Database error saving new user」としか返さない。原因は Supabase の Logs（Auth・Postgres）で見る。
   - 管理画面には二段階認証（TOTP）が要る。Auth の設定で TOTP を有効にしておく。
3. **運営者を足す**: SQL で `insert into public.admin_users (user_id, note) values ('<利用者の id>', '<メモ>');`。その人が初めて `/admin` を開くと、二段階認証の登録に回される。
   二段階認証の端末をなくしたときは、Supabase の管理画面（Authentication → その利用者 → MFA の要素）で消してから登録し直す。

## 代理登録（運営が本人に代わって登録する）

本人に頼まれたときだけ使う（運営のアカウントや架空の人は作らない）。年齢の確認は省かない。くわしい守りは `SECURITY.md` の「代理登録」。

1. `/admin/proxy` で、本人のメールアドレス・呼び名・使い方（出品者は年齢）を入れ、「本人の同意」「18歳以上の申告」の印を付けて登録する。作った人は本人確認が「未提出」で、承認されるまで出品も購入もできない。
2. 詳細（`/admin/proxy/<id>`）で「パスワードを決めるリンクを作る」を押し、出たリンクを LINE などで**本人だけ**に送る。メールは送らない。リンクは画面を離れると消え、作り直すと前のリンクは使えない。本人が開いてボタンを押し、パスワードを決めると「渡し済み」になり、そのあとは運営からリンクを作れない。
3. 本人から書類の写真と生年月日を受け取ったら、同じ詳細で「本人確認を代理で出す」（`KYC_MODE=manual` のときだけ）。18歳未満は出せない。審査は KYC審査の画面でふつうどおり（できれば出した人とは別の運営が審査する）。
- 本番に出すときは migration `20261026000010_proxy_registration.sql` を先に当ててから、アプリを出す。0001〜0009 を当て済みの本番に足す物なので、`00_precheck.sql`（初回用）は流さない。当てたあと `05_postcheck.sql` で `NG` が無いこと（15・16 が代理登録の守り）を確かめる。

## Vercel

- `vercel.json` の cron は4本（どれも1日1回。時刻は UTC）。Hobby のプランは1日1回までなので、回数を増やすなら Pro にする。
  期限切れの支払い待ちは、購入の手続きの中でもその場で取り消す（`lib/order-sweep.ts`）ので、1日1回でも売り場は詰まらない。
- 出したら確かめる:
  - `/api/cron/health` が 200（合言葉なし。遅れている cron の名前だけを返す。初めて出した日は、4本が1回ずつ走るまで 503）
  - `/api/cron/expire-orders` を合言葉なしで開くと 401
  - CSP は最初 report-only（`CSP_ENFORCE` は空）。本番で違反0件・`<script>` の全部に nonce が付いていることを確かめてから `CSP_ENFORCE=1`（`pantia-frontend-app` の Production は 2026-10-19 に 1 にした）。`next.config.ts` に同じ名前の CSP を置かない。

## DB の試験（検証用の Supabase だけ）

```bash
SUPABASE_ACCESS_TOKEN=... TEST_PROJECT_REF=<検証用の ref> node supabase/tests/run.mjs [01_catalogue.sql ...]
```

各ファイルは1回の取引で流れ、最後に取り消すので、作ったデータは残らない。本番の ref を渡すと止まる。先に migration を当てておくこと。

## 画面の試験（E2E・Playwright）

検証用の Supabase（migration を当てた物）に向けて、手元で build したアプリを動かして試す。**本番の ref では動かない**（`tests/e2e/_env.ts` が止める）。

1. 値を2つのファイルに分けて入れる（どちらも git に上げない）:
   - `.env.local`（アプリ用。Next の build・start が自分で読む）: `NEXT_PUBLIC_SUPABASE_URL`・`NEXT_PUBLIC_SUPABASE_ANON_KEY`・`SUPABASE_SERVICE_ROLE_KEY`（検証用の物）、`NEXT_PUBLIC_SITE_URL=http://localhost:3100`、`CRON_SECRET`、`PAYMENT_MODE=mock`・`PAYMENT_METHODS=card,paypay,bank`・`MAIL_MODE=mock`・`KYC_MODE=manual`、`CONTACT_TO`・`MAIL_FROM`（`@example.test` でよい）
   - `.env.e2e`（試験の道具だけが使う）: `TEST_PROJECT_REF`（検証用の ref）、`SUPABASE_ACCESS_TOKEN`（下ごしらえの SQL を Supabase の管理 API で流す）
2. build して流す（サーバーは 3100 番で自動で立つ。もう動いていればそれを使う）:
   ```bash
   npm run build
   node --env-file=.env.local --env-file=.env.e2e node_modules/@playwright/test/cli.js test
   ```
   （`next build` には `--env-file` を付けない。Next の下働きのプロセスが受け付けずに止まる）
   - 1つのファイルだけなら末尾に `tests/e2e/00_smoke.spec.ts`。スマホの崩れの試験は `*.mobile.spec.ts`（Pixel 7）。
   - サイト全体の設定を変える試験（`49_admin_settings.spec.ts`）は、ほかの試験と同時に流さない。
3. 試験は `e2e-<名前>@example.test` の利用者を作って使う（管理 API で作るので、メールは出ない）。ログインの状態・二段階認証の秘密は `tests/e2e/.auth/`（git に上げない）に置く。
4. 画面からの新規登録・パスワード再設定の「送信」は試さない（Supabase が本当にメールを送るため）。入力の誤りまでを試す。
