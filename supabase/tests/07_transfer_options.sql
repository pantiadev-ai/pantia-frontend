-- 07 有料オプション（出品者が決める）・銀行振込（運営の口座へ。運営が入金を確かめる）
create function pg_temp.co(p_buyer uuid, p_items jsonb, p_method text default 'transfer') returns text language sql as $f$
  select pg_temp.val(null, 'service_role', format('select public.create_checkout(%L, %L::jsonb, %L, %L::jsonb)::text',
    p_buyer, p_items, p_method, pg_temp.addr()));
$f$;
create function pg_temp.items(variadic p_ids uuid[]) returns jsonb language sql as $f$
  select jsonb_agg(jsonb_build_object('listing_id', x, 'options', '{}'::jsonb)) from unnest(p_ids) x;
$f$;
-- 運営が入金額を入れて確かめる（service_role。サーバーと同じ道）
create function pg_temp.confirm(p_admin uuid, p_group uuid, p_amount integer) returns text language sql as $f$
  select pg_temp.val(null, 'service_role', format('select public.admin_confirm_transfer(%L, %L, %s)::text', p_admin, p_group, p_amount));
$f$;
-- 出品者が有料オプションを書き換える（画面と同じ RLS の道）
create function pg_temp.setopts(p_seller uuid, p_listing uuid, p_opts text) returns text language sql as $f$
  select pg_temp.run(p_seller, 'authenticated', format('update public.listings set paid_options = %L::jsonb where id = %L', p_opts, p_listing));
$f$;

do $t$
declare
  adm uuid; s1 uuid; s2 uuid; b1 uuid; b2 uuid; b3 uuid; b4 uuid;
  l1 uuid; l2 uuid; l3 uuid; l4 uuid; l5 uuid; ld uuid;
  g1 uuid; g2 uuid; g3 uuid; g4 uuid; g5 uuid;
  o1 uuid; o4 uuid; o5 uuid;
  code text; r text; j jsonb; n integer;
  opts constant text := '[{"id":"a1","name":"着用写真集","price":1500},{"id":"b2","name":"おな動画","price":3000}]';
begin
  adm := pg_temp.mkuser('運営', 'buyer');
  insert into public.admin_users (user_id) values (adm);
  s1 := pg_temp.mkuser('みさき', 'seller');
  s2 := pg_temp.mkuser('ゆい', 'seller');
  b1 := pg_temp.mkuser('たろう', 'buyer');
  b2 := pg_temp.mkuser('じろう', 'buyer');
  b3 := pg_temp.mkuser('さぶろう', 'buyer');
  b4 := pg_temp.mkuser('しろう', 'buyer');
  l1 := pg_temp.listing(s1);
  l2 := pg_temp.listing(s1);
  l3 := pg_temp.listing(s2);
  l4 := pg_temp.listing(s2);
  l5 := pg_temp.listing(s2);
  ld := pg_temp.listing(s1, 'draft');

  -- 有料オプション: 出品者が書く ----------------------------------------------
  perform pg_temp.chk('P01 出品者は有料オプションを入れられる', pg_temp.setopts(s1, l1, opts) = 'ok', pg_temp.setopts(s1, l1, opts));
  perform pg_temp.eq('P02 入れた物が読める（誰でも）', null, 'anon',
    format('select jsonb_array_length(paid_options)::text from public.listings where id = %L', l1), '2');
  perform pg_temp.chk('P03 他人の出品には入れられない（0件の更新）', pg_temp.setopts(s2, l2, opts) = 'ok'
    and (select paid_options from public.listings where id = l2) = '[]'::jsonb, '');
  perform pg_temp.chk('P04 11件は断る', pg_temp.setopts(s1, l2,
    (select jsonb_agg(jsonb_build_object('id', 'x' || i, 'name', '名前' || i, 'price', 100))::text from generate_series(1, 11) i)) like 'ERR %paid_options_ok%', '');
  perform pg_temp.chk('P05 10件は通る', pg_temp.setopts(s1, l2,
    (select jsonb_agg(jsonb_build_object('id', 'x' || i, 'name', '名前' || i, 'price', 100))::text from generate_series(1, 10) i)) = 'ok', '');
  perform pg_temp.chk('P06 100円より安いのは断る', pg_temp.setopts(s1, l2, '[{"id":"a","name":"x","price":0}]') like 'ERR %paid_options_ok%', '');
  perform pg_temp.chk('P07 100円単位でないのは断る', pg_temp.setopts(s1, l2, '[{"id":"a","name":"x","price":150}]') like 'ERR %paid_options_ok%', '');
  perform pg_temp.chk('P08 50,000円を超えるのは断る', pg_temp.setopts(s1, l2, '[{"id":"a","name":"x","price":50100}]') like 'ERR %paid_options_ok%', '');
  perform pg_temp.chk('P09 50,000円ちょうどは通る', pg_temp.setopts(s1, l2, '[{"id":"a","name":"x","price":50000}]') = 'ok', '');
  perform pg_temp.chk('P10 小数は断る', pg_temp.setopts(s1, l2, '[{"id":"a","name":"x","price":100.5}]') like 'ERR %paid_options_ok%', '');
  perform pg_temp.chk('P11 料金が文字なら断る', pg_temp.setopts(s1, l2, '[{"id":"a","name":"x","price":"1000"}]') like 'ERR %paid_options_ok%', '');
  perform pg_temp.chk('P12 id の重なりは断る', pg_temp.setopts(s1, l2, '[{"id":"a","name":"x","price":100},{"id":"a","name":"y","price":100}]') like 'ERR %paid_options_ok%', '');
  perform pg_temp.chk('P13 決まっていないキーは断る', pg_temp.setopts(s1, l2, '[{"id":"a","name":"x","price":100,"url":"https://x"}]') like 'ERR %paid_options_ok%', '');
  perform pg_temp.chk('P14 名前が無いのは断る', pg_temp.setopts(s1, l2, '[{"id":"a","price":100,"x":1}]') like 'ERR %paid_options_ok%', '');
  perform pg_temp.chk('P15 名前の前後の空白は断る', pg_temp.setopts(s1, l2, '[{"id":"a","name":" x","price":100}]') like 'ERR %paid_options_ok%', '');
  perform pg_temp.chk('P16 31文字の名前は断る', pg_temp.setopts(s1, l2, jsonb_build_array(jsonb_build_object('id', 'a', 'name', repeat('あ', 31), 'price', 100))::text) like 'ERR %paid_options_ok%', '');
  perform pg_temp.chk('P17 名前の制御文字は断る', pg_temp.setopts(s1, l2, jsonb_build_array(jsonb_build_object('id', 'a', 'name', 'a' || chr(10) || 'b', 'price', 100))::text) like 'ERR %paid_options_ok%', '');
  perform pg_temp.chk('P18 id の大文字・記号は断る', pg_temp.setopts(s1, l2, '[{"id":"A-1","name":"x","price":100}]') like 'ERR %paid_options_ok%', '');
  perform pg_temp.chk('P19 並びでないのは断る', pg_temp.setopts(s1, l2, '{"id":"a","name":"x","price":100}') like 'ERR %paid_options_ok%', '');
  perform pg_temp.chk('P20 中に null は断る', pg_temp.setopts(s1, l2, '[null]') like 'ERR %paid_options_ok%', '');
  perform pg_temp.chk('P21 空の並びに戻せる', pg_temp.setopts(s1, l2, '[]') = 'ok', '');

  -- 有料オプション: 見積もり ----------------------------------------------------
  perform pg_temp.eq('Q01 2つ選ぶと合計に足される（3000+1500+3000）', null, 'anon',
    format('select (public.quote_listing(%L, %L::jsonb) ->> %L)', l1, '{"extras":["a1","b2"]}', 'total'), '7500');
  perform pg_temp.eq('Q02 写しは出品の順（選んだ順ではない）', null, 'anon',
    format('select (public.quote_listing(%L, %L::jsonb) -> %L -> 0 ->> %L)', l1, '{"extras":["b2","a1"]}', 'extras', 'name'), '着用写真集');
  perform pg_temp.eq('Q03 有料オプションの合計', null, 'anon',
    format('select (public.quote_listing(%L, %L::jsonb) ->> %L)', l1, '{"extras":["b2"]}', 'extras_fee'), '3000');
  perform pg_temp.ng('Q04 出品に無い id は断る', null, 'anon',
    format('select public.quote_listing(%L, %L::jsonb)', l1, '{"extras":["zz"]}'), 'pantia:bad_options');
  perform pg_temp.ng('Q05 同じ id を2回は断る', null, 'anon',
    format('select public.quote_listing(%L, %L::jsonb)', l1, '{"extras":["a1","a1"]}'), 'pantia:bad_options');
  perform pg_temp.ng('Q06 並びでないのは断る', null, 'anon',
    format('select public.quote_listing(%L, %L::jsonb)', l1, '{"extras":"a1"}'), 'pantia:bad_options');
  perform pg_temp.ng('Q07 文字でない id は断る', null, 'anon',
    format('select public.quote_listing(%L, %L::jsonb)', l1, '{"extras":[1]}'), 'pantia:bad_options');
  perform pg_temp.ng('Q08 11件以上は断る', null, 'anon',
    format('select public.quote_listing(%L, %L::jsonb)', l1, '{"extras":["a","b","c","d","e","f","g","h","i","j","k"]}'), 'pantia:bad_options');
  perform pg_temp.eq('Q09 extras が null なら付けないのと同じ', null, 'anon',
    format('select (public.quote_listing(%L, %L::jsonb) ->> %L)', l1, '{"extras":null}', 'total'), '3000');
  perform pg_temp.eq('Q10 何も選ばなければ今までどおり', null, 'anon',
    format('select (public.quote_listing(%L, %L::jsonb) ->> %L)', l1, '{}', 'total'), '3000');

  -- 振込の受付と振込先（管理画面） -----------------------------------------------
  perform pg_temp.chk('T01 受付がオフなら振込では買えない', pg_temp.co(b1, pg_temp.items(l1)) like 'ERR pantia:bad_method%', pg_temp.co(b1, pg_temp.items(l1)));
  perform pg_temp.ng('T02 振込先が空のまま受付をオンにはできない', null, 'service_role',
    format('select public.admin_update_settings(%L, %L::jsonb)', adm, '{"transfer_enabled":true}'), 'pantia:transfer_incomplete');
  perform pg_temp.ng('T03 管理者でなければ振込先を変えられない', null, 'service_role',
    format('select public.admin_update_settings(%L, %L::jsonb)', b1, '{"transfer_bank":"テスト銀行"}'), 'pantia:not_admin');
  perform pg_temp.ng('T04 口座番号は7桁の数字だけ', null, 'service_role',
    format('select public.admin_update_settings(%L, %L::jsonb)', adm, '{"transfer_number":"12345"}'), 'transfer_number');
  perform pg_temp.ng('T05 種別は普通・当座だけ', null, 'service_role',
    format('select public.admin_update_settings(%L, %L::jsonb)', adm, '{"transfer_type":"savings"}'), 'transfer_type');
  perform pg_temp.ok('T06 振込先を全部入れて受付をオンにできる', null, 'service_role',
    format('select public.admin_update_settings(%L, %L::jsonb)', adm,
      '{"transfer_enabled":true,"transfer_bank":"テスト銀行","transfer_branch":"本店","transfer_type":"ordinary","transfer_number":"1234567","transfer_holder":"カ）パンティア"}'));
  perform pg_temp.chk('T07 監査ログに口座番号を残さない（変えた印だけ）',
    (select detail::text not like '%1234567%' and detail ->> 'transfer_number' = 'changed' and detail ->> 'transfer_bank' = 'テスト銀行'
       from public.audit_logs where action = 'settings.update' order by id desc limit 1), '');
  perform pg_temp.ng('T08 ログイン済みの利用者は口座番号を読めない', b1, 'authenticated',
    'select transfer_number from public.site_settings', 'permission denied');
  perform pg_temp.ng('T09 匿名は振込先を読めない', null, 'anon',
    'select transfer_bank from public.site_settings', 'permission denied');
  perform pg_temp.ok('T10 ほかの設定は今までどおり読める', null, 'anon', 'select fee_rate, video_fee from public.site_settings');

  -- 振込で買う --------------------------------------------------------------------
  r := pg_temp.co(b1, jsonb_build_array(jsonb_build_object('listing_id', l1, 'options', '{"extras":["a1"]}'::jsonb)));
  perform pg_temp.chk('T11 振込で買える（3000+1500）', r not like 'ERR%' and (r::jsonb ->> 'total') = '4500', r);
  g1 := (r::jsonb ->> 'group_id')::uuid;
  code := r::jsonb ->> 'transfer_code';
  select id into o1 from public.orders where group_id = g1;
  perform pg_temp.chk('T12 振込名義の番号は英字1字＋数字5桁', code ~ '^[A-HJ-NP-Z][0-9]{5}$', coalesce(code, 'null'));
  perform pg_temp.eq('T13 入金待ちで、期限は72時間・注文に番号を結ぶ', null, 'postgres',
    format('select status || %L || (expires_at = now() + interval %L)::text || %L || payment_ref from public.orders where id = %L', '/', '72 hours', '/', o1),
    'pending/true/transfer:' || code);
  perform pg_temp.eq('T14 有料オプションも手数料の対象（4500の15%）', null, 'postgres',
    format('select extras_fee || %L || subtotal || %L || fee || %L || seller_net || %L || (options -> %L -> 0 ->> %L) from public.orders where id = %L',
      '/', '/', '/', '/', 'extras', 'name', o1), '1500/4500/675/3825/着用写真集');
  perform pg_temp.eq('T15 振込の行（請求額）', null, 'postgres',
    format('select amount || %L || buyer_id::text from public.bank_transfers where group_id = %L', '/', g1), '4500/' || b1::text);
  perform pg_temp.chk('T16 振込の案内が届く（番号・金額・振込先。商品名は載せない）',
    (select title like 'お振込のご案内（%まで）' and body like '%' || code || '＋お名前%' and body like '%4,500円%'
            and body like '%テスト銀行 本店 普通 1234567 カ）パンティア%' and body not like '%テスト商品%'
            and link = '/checkout/transfer?group=' || g1::text and kind = 'order'
       from public.notifications where user_id = b1 and link like '/checkout/transfer%' limit 1), '');
  perform pg_temp.eq('T17 購入者は自分の振込の行を読める', b1, 'authenticated',
    format('select code from public.bank_transfers where group_id = %L', g1), code);
  perform pg_temp.eq('T18 ほかの人には見えない', b2, 'authenticated',
    format('select count(*)::text from public.bank_transfers where group_id = %L', g1), '0');
  perform pg_temp.ng('T19 確かめた人・入金額の列は利用者に見せない', b1, 'authenticated',
    'select received_amount from public.bank_transfers', 'permission denied');
  perform pg_temp.ng('T20 利用者は振込の行を書けない', b1, 'authenticated',
    format('insert into public.bank_transfers (group_id, code, buyer_id, amount) values (%L, %L, %L, 1)', gen_random_uuid(), 'A00000', b1), 'permission denied');
  perform pg_temp.ng('T21 service_role も直には書けない（関数だけ）', null, 'service_role',
    format('update public.bank_transfers set confirmed_at = now() where group_id = %L', g1), 'permission denied');
  perform pg_temp.eq('T22 入金待ちの1点物は「取引中」（匿名にも）', null, 'anon', format('select public.listing_reserved(%L)::text', l1), 'true');
  perform pg_temp.eq('T23 注文の無い出品は取引中でない', null, 'anon', format('select public.listing_reserved(%L)::text', l2), 'false');
  perform pg_temp.eq('T24 見えない出品（下書き）は false', null, 'anon', format('select public.listing_reserved(%L)::text', ld), 'false');
  perform pg_temp.chk('T25 入金待ちの間、ほかの人は買えない', pg_temp.co(b2, pg_temp.items(l1)) like 'ERR pantia:reserved%', pg_temp.co(b2, pg_temp.items(l1)));

  -- 運営が入金を確かめる ------------------------------------------------------------
  perform pg_temp.ng('T26 画面（ログイン済み）からは呼べない', b1, 'authenticated',
    format('select public.admin_confirm_transfer(%L, %L, 4500)', b1, g1), 'permission denied');
  perform pg_temp.chk('T27 管理者でなければ確かめられない', pg_temp.confirm(b1, g1, 4500) like 'ERR pantia:not_admin%', pg_temp.confirm(b1, g1, 4500));
  perform pg_temp.chk('T28 0円は断る', pg_temp.confirm(adm, g1, 0) like 'ERR pantia:bad_amount%', pg_temp.confirm(adm, g1, 0));
  perform pg_temp.chk('T29 知らない注文は見つからない', pg_temp.confirm(adm, gen_random_uuid(), 4500) like 'ERR pantia:not_found%', '');
  r := pg_temp.confirm(adm, g1, 4000);
  perform pg_temp.chk('T30 金額が違えば確定せず、請求額を返す', r not like 'ERR%' and r::jsonb ->> 'result' = 'amount_mismatch' and r::jsonb ->> 'expected' = '4500', r);
  perform pg_temp.chk('T31 金額違いのあとも入金待ちのまま・確認の印なし',
    (select o.status = 'pending' from public.orders o where o.id = o1)
    and (select t.confirmed_at is null from public.bank_transfers t where t.group_id = g1), '');
  perform pg_temp.chk('T32 金額違いは監査ログに残る',
    exists (select 1 from public.audit_logs where action = 'payment.amount_mismatch' and target_id = g1::text and detail ->> 'received' = '4000')
    and exists (select 1 from public.audit_logs where action = 'transfer.confirm' and target_id = g1::text and detail ->> 'result' = 'amount_mismatch'), '');
  r := pg_temp.confirm(adm, g1, 4500);
  perform pg_temp.chk('T33 正しい金額で確定する', r not like 'ERR%' and r::jsonb ->> 'result' = 'paid', r);
  perform pg_temp.eq('T34 注文は入金確認済み・出品は売り切れ', null, 'postgres',
    format('select o.status || %L || l.status from public.orders o join public.listings l on l.id = o.listing_id where o.id = %L', '/', o1), 'paid/sold');
  perform pg_temp.chk('T35 確認の印（誰が・いくら）',
    (select confirmed_at is not null and confirmed_by = adm and received_amount = 4500 from public.bank_transfers where group_id = g1), '');
  perform pg_temp.chk('T36 出品者へ「入金が確認できました。発送してください」',
    exists (select 1 from public.notifications where user_id = s1 and title = '入金が確認できました。発送してください' and link = '/orders/' || o1::text), '');
  perform pg_temp.chk('T37 購入者へ「お振込を確認しました」',
    exists (select 1 from public.notifications where user_id = b1 and title = 'お振込を確認しました'), '');
  perform pg_temp.chk('T38 2回目は「済み」で、何も変えない',
    pg_temp.confirm(adm, g1, 4500)::jsonb ->> 'result' = 'already'
    and (select count(*) from public.notifications where user_id = s1 and title = '入金が確認できました。発送してください') = 1, '');
  perform pg_temp.eq('T39 売れたあとは取引中でない（売り切れ）', null, 'anon', format('select public.listing_reserved(%L)::text', l1), 'false');
  -- 発送・受取は今までの流れ（入金確認済み → 発送 → 完了で売上が確定）
  perform pg_temp.ok('T40 出品者が追跡番号で発送できる', s1, 'authenticated',
    format('select public.ship_order(%L, %L, %L)', o1, 'yamato', '1234-5678-9012'));
  perform pg_temp.ok('T41 購入者が受け取りで完了できる', b1, 'authenticated', format('select public.complete_order(%L)', o1));
  perform pg_temp.eq('T42 手数料を引いた額が出品者の売上になる', null, 'postgres',
    format('select coalesce(sum(amount), 0)::text from public.ledger_entries where user_id = %L and kind = %L', s1, 'sale'), '3825');

  -- 期限を過ぎてからの振込 ------------------------------------------------------------
  r := pg_temp.co(b2, pg_temp.items(l3));
  g3 := (r::jsonb ->> 'group_id')::uuid;
  update public.orders set expires_at = now() - interval '1 minute' where group_id = g3;
  perform public.cancel_expired_orders();
  perform pg_temp.eq('T43 期限切れで取り消される', null, 'postgres',
    format('select status || %L || cancel_reason from public.orders where group_id = %L', '/', g3), 'cancelled/expired');
  r := pg_temp.confirm(adm, g3, 3000);
  perform pg_temp.chk('T44 まだ売れていなければ生き返る', r::jsonb ->> 'result' = 'revived'
    and (select status from public.orders where group_id = g3) = 'paid', r);

  r := pg_temp.co(b3, pg_temp.items(l4));
  g4 := (r::jsonb ->> 'group_id')::uuid;
  select id into o4 from public.orders where group_id = g4;
  update public.orders set expires_at = now() - interval '1 minute' where group_id = g4;
  perform public.cancel_expired_orders();
  r := pg_temp.co(b4, pg_temp.items(l4), 'mock');
  perform pg_temp.val(null, 'service_role', format('select public.mark_group_paid(%L, %L, 3000)', (r::jsonb ->> 'group_id'), 'pi_x'));
  r := pg_temp.confirm(adm, g4, 3000);
  perform pg_temp.chk('T45 もう売れていたら「返金が要る」に入る', r::jsonb ->> 'result' = 'refund_needed'
    and (select needs_refund and status = 'cancelled' from public.orders where id = o4), r);
  perform pg_temp.chk('T46 返金が要るときも確認の印は付く（一覧から消す）',
    (select confirmed_at is not null from public.bank_transfers where group_id = g4), '');

  -- 振込の返金（手で振り込んだあとの印） --------------------------------------------
  perform pg_temp.ng('T47 画面からは呼べない', b3, 'authenticated',
    format('select public.admin_mark_refunded_manual(%L, %L, %L)', b3, o4, 'x'), 'permission denied');
  perform pg_temp.ng('T48 管理者でなければ印を付けられない', null, 'service_role',
    format('select public.admin_mark_refunded_manual(%L, %L, %L)', b3, o4, 'x'), 'pantia:not_admin');
  perform pg_temp.ng('T49 メモの制御文字は断る', null, 'service_role',
    format('select public.admin_mark_refunded_manual(%L, %L, %L)', adm, o4, 'a' || chr(10) || 'b'), 'pantia:bad_request');
  perform pg_temp.ok('T50 返金済みの印を付けられる', null, 'service_role',
    format('select public.admin_mark_refunded_manual(%L, %L, %L)', adm, o4, '11/2 返金'));
  perform pg_temp.chk('T51 返金済みになり、購入者に知らせる',
    (select not needs_refund and refunded_at is not null and refund_ref = 'manual:11/2 返金' from public.orders where id = o4)
    and exists (select 1 from public.notifications where user_id = b3 and title = 'ご返金の振込が済みました'), '');
  perform pg_temp.ng('T52 2回目は断る', null, 'service_role',
    format('select public.admin_mark_refunded_manual(%L, %L, %L)', adm, o4, ''), 'pantia:bad_state');
  perform pg_temp.ng('T53 振込でない注文には付けられない', null, 'service_role',
    format('select public.admin_mark_refunded_manual(%L, %L, %L)', adm, (select id from public.orders where listing_id = l4 and payment_method = 'mock'), ''), 'pantia:bad_state');

  -- カートに残った古い選択・カード側の通知・受付をオフに戻す -----------------------
  perform pg_temp.chk('T54 出品者が消したオプションを選んだままだと買えない',
    pg_temp.setopts(s2, l5, '[{"id":"c3","name":"綿棒セット","price":2000}]') = 'ok'
    and pg_temp.co(b2, jsonb_build_array(jsonb_build_object('listing_id', l5, 'options', '{"extras":["a1"]}'::jsonb))) like 'ERR pantia:bad_options%', '');
  r := pg_temp.co(b2, jsonb_build_array(jsonb_build_object('listing_id', l5, 'options', '{"extras":["c3"]}'::jsonb)), 'mock');
  g5 := (r::jsonb ->> 'group_id')::uuid;
  select id into o5 from public.orders where group_id = g5;
  perform pg_temp.chk('T55 振込でない注文には振込の行を作らない',
    r::jsonb ->> 'transfer_code' is null and not exists (select 1 from public.bank_transfers where group_id = g5), r);
  perform pg_temp.val(null, 'service_role', format('select public.mark_group_paid(%L, %L, 5000)', g5, 'pi_y'));
  perform pg_temp.chk('T56 カードなどは今までどおり「新しい注文が入りました」',
    exists (select 1 from public.notifications where user_id = s2 and title = '新しい注文が入りました' and link = '/orders/' || o5::text), '');
  perform pg_temp.chk('T57 振込でない注文は確かめられない', pg_temp.confirm(adm, g5, 5000) like 'ERR pantia:not_found%', '');
  perform pg_temp.ok('T58 受付をオフに戻せる（振込先は残る）', null, 'service_role',
    format('select public.admin_update_settings(%L, %L::jsonb)', adm, '{"transfer_enabled":false}'));
  perform pg_temp.chk('T59 オフのあとは振込で買えない', pg_temp.co(b4, pg_temp.items(l2)) like 'ERR pantia:bad_method%', '');
  perform pg_temp.ng('T60 口座番号を空にしたまま受付はオンにできない', null, 'service_role',
    format('select public.admin_update_settings(%L, %L::jsonb)', adm, '{"transfer_enabled":true,"transfer_number":""}'), 'pantia:transfer_incomplete');
end $t$;
