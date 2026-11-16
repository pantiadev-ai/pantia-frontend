# 登録の確認・パスワード再設定・メールアドレスの変更のメール（Supabase Auth）

この3通は、アプリではなく Supabase Auth が送る。送り口（SMTP）と文面は Supabase の管理画面で決める。
お知らせのメール（注文・発送・振込の案内など）はアプリが Resend の API で送る（`lib/adapters/mail.ts`）。

## 1. 送り口を Resend にする

Supabase の管理画面 → Authentication → Emails → SMTP Settings で「Enable custom SMTP」を入れる。

| 項目 | 値 |
|---|---|
| Sender email | `info@pan-tia.com`（Resend で認証済みのドメインのアドレス） |
| Sender name | `パンティア` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Resend の API キー（送信だけ・`pan-tia.com` だけの権限。アプリ用とは別の鍵にする） |

- Supabase の既定の送り口は1時間に数通しか送れない。自前の送り口にしないと、登録の確認・再設定のメールが届かなくなる。
- 自前にした後、Authentication → Rate Limits の「メールを送る回数」の上限（既定は1時間に30通）を、見込みの登録数に合わせて見直す。
- Resend の無料の枠には1日の上限がある。お知らせのメールと、この3通の合計で数える。
- Resend の管理画面 → Domains → `pan-tia.com` で、開封とクリックの追跡を OFF にしておく（ON だと、再設定のリンクが Resend のドメインを通る形に書き換わる）。

## 2. 文面（Authentication → Emails → Templates）

リンクは token_hash 型にする（メールを別の端末・別のブラウザで開いても通る）。`{{ .SiteURL }}` は URL Configuration の Site URL（`NEXT_PUBLIC_SITE_URL` と同じ値にする）。
商品名・注文の中身は入れない。直すのは次の3通（登録の確認・パスワードの再設定・メールアドレスの変更）。招待・マジックリンクは既定のままでよい（このサイトは送らない）。

### Confirm signup（登録の確認）

件名:

```
【パンティア】メールアドレスの確認
```

本文:

```html
<p>パンティアへのご登録ありがとうございます。</p>
<p>次のリンクを開いて、メールアドレスの確認を済ませてください。確認のあと、本人確認（18歳以上の確認）の画面に進みます。</p>
<p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/kyc">メールアドレスを確認する</a></p>
<p>リンクには有効期限があります。切れたときは、もう一度ご登録の手続きをしてください。</p>
<p>このメールに心当たりがない場合は、何もせずに破棄してください。</p>
<p>パンティア<br>{{ .SiteURL }}</p>
```

### Reset password（パスワードの再設定）

件名:

```
【パンティア】パスワードの再設定
```

本文:

```html
<p>パスワードの再設定のお申し込みを受け付けました。</p>
<p>次のリンクを開いて、新しいパスワードを決めてください。</p>
<p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/auth/update-password">新しいパスワードを決める</a></p>
<p>リンクには有効期限があります。切れたときは、ログインの画面の「パスワードを忘れた方」からもう一度お申し込みください。</p>
<p>お申し込みに心当たりがない場合は、何もせずに破棄してください。パスワードは変わりません。</p>
<p>パンティア<br>{{ .SiteURL }}</p>
```

### Change email address（メールアドレスの変更）

設定の画面でメールアドレスを変えると送られる（`lib/actions/account.ts` の `changeEmail`）。Auth の「Secure email change」が ON なら、今のアドレスと新しいアドレスの両方に、この雛形で1通ずつ届く。

件名:

```
【パンティア】メールアドレスの変更の確認
```

本文:

```html
<p>メールアドレスを {{ .NewEmail }} に変更するお申し込みを受け付けました。</p>
<p>次のリンクを開いて、変更を確かめてください。</p>
<p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email_change&next=/settings">変更を確かめる</a></p>
<p>リンクには有効期限があります。切れたときは、設定の画面からもう一度お申し込みください。</p>
<p>お申し込みに心当たりがない場合は、リンクを開かずに破棄してください。メールアドレスは変わりません。</p>
<p>パンティア<br>{{ .SiteURL }}</p>
```

- `next=/kyc`・`next=/auth/update-password` は `lib/actions/auth.ts` の `callbackUrl`、`next=/settings` は `lib/actions/account.ts` の `changeEmail` が Supabase に渡す戻り先と同じにしてある。
- 3通とも token_hash 型にする。既定の `{{ .ConfirmationURL }}` のままだと、メールを別の端末・別のブラウザで開いたときに通らない（PKCE の仕組みのため）。
- `/auth/callback` は `type=recovery` のときだけ、新しいパスワードを決めるための札を置く（`app/auth/callback/route.ts`）。type を書き換えない。

## 3. 届くかを確かめる（本番に出す前に1回）

1. チームの外のアドレス（Gmail など、運営のドメインでない物）で、ログインの画面の「パスワードを忘れた方」から送る。
2. 数分のうちに届くか、迷惑メールに入っていないか、送信元が「パンティア <info@pan-tia.com>」と出るかを見る。
3. リンクを開いて、新しいパスワードを決める画面に進むかを見る（別の端末で開いても進むこと）。
4. 届かないときは、Supabase の Logs（Auth）と Resend の Logs で、送ったか・断られたかを見る。
