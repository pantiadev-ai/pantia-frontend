-- 02 注文・入金・発送・取引完了・レビュー・取り消し・売上・振込
-- 買う（create_checkout）。結果の json を文字で返す（失敗は 'ERR ...'）
create function pg_temp.co(p_buyer uuid, p_items jsonb, p_method text default 'mock', p_addr jsonb default null) returns text language sql as $f$
  select pg_temp.val(null, 'service_role', format('select public.create_checkout(%L, %L::jsonb, %L, %L::jsonb)::text',
    p_buyer, p_items, p_method, coalesce(p_addr, pg_temp.addr())));
$f$;
-- 出品の id から p_items を作る
create function pg_temp.items(variadic p_ids uuid[]) returns jsonb language sql as $f$
  select jsonb_agg(jsonb_build_object('listing_id', x, 'options', '{}'::jsonb)) from unnest(p_ids) x;
$f$;
-- 入金を確定する（service_role）
create function pg_temp.pay(p_group uuid, p_amount integer, p_ref text default 'pi_test') returns text language sql as $f$
  select pg_temp.val(null, 'service_role', format('select public.mark_group_paid(%L, %L, %s)', p_group, p_ref, p_amount));
$f$;

do $t$
declare
  s1 uuid; s2 uuid; b1 uuid; b2 uuid; b3 uuid; b4 uuid; b5 uuid; b6 uuid; b7 uuid;
  l1 uuid; l2 uuid; l3 uuid; ld uuid; lr uuid; lf uuid; lb uuid; lm uuid; lx uuid; ly uuid; lc uuid; la uuid; lk1 uuid; lk2 uuid;
  g1 uuid; g2 uuid; gx uuid; gy uuid; gc uuid; ga uuid;
  o1 uuid; o2 uuid; ox uuid; oy uuid; oc uuid; oa uuid;
  th uuid;
  r text;
begin
  s1 := pg_temp.mkuser('みさき', 'seller');
  s2 := pg_temp.mkuser('ゆい', 'seller');
  b1 := pg_temp.mkuser('たろう', 'buyer');
  b2 := pg_temp.mkuser('未確認', 'buyer', 'unsubmitted');
  b3 := pg_temp.mkuser('さぶろう', 'buyer');
  b4 := pg_temp.mkuser('しろう', 'buyer');
  b5 := pg_temp.mkuser('ごろう', 'buyer');
  b6 := pg_temp.mkuser('ろくろう', 'buyer');
  b7 := pg_temp.mkuser('ななこ', 'buyer');
  l1 := pg_temp.listing(s1);
  l2 := pg_temp.listing(s1, 'published', 'opt_extend = true, max_worn_days = 4, opt_video = true, anonymous_ok = true');
  l3 := pg_temp.listing(s2);
  ld := pg_temp.listing(s1, 'draft');

  -- 買う: 入口と入力 ---------------------------------------------------------
  perform pg_temp.ng('A01 匿名は買う関数を呼べない', null, 'anon',
    format('select public.create_checkout(%L, %L::jsonb, %L, %L::jsonb)', b1, pg_temp.items(l1), 'mock', pg_temp.addr()), 'permission denied');
  perform pg_temp.ng('A02 画面（ログイン済み）からも直接は呼べない', b1, 'authenticated',
    format('select public.create_checkout(%L, %L::jsonb, %L, %L::jsonb)', b1, pg_temp.items(l1), 'mock', pg_temp.addr()), 'permission denied');
  perform pg_temp.chk('A03 本人確認前の購入者は買えない', pg_temp.co(b2, pg_temp.items(l1)) like 'ERR pantia:not_allowed%', pg_temp.co(b2, pg_temp.items(l1)));
  perform pg_temp.chk('A04 出品者は買えない', pg_temp.co(s2, pg_temp.items(l1)) like 'ERR pantia:not_allowed%', pg_temp.co(s2, pg_temp.items(l1)));
  perform pg_temp.chk('A05 知らない支払い方法は断る', pg_temp.co(b1, pg_temp.items(l1), 'cash') like 'ERR pantia:bad_method%', pg_temp.co(b1, pg_temp.items(l1), 'cash'));
  perform pg_temp.chk('A06 空のカートは断る', pg_temp.co(b1, '[]') like 'ERR pantia:bad_items%', pg_temp.co(b1, '[]'));
  perform pg_temp.chk('A07 11件以上は断る', pg_temp.co(b1, pg_temp.items(l1, l1, l1, l1, l1, l1, l1, l1, l1, l1, l1)) like 'ERR pantia:bad_items%', '');
  perform pg_temp.chk('A08 出品の id の形が違えば断る', pg_temp.co(b1, '[{"listing_id":"abc"}]') like 'ERR pantia:bad_items%', pg_temp.co(b1, '[{"listing_id":"abc"}]'));
  perform pg_temp.chk('A09 電話番号の形が違えば断る', pg_temp.co(b1, pg_temp.items(l1), 'mock', pg_temp.addr() || '{"phone":"123"}') like 'ERR pantia:bad_address%', '');
  perform pg_temp.chk('A10 名前に制御文字があれば断る', pg_temp.co(b1, pg_temp.items(l1), 'mock', pg_temp.addr() || jsonb_build_object('name', 'a' || chr(7))) like 'ERR pantia:bad_address%', '');
  perform pg_temp.chk('A11 下書きは買えない', pg_temp.co(b1, pg_temp.items(ld)) like 'ERR pantia:unavailable%', pg_temp.co(b1, pg_temp.items(ld)));
  update public.site_settings set maintenance = true where id;
  perform pg_temp.chk('A12 メンテナンス中は買えない', pg_temp.co(b1, pg_temp.items(l1)) like 'ERR pantia:maintenance%', pg_temp.co(b1, pg_temp.items(l1)));
  update public.site_settings set maintenance = false where id;

  -- 買う: ふつうの注文 ---------------------------------------------------------
  r := pg_temp.co(b1, pg_temp.items(l1));
  perform pg_temp.chk('A13 買える（合計3000円）', r not like 'ERR%' and (r::jsonb ->> 'total') = '3000', r);
  g1 := (r::jsonb ->> 'group_id')::uuid;
  select id into o1 from public.orders where group_id = g1;
  perform pg_temp.eq('A14 支払い待ちで、期限は30分', null, 'postgres',
    format('select status || %L || (expires_at = now() + interval %L)::text from public.orders where id = %L', '/', '30 minutes', o1), 'pending/true');
  perform pg_temp.eq('A15 手数料15%・出品者の取り分', null, 'postgres',
    format('select fee_rate || %L || fee || %L || seller_net from public.orders where id = %L', '/', '/', o1), '0.150/450/2550');
  perform pg_temp.eq('A16 郵便番号にハイフン・電話は数字だけで保存', null, 'postgres',
    format('select postal || %L || phone from public.order_addresses where order_id = %L', '/', o1), '150-0001/09012345678');
  perform pg_temp.chk('A17 支払い待ちの1点物は他の人が買えない', pg_temp.co(b3, pg_temp.items(l1)) like 'ERR pantia:reserved%', pg_temp.co(b3, pg_temp.items(l1)));
  perform pg_temp.chk('A18 画面から来た金額は使わない', (pg_temp.co(b5, ('[{"listing_id":"' || l3 || '","options":{},"price":1,"total":1}]')::jsonb)::jsonb ->> 'total') = '3000', '');
  -- 付け物つき（延長2日・動画・匿名配送）
  r := pg_temp.co(b4, jsonb_build_array(jsonb_build_object('listing_id', l2, 'options', '{"worn_days":4,"video":true,"anonymous":true,"photo":true}'::jsonb)));
  perform pg_temp.chk('A19 付け物つきの合計（3000+延長1000+動画800+匿名300）', r not like 'ERR%' and (r::jsonb ->> 'total') = '5100', r);
  g2 := (r::jsonb ->> 'group_id')::uuid;
  select id into o2 from public.orders where group_id = g2;
  perform pg_temp.eq('A20 匿名配送料は手数料の対象外', null, 'postgres',
    format('select subtotal || %L || fee || %L || seller_net || %L || anonymous from public.orders where id = %L', '/', '/', '/', o2), '4800/720/4080/true');
  perform pg_temp.chk('A21 出品に無い付け物は断る', pg_temp.co(b5, jsonb_build_array(jsonb_build_object('listing_id', l1, 'options', '{"video":true}'::jsonb))) like 'ERR pantia:bad_options%', '');
  perform pg_temp.chk('A22 上限を超える着用日数は断る', pg_temp.co(b5, jsonb_build_array(jsonb_build_object('listing_id', l2, 'options', '{"worn_days":5}'::jsonb))) like 'ERR pantia:%', '');
  -- 銀行振込は72時間
  lm := pg_temp.listing(s2, 'published', 'stock_mode = ''multiple''');
  r := pg_temp.co(b6, pg_temp.items(lm), 'bank');
  perform pg_temp.eq('A23 銀行振込の期限は72時間', null, 'postgres',
    format('select (expires_at = now() + interval %L)::text from public.orders where group_id = %L', '72 hours', (r::jsonb ->> 'group_id')), 'true');
  -- リクエスト専用
  lr := pg_temp.listing(s1, 'published', 'request_only = true');
  perform pg_temp.chk('A24 リクエスト専用は出品者の返事が無いと買えない', pg_temp.co(b3, pg_temp.items(lr)) like 'ERR pantia:request_only%', pg_temp.co(b3, pg_temp.items(lr)));
  th := pg_temp.val(b3, 'authenticated', format('select public.open_thread(%L)', s1))::uuid;
  perform pg_temp.ok('A25 購入者から話しかける', b3, 'authenticated', format('select public.send_message(%L, %L)', th, 'このパンティほしいです'));
  perform pg_temp.chk('A26 購入者の文だけではまだ買えない', pg_temp.co(b3, pg_temp.items(lr)) like 'ERR pantia:request_only%', '');
  perform pg_temp.ok('A27 出品者が返事をする', s1, 'authenticated', format('select public.send_message(%L, %L)', th, 'どうぞ'));
  perform pg_temp.chk('A28 返事のあとは買える', pg_temp.co(b3, pg_temp.items(lr)) not like 'ERR%', pg_temp.co(b3, pg_temp.items(lr)));
  -- フォロワー限定・ブロック
  lf := pg_temp.listing(s2, 'published', 'followers_only = true');
  perform pg_temp.chk('A29 フォロワー限定はフォローしていないと買えない', pg_temp.co(b5, pg_temp.items(lf)) like 'ERR pantia:unavailable%', '');
  perform pg_temp.ok('A30 フォローする', b5, 'authenticated', format('insert into public.follows (seller_id) values (%L)', s2));
  perform pg_temp.chk('A31 フォローしたら買える', pg_temp.co(b5, pg_temp.items(lf)) not like 'ERR%', pg_temp.co(b5, pg_temp.items(lf)));
  lb := pg_temp.listing(s2);
  perform pg_temp.ok('A32 出品者が購入者をブロック', s2, 'authenticated', format('insert into public.blocks (blocked_id) values (%L)', b7));
  perform pg_temp.chk('A33 ブロックされていると買えない', pg_temp.co(b7, pg_temp.items(lb)) like 'ERR pantia:unavailable%', '');
  perform pg_temp.ok('A34 ブロックを外す', s2, 'authenticated', format('delete from public.blocks where blocked_id = %L', b7));
  -- まとめ買い・支払い待ちの数
  lk1 := pg_temp.listing(s2, 'published', 'stock_mode = ''multiple''');
  lk2 := pg_temp.listing(s1, 'published', 'stock_mode = ''multiple''');
  r := pg_temp.co(b7, pg_temp.items(lk1, lk2));
  perform pg_temp.eq('A35 まとめ買いは同じ group で2件', null, 'postgres',
    format('select count(*)::text || %L || sum(total) from public.orders where group_id = %L', '/', (r::jsonb ->> 'group_id')), '2/6000');
  perform pg_temp.chk('A36 在庫ありの出品は何人でも支払い待ちにできる', pg_temp.co(b7, pg_temp.items(lk1)) not like 'ERR%', '');
  perform pg_temp.chk('A37 3件目まで支払い待ちにできる', pg_temp.co(b7, pg_temp.items(lk1)) not like 'ERR%', '');
  perform pg_temp.chk('A38 支払い待ちは3件まで', pg_temp.co(b7, pg_temp.items(lk1)) like 'ERR pantia:too_many_pending%', pg_temp.co(b7, pg_temp.items(lk1)));

  -- 読める範囲 ----------------------------------------------------------------
  perform pg_temp.eq('R01 購入者は自分の注文を読める', b1, 'authenticated', format('select count(*)::text from public.orders where id = %L', o1), '1');
  perform pg_temp.eq('R02 出品者は自分への注文を読める', s1, 'authenticated', format('select count(*)::text from public.orders where id = %L', o1), '1');
  perform pg_temp.eq('R03 関係ない購入者は読めない', b3, 'authenticated', format('select count(*)::text from public.orders where id = %L', o1), '0');
  perform pg_temp.ng('R04 決済会社の番号は画面から読めない', b1, 'authenticated', format('select payment_ref from public.orders where id = %L', o1), 'permission denied');
  perform pg_temp.ng('R05 匿名は注文を読めない', null, 'anon', 'select count(*) from public.orders', 'permission denied');
  perform pg_temp.ng('R06 注文は画面から作れない', b1, 'authenticated',
    format('insert into public.orders (group_id, buyer_id, seller_id, listing_id, title, category, base_price, worn_days, subtotal, total, fee_rate, fee, seller_net, single_stock, payment_method, expires_at) values (gen_random_uuid(), %L, %L, %L, %L, %L, 1, 1, 1, 1, 0, 0, 1, true, %L, now())', b1, s1, l1, 'x', 'panty', 'mock'), 'permission denied');
  perform pg_temp.ng('R07 注文の状態は画面から変えられない', b1, 'authenticated', format('update public.orders set status = %L where id = %L', 'paid', o1), 'permission denied');
  perform pg_temp.eq('R08 支払い前は出品者に住所を見せない', s1, 'authenticated', format('select count(*)::text from public.order_addresses where order_id = %L', o1), '0');
  perform pg_temp.eq('R09 購入者は自分の住所を読める', b1, 'authenticated', format('select count(*)::text from public.order_addresses where order_id = %L', o1), '1');
  perform pg_temp.eq('R10 関係ない人は住所を読めない', b3, 'authenticated', format('select count(*)::text from public.order_addresses where order_id = %L', o1), '0');

  -- 入金の確定 ----------------------------------------------------------------
  perform pg_temp.ok('M00 カートに入れておく（入金で消えるかを見る）', b1, 'authenticated', format('insert into public.cart_items (listing_id) values (%L)', l1));
  perform pg_temp.ng('M01 画面から入金済みにはできない', b1, 'authenticated', format('select public.mark_group_paid(%L, %L, 3000)', g1, 'x'), 'permission denied');
  perform pg_temp.chk('M02 金額が違えば確定しない', pg_temp.pay(g1, 2999) = 'amount_mismatch', pg_temp.pay(g1, 2999));
  perform pg_temp.eq('M03 金額が違うときは支払い待ちのまま', null, 'postgres', format('select status from public.orders where id = %L', o1), 'pending');
  perform pg_temp.eq('M04 金額の食い違いは監査ログに残る', null, 'postgres',
    format('select (count(*) > 0)::text from public.audit_logs where action = %L and target_id = %L', 'payment.amount_mismatch', g1), 'true');
  perform pg_temp.chk('M05 正しい金額で確定する', pg_temp.pay(g1, 3000, 'pi_1') = 'paid', '');
  perform pg_temp.eq('M06 状態は新規注文・決済番号つき', null, 'postgres', format('select status || %L || payment_ref from public.orders where id = %L', '/', o1), 'paid/pi_1');
  perform pg_temp.eq('M07 1点物は売り切れになる', null, 'postgres', format('select status || %L || sales_count from public.listings where id = %L', '/', l1), 'sold/1');
  perform pg_temp.eq('M08 購入数が増える', null, 'postgres', format('select purchase_count::text from public.profiles where id = %L', b1), '1');
  perform pg_temp.eq('M09 カートから消える', null, 'postgres', format('select count(*)::text from public.cart_items where user_id = %L', b1), '0');
  perform pg_temp.eq('M10 出品者と購入者に通知', null, 'postgres',
    format('select count(*)::text from public.notifications where kind = %L and link = %L', 'order', '/orders/' || o1), '2');
  perform pg_temp.eq('M11 スレッドに決済完了のお知らせ', null, 'postgres',
    format('select count(*)::text from public.messages where order_id = %L and kind = %L', o1, 'system'), '1');
  perform pg_temp.eq('M12 入金は監査ログに残る', null, 'postgres',
    format('select count(*)::text from public.audit_logs where action = %L and target_id = %L', 'order.paid', o1), '1');
  perform pg_temp.chk('M13 同じ通知が2回来ても1回分だけ', pg_temp.pay(g1, 3000, 'pi_1') = 'already', pg_temp.pay(g1, 3000, 'pi_1'));
  perform pg_temp.eq('M14 2回目で販売数は増えない', null, 'postgres', format('select sales_count::text from public.listings where id = %L', l1), '1');
  perform pg_temp.chk('M15 知らない group は not_found', pg_temp.pay(gen_random_uuid(), 3000) = 'not_found', '');
  perform pg_temp.eq('M16 支払い後は出品者に住所を見せる', s1, 'authenticated', format('select count(*)::text from public.order_addresses where order_id = %L', o1), '1');
  perform pg_temp.chk('M17 匿名配送の注文も確定できる', pg_temp.pay(g2, 5100) = 'paid', '');
  perform pg_temp.eq('M18 匿名配送は支払い後も出品者に住所を見せない', s1, 'authenticated', format('select count(*)::text from public.order_addresses where order_id = %L', o2), '0');

  -- 期限切れ・遅れた入金 ------------------------------------------------------
  lx := pg_temp.listing(s2);
  gx := (pg_temp.co(b6, pg_temp.items(lx))::jsonb ->> 'group_id')::uuid;
  select id into ox from public.orders where group_id = gx;
  update public.orders set expires_at = now() - interval '1 minute' where id = ox;
  perform pg_temp.ng('E01 期限切れの取り消しは画面から呼べない', b1, 'authenticated', 'select count(*) from public.cancel_expired_orders()', 'permission denied');
  perform pg_temp.eq('E02 期限切れを取り消す（決済番号も返す）', null, 'service_role',
    format('select count(*)::text from public.cancel_expired_orders() where group_id = %L', gx), '1');
  perform pg_temp.eq('E03 取り消しの理由は expired', null, 'postgres', format('select status || %L || cancel_reason from public.orders where id = %L', '/', ox), 'cancelled/expired');
  perform pg_temp.chk('E04 期限切れのあとでも売れていなければ生き返らせる', pg_temp.pay(gx, 3000, 'pi_late') = 'revived', pg_temp.pay(gx, 3000, 'pi_late'));
  perform pg_temp.eq('E05 生き返った注文は新規注文', null, 'postgres', format('select status || %L || coalesce(cancel_reason, %L) from public.orders where id = %L', '/', '-', ox), 'paid/-');
  ly := pg_temp.listing(s2);
  gy := (pg_temp.co(b6, pg_temp.items(ly))::jsonb ->> 'group_id')::uuid;
  select id into oy from public.orders where group_id = gy;
  update public.orders set expires_at = now() - interval '1 minute' where id = oy;
  perform count(*) from public.cancel_expired_orders();
  perform pg_temp.chk('E06 期限切れのあと別の人が支払い待ちにできる', pg_temp.co(b5, pg_temp.items(ly)) not like 'ERR%', '');
  perform pg_temp.chk('E07 もう押さえられていたら返金が要る', pg_temp.pay(gy, 3000, 'pi_late2') = 'refund_needed', '');
  perform pg_temp.eq('E08 返金待ちの印・取り消しのまま', null, 'postgres', format('select status || %L || needs_refund from public.orders where id = %L', '/', oy), 'cancelled/true');
  perform pg_temp.ng('E09 返金済みの印は画面から付けられない', b6, 'authenticated', format('select public.mark_refunded(%L, %L)', oy, 're_1'), 'permission denied');
  perform pg_temp.ok('E10 返金済みにする', null, 'service_role', format('select public.mark_refunded(%L, %L)', oy, 're_1'));
  perform pg_temp.eq('E11 返金の日時が残る', null, 'postgres', format('select needs_refund || %L || (refunded_at is not null) from public.orders where id = %L', '/', oy), 'false/true');
  perform pg_temp.chk('E12 返金のあとに同じ通知が来ても、もう一度返金にはしない', pg_temp.pay(gy, 3000, 'pi_late2') = 'already', pg_temp.pay(gy, 3000, 'pi_late2'));

  -- 発送・取引完了 ------------------------------------------------------------
  perform pg_temp.ng('W01 別の出品者は発送準備にできない', s2, 'authenticated', format('select public.prepare_order(%L)', o1), 'bad_state');
  perform pg_temp.ng('W02 購入者は発送準備にできない', b1, 'authenticated', format('select public.prepare_order(%L)', o1), 'bad_state');
  perform pg_temp.ng('W03 発送前は受け取りにできない', b1, 'authenticated', format('select public.complete_order(%L)', o1), 'bad_state');
  perform pg_temp.ok('W04 出品者は発送準備にできる', s1, 'authenticated', format('select public.prepare_order(%L)', o1));
  perform pg_temp.ng('W05 追跡番号の形が違えば断る', s1, 'authenticated', format('select public.ship_order(%L, %L, %L)', o1, 'yamato', 'ab'), 'bad_tracking');
  perform pg_temp.ng('W06 知らない運送会社は断る', s1, 'authenticated', format('select public.ship_order(%L, %L, %L)', o1, 'fedex', '12345678'), 'bad_tracking');
  perform pg_temp.ok('W07 発送できる', s1, 'authenticated', format('select public.ship_order(%L, %L, %L)', o1, 'yamato', 'abcd-1234'));
  perform pg_temp.eq('W08 追跡番号は大文字で保存', null, 'postgres', format('select status || %L || tracking_no from public.orders where id = %L', '/', o1), 'shipped/ABCD-1234');
  perform pg_temp.eq('W09 スレッドに発送のお知らせ（送り主は出品者）', null, 'postgres',
    format('select count(*)::text from public.messages where order_id = %L and kind = %L and sender_id = %L', o1, 'shipping', s1), '1');
  perform pg_temp.ng('W10 発送後は出品者が取り消せない', s1, 'authenticated', format('select public.seller_cancel_order(%L, %L)', o1, '都合'), 'bad_state');
  perform pg_temp.ng('W11 出品者は受け取りにできない', s1, 'authenticated', format('select public.complete_order(%L)', o1), 'bad_state');
  perform pg_temp.ng('W12 関係ない購入者は受け取りにできない', b3, 'authenticated', format('select public.complete_order(%L)', o1), 'bad_state');
  perform pg_temp.ok('W13 購入者が受け取る', b1, 'authenticated', format('select public.complete_order(%L)', o1));
  perform pg_temp.eq('W14 売上が出品者の残高に入る', s1, 'authenticated', 'select public.my_balance()::text', '2550');
  perform pg_temp.eq('W15 出品者の販売数が増える', null, 'postgres', format('select sales_count::text from public.profiles where id = %L', s1), '1');
  perform pg_temp.ng('W16 2回目の受け取りは断る', b1, 'authenticated', format('select public.complete_order(%L)', o1), 'bad_state');
  perform pg_temp.eq('W17 売上は1回だけ', null, 'postgres', format('select count(*)::text from public.ledger_entries where order_id = %L', o1), '1');
  perform pg_temp.eq('W18 他人の台帳は読めない', b1, 'authenticated', 'select count(*)::text from public.ledger_entries', '0');
  perform pg_temp.eq('W19 取引が終わったら出品者に住所を見せない', s1, 'authenticated', format('select count(*)::text from public.order_addresses where order_id = %L', o1), '0');
  perform pg_temp.eq('W20 完了は監査ログに残る（購入者）', null, 'postgres',
    format('select count(*)::text from public.audit_logs where action = %L and target_id = %L and actor_id = %L', 'order.complete', o1, b1), '1');

  -- レビュー ------------------------------------------------------------------
  perform pg_temp.ng('V01 関係ない人はレビューできない', b3, 'authenticated', format('select public.post_review(%L, 5, %L)', o1, 'x'), 'bad_state');
  perform pg_temp.ng('V02 星は1〜5', b1, 'authenticated', format('select public.post_review(%L, 6, %L)', o1, 'x'), 'bad_review');
  perform pg_temp.ng('V03 取引完了前はレビューできない', b4, 'authenticated', format('select public.post_review(%L, 5, %L)', o2, 'x'), 'bad_state');
  perform pg_temp.ok('V04 購入者はレビューできる', b1, 'authenticated', format('select public.post_review(%L, 5, %L)', o1, 'ありがとうございました'));
  perform pg_temp.eq('V05 出品者の評価に入る', null, 'postgres', format('select rating_sum || %L || rating_count from public.profiles where id = %L', '/', s1), '5/1');
  perform pg_temp.ng('V06 2回目は断る', b1, 'authenticated', format('select public.post_review(%L, 4, %L)', o1, 'x'), 'already_reviewed');
  perform pg_temp.eq('V07 レビューは誰でも読める', null, 'anon', format('select count(*)::text from public.reviews where seller_id = %L', s1), '1');
  perform pg_temp.ng('V08 レビューは画面から直接書けない', b1, 'authenticated',
    format('insert into public.reviews (order_id, seller_id, buyer_id, title, category, rating) values (%L, %L, %L, %L, %L, 5)', o1, s1, b1, 'x', 'panty'), 'permission denied');
  perform pg_temp.eq('V09 出品者に通知', null, 'postgres', format('select count(*)::text from public.notifications where user_id = %L and kind = %L', s1, 'review'), '1');

  -- 出品者の取り消し ----------------------------------------------------------
  lc := pg_temp.listing(s1);
  gc := (pg_temp.co(b4, pg_temp.items(lc))::jsonb ->> 'group_id')::uuid;
  select id into oc from public.orders where group_id = gc;
  perform pg_temp.pay(gc, 3000);
  perform pg_temp.ng('K01 購入者は出品者の取り消しを使えない', b4, 'authenticated', format('select public.seller_cancel_order(%L, %L)', oc, 'x'), 'bad_state');
  perform pg_temp.ng('K02 理由が空なら断る', s1, 'authenticated', format('select public.seller_cancel_order(%L, %L)', oc, '  '), 'bad_reason');
  perform pg_temp.ok('K03 出品者は発送前に取り消せる', s1, 'authenticated', format('select public.seller_cancel_order(%L, %L)', oc, '汚してしまいました'));
  perform pg_temp.eq('K04 取り消し・返金待ち', null, 'postgres', format('select status || %L || needs_refund from public.orders where id = %L', '/', oc), 'cancelled/true');
  perform pg_temp.eq('K05 売り切れの出品は非公開に戻る', null, 'postgres', format('select status || %L || sales_count from public.listings where id = %L', '/', lc), 'private/0');
  perform pg_temp.eq('K06 購入数を戻す', null, 'postgres', format('select purchase_count::text from public.profiles where id = %L', b4), '1');
  perform pg_temp.eq('K07 取り消しは監査ログに残る', null, 'postgres',
    format('select count(*)::text from public.audit_logs where action = %L and target_id = %L', 'order.seller_cancel', oc), '1');
  perform pg_temp.ng('K08 2回目は断る', s1, 'authenticated', format('select public.seller_cancel_order(%L, %L)', oc, 'x'), 'bad_state');
  perform pg_temp.eq('K09 購入者に通知', null, 'postgres',
    format('select count(*)::text from public.notifications where user_id = %L and link = %L and title = %L', b4, '/orders/' || oc, '注文がキャンセルされました'), '1');
  perform pg_temp.chk('K10 取り消し後に入金の通知が来ても確定しない', pg_temp.pay(gc, 3000) = 'already', pg_temp.pay(gc, 3000));

  -- 自動の取引完了 ------------------------------------------------------------
  la := pg_temp.listing(s1);
  ga := (pg_temp.co(b6, pg_temp.items(la))::jsonb ->> 'group_id')::uuid;
  select id into oa from public.orders where group_id = ga;
  perform pg_temp.pay(ga, 3000);
  perform pg_temp.ok('U00 支払い済みから直接発送できる', s1, 'authenticated', format('select public.ship_order(%L, %L, %L)', oa, 'japanpost', '123456789012'));
  update public.orders set shipped_at = now() - interval '8 days' where id = oa;
  perform pg_temp.ng('U01 自動完了は画面から呼べない', s1, 'authenticated', 'select public.auto_complete_orders()', 'permission denied');
  perform pg_temp.eq('U02 発送から7日を過ぎたら自動で完了', null, 'service_role', 'select public.auto_complete_orders()::text', '1');
  perform pg_temp.eq('U03 自動完了の印', null, 'postgres', format('select status || %L || auto_completed from public.orders where id = %L', '/', oa), 'completed/true');
  perform pg_temp.eq('U04 売上が足される', s1, 'authenticated', 'select public.my_balance()::text', '5100');
  perform pg_temp.eq('U05 購入者に自動完了の通知', null, 'postgres',
    format('select count(*)::text from public.notifications where user_id = %L and title = %L', b6, '取引が自動で完了しました'), '1');
  perform pg_temp.eq('U06 自動完了の監査ログは操作した人なし', null, 'postgres',
    format('select count(*)::text from public.audit_logs where action = %L and target_id = %L and actor_id is null', 'order.complete', oa), '1');
  perform pg_temp.eq('U07 まだ7日たっていない注文は残す', null, 'service_role', 'select public.auto_complete_orders()::text', '0');

  -- 振込口座・振込申請 --------------------------------------------------------
  perform pg_temp.ng('Y01 購入者は振込口座を登録できない', b1, 'authenticated',
    format('insert into public.bank_accounts (bank_name, branch_name, account_type, account_number, holder_kana) values (%L, %L, %L, %L, %L)', 'A銀行', '本店', 'ordinary', '1234567', 'ヤマダ'), 'row-level security');
  perform pg_temp.ng('Y02 口座番号は7桁', s1, 'authenticated',
    format('insert into public.bank_accounts (bank_name, branch_name, account_type, account_number, holder_kana) values (%L, %L, %L, %L, %L)', 'A銀行', '本店', 'ordinary', '123', 'ヤマダ'), 'check');
  perform pg_temp.ng('Y03 名義はカタカナ', s1, 'authenticated',
    format('insert into public.bank_accounts (bank_name, branch_name, account_type, account_number, holder_kana) values (%L, %L, %L, %L, %L)', 'A銀行', '本店', 'ordinary', '1234567', 'yamada'), 'check');
  perform pg_temp.ok('Y04 出品者は口座を登録できる', s1, 'authenticated',
    format('insert into public.bank_accounts (bank_name, branch_name, account_type, account_number, holder_kana) values (%L, %L, %L, %L, %L)', 'A銀行', '渋谷支店', 'ordinary', '1234567', 'ヤマダ ハナコ'));
  perform pg_temp.ng('Y05 他人の id では登録できない', s2, 'authenticated',
    format('insert into public.bank_accounts (user_id, bank_name, branch_name, account_type, account_number, holder_kana) values (%L, %L, %L, %L, %L, %L)', s1, 'A', 'B', 'ordinary', '1234567', 'ヤマダ'), 'permission denied');
  perform pg_temp.eq('Y06 他人の口座は読めない', s2, 'authenticated', 'select count(*)::text from public.bank_accounts', '0');
  perform pg_temp.ng('Y07 購入者は振込申請できない', b1, 'authenticated', 'select public.request_payout(3000)', 'not_allowed');
  perform pg_temp.ng('Y08 口座が無いと申請できない', s2, 'authenticated', 'select public.request_payout(3000)', 'no_bank');
  perform pg_temp.ng('Y09 最低額より少ないと申請できない', s1, 'authenticated', 'select public.request_payout(2999)', 'below_min');
  perform pg_temp.ng('Y10 残高より多いと申請できない', s1, 'authenticated', 'select public.request_payout(6000)', 'over_balance');
  perform pg_temp.ok('Y11 申請できる', s1, 'authenticated', 'select public.request_payout(3000)');
  perform pg_temp.eq('Y12 申請した分が残高から引かれる', s1, 'authenticated', 'select public.my_balance()::text', '2100');
  perform pg_temp.eq('Y13 申請は口座の下4桁だけ見せる', s1, 'authenticated', 'select status || ''/'' || account_last4 || ''/'' || net from public.payouts', 'requested/4567/3000');
  perform pg_temp.ng('Y14 口座番号の全桁は画面から読めない', s1, 'authenticated', 'select account_number from public.payouts', 'permission denied');
  perform pg_temp.ng('Y15 申請中は2件目を出せない', s1, 'authenticated', 'select public.request_payout(2000)', 'payout_open');
  perform pg_temp.eq('Y16 台帳の行ごとの残高', s1, 'authenticated', 'select kind || ''/'' || amount || ''/'' || balance from public.my_ledger(1)', 'payout/-3000/2100');
  perform pg_temp.eq('Y17 他人の振込申請は読めない', b1, 'authenticated', 'select count(*)::text from public.payouts', '0');
  perform pg_temp.ng('Y18 台帳は画面から書けない', s1, 'authenticated', format('insert into public.ledger_entries (user_id, kind, amount) values (%L, %L, 100000)', s1, 'adjustment'), 'permission denied');
  perform pg_temp.ng('Y19 台帳は service_role でも直せない', null, 'service_role', 'update public.ledger_entries set amount = 1', 'permission denied');
  perform pg_temp.ng('Y20 台帳は service_role でも消せない', null, 'service_role', 'delete from public.ledger_entries', 'permission denied');
  perform pg_temp.eq('Y21 申請は監査ログに残る', null, 'postgres',
    format('select count(*)::text from public.audit_logs where action = %L and actor_id = %L', 'payout.request', s1), '1');

  -- 保存した住所 --------------------------------------------------------------
  perform pg_temp.ok('Z01 住所を保存できる', b1, 'authenticated',
    format('insert into public.saved_addresses (name, postal, prefecture, address1, phone) values (%L, %L, %L, %L, %L)', '山田', '150-0001', '東京都', '渋谷区1-1', '09012345678'));
  perform pg_temp.eq('Z02 他人の住所は読めない', b3, 'authenticated', 'select count(*)::text from public.saved_addresses', '0');
  perform pg_temp.ng('Z03 他人の id では保存できない', b3, 'authenticated',
    format('insert into public.saved_addresses (user_id, name, postal, prefecture, address1, phone) values (%L, %L, %L, %L, %L, %L)', b1, 'x', '150-0001', '東京都', 'x', '09012345678'), 'permission denied');
  perform pg_temp.ng('Z04 郵便番号の形が違えば断る', b3, 'authenticated',
    format('insert into public.saved_addresses (name, postal, prefecture, address1, phone) values (%L, %L, %L, %L, %L)', 'x', '1500001', '東京都', 'x', '09012345678'), 'check');
end $t$;
