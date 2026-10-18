-- 05 画面を作る段で足した DB の決まり（0009）: 登録の受付停止・支払い待ちの取り消し・お知らせのメール・出品の削除・管理画面の残高
create function pg_temp.co(p_buyer uuid, p_items jsonb, p_method text default 'mock') returns text language sql as $f$
  select pg_temp.val(null, 'service_role', format('select public.create_checkout(%L, %L::jsonb, %L, %L::jsonb)::text',
    p_buyer, p_items, p_method, pg_temp.addr()));
$f$;
create function pg_temp.items(variadic p_ids uuid[]) returns jsonb language sql as $f$
  select jsonb_agg(jsonb_build_object('listing_id', x, 'options', '{}'::jsonb)) from unnest(p_ids) x;
$f$;
create function pg_temp.pay(p_group uuid, p_amount integer, p_ref text default 'pi_test') returns text language sql as $f$
  select pg_temp.val(null, 'service_role', format('select public.mark_group_paid(%L, %L, %s)', p_group, p_ref, p_amount));
$f$;

do $t$
declare
  s1 uuid; s2 uuid; b1 uuid; b2 uuid;
  l1 uuid; l2 uuid; l3 uuid; ld uuid;
  r text; r1 text; g uuid; g1 uuid; adm uuid;
begin
  s1 := pg_temp.mkuser('みさき', 'seller');
  s2 := pg_temp.mkuser('ゆい', 'seller');
  b1 := pg_temp.mkuser('たろう', 'buyer');
  b2 := pg_temp.mkuser('じろう', 'buyer');

  -- 1. 新規登録の受付停止 ----------------------------------------------------------
  update public.site_settings set registration_open = false where id;
  begin
    perform pg_temp.mkuser('締切後', 'buyer');
    perform pg_temp.chk('R01 受付停止中は登録できない', false, '登録できてしまった');
  exception when others then
    perform pg_temp.chk('R01 受付停止中は登録できない', sqlerrm like '%registration_closed%', sqlerrm);
  end;
  update public.site_settings set registration_open = true where id;
  perform pg_temp.chk('R02 受付を戻すと登録できる', pg_temp.mkuser('再開後', 'buyer') is not null, '');

  -- 2. 支払い待ちを本人が取り消す ----------------------------------------------------
  l1 := pg_temp.listing(s1);
  r1 := pg_temp.co(b1, pg_temp.items(l1));
  perform pg_temp.chk('C00 支払い待ちを作れる', r1 !~ '^ERR', r1);
  g1 := (r1::jsonb ->> 'group_id')::uuid;
  perform pg_temp.ng('C01 他人の支払い待ちは取り消せない', b2, 'authenticated', format('select public.cancel_my_pending_group(%L)', g1), 'bad_state');
  perform pg_temp.ng('C02 ログインなしは呼べない', null, 'anon', format('select public.cancel_my_pending_group(%L)', g1), 'permission denied');
  perform pg_temp.eq('C03 本人は取り消せる（件数）', b1, 'authenticated', format('select public.cancel_my_pending_group(%L)::text', g1), '1');
  perform pg_temp.eq('C04 取り消しの理由', null, 'postgres',
    format('select status || ''/'' || cancel_reason from public.orders where group_id = %L', g1), 'cancelled/buyer_cancelled');
  perform pg_temp.ng('C05 2回目は取り消せない', b1, 'authenticated', format('select public.cancel_my_pending_group(%L)', g1), 'bad_state');
  r := pg_temp.co(b2, pg_temp.items(l1));
  perform pg_temp.chk('C06 取り消した商品はすぐ買い直せる', r !~ '^ERR', r);
  perform pg_temp.pay(g1, (r1::jsonb ->> 'total')::integer);
  perform pg_temp.eq('C07 取り消しのあとに届いた入金は返金待ちになる', null, 'postgres',
    format('select status || ''/'' || needs_refund::text from public.orders where group_id = %L', g1), 'cancelled/true');

  -- 3. お知らせのメール（claim_mail_batch） -----------------------------------------
  -- ここまでに出た注文のお知らせを先に拾っておく
  perform public.claim_mail_batch(200);
  perform public.notify(b1, 'order', '注文テスト', '本文', '/orders');
  perform public.notify(b2, 'order', '注文テスト2', '本文', '/orders');
  update public.profiles set notify_order = false where id = b2;
  perform public.notify(s1, 'kyc', '本人確認の結果', '承認しました', '/kyc');
  perform public.notify(s1, 'message', 'メッセージ', 'こんにちは', '/messages');
  perform pg_temp.ng('E01 利用者は呼べない', b1, 'authenticated', 'select count(*) from public.claim_mail_batch(10)', 'permission denied');
  perform pg_temp.ng('E02 ログインなしは呼べない', null, 'anon', 'select count(*) from public.claim_mail_batch(10)', 'permission denied');
  perform pg_temp.eq('E03 送る分だけ返す（注文のメールを止めた人・メッセージは除く）', null, 'service_role',
    'select string_agg(title, ''/'' order by title) from public.claim_mail_batch(50)', '本人確認の結果/注文テスト');
  perform pg_temp.eq('E04 拾った行は送らない分にも印が付く', null, 'postgres',
    'select count(*)::text from public.notifications where kind in (''order'', ''kyc'', ''payout'') and mailed_at is null', '0');
  perform pg_temp.eq('E05 2回目は何も返さない', null, 'service_role', 'select count(*)::text from public.claim_mail_batch(50)', '0');
  perform pg_temp.eq('E06 メッセージのお知らせには印を付けない', null, 'postgres',
    'select count(*)::text from public.notifications where kind = ''message'' and mailed_at is not null', '0');
  update public.site_settings set mail_kyc = false where id;
  perform public.notify(s1, 'kyc', '本人確認の結果2', '承認しました', '/kyc');
  perform pg_temp.eq('E07 管理画面で止めた種類は送らない', null, 'service_role', 'select count(*)::text from public.claim_mail_batch(50)', '0');
  update public.site_settings set mail_kyc = true where id;
  update public.profiles set status = 'withdrawn' where id = b1;
  perform public.notify(b1, 'order', '退会後', '', '/orders');
  perform pg_temp.eq('E08 退会した人には送らない', null, 'service_role', 'select count(*)::text from public.claim_mail_batch(50)', '0');
  perform public.notify(s2, 'payout', '振込しました（古い）', '', '/payout');
  update public.notifications set created_at = now() - interval '4 days' where user_id = s2 and kind = 'payout';
  perform pg_temp.eq('E09 3日より前のお知らせは送らない', null, 'service_role', 'select count(*)::text from public.claim_mail_batch(50)', '0');
  perform public.notify(s2, 'payout', '振込しました', '', '/payout');
  perform pg_temp.eq('E10 宛先はその人のメールアドレス', null, 'service_role',
    'select email from public.claim_mail_batch(50)', s2::text || '@test.invalid');
  perform pg_temp.ng('E11 印は利用者から消せない', s2, 'authenticated', 'update public.notifications set mailed_at = null', 'permission denied');

  -- 4. 出品の削除（本人） ---------------------------------------------------------
  l2 := pg_temp.listing(s1);
  perform pg_temp.ng('D01 RLS 越しの update では deleted にできない（だから関数を通す）', s1, 'authenticated',
    format('update public.listings set status = %L where id = %L', 'deleted', l2), 'row-level security');
  perform pg_temp.ng('D02 他人の出品は消せない', s2, 'authenticated', format('select public.delete_my_listing(%L)', l2), 'not_found');
  perform pg_temp.ng('D03 ログインなしは呼べない', null, 'anon', format('select public.delete_my_listing(%L)', l2), 'permission denied');
  perform pg_temp.ok('D04 本人は消せる', s1, 'authenticated', format('select public.delete_my_listing(%L)', l2));
  perform pg_temp.eq('D05 状態は deleted', null, 'postgres', format('select status from public.listings where id = %L', l2), 'deleted');
  perform pg_temp.eq('D06 本人の一覧からも消える', s1, 'authenticated', format('select count(*)::text from public.listings where id = %L', l2), '0');
  perform pg_temp.ng('D07 消した物はもう一度は消せない', s1, 'authenticated', format('select public.delete_my_listing(%L)', l2), 'bad_state');
  perform pg_temp.eq('D08 削除は監査ログに残る', null, 'postgres',
    format('select count(*)::text from public.audit_logs where action = %L and target_id = %L', 'listing.delete', l2), '1');
  l3 := pg_temp.listing(s1);
  r := pg_temp.co(b2, pg_temp.items(l3));
  perform pg_temp.ng('D09 支払い待ちの注文がある商品は消せない', s1, 'authenticated', format('select public.delete_my_listing(%L)', l3), 'reserved');
  g := (r::jsonb ->> 'group_id')::uuid;
  perform pg_temp.pay(g, (r::jsonb ->> 'total')::integer);
  perform pg_temp.ok('D10 売れた商品は消せる', s1, 'authenticated', format('select public.delete_my_listing(%L)', l3));
  perform pg_temp.eq('D11 注文の記録は残る', b2, 'authenticated', format('select count(*)::text from public.orders where group_id = %L', g), '1');
  ld := pg_temp.listing(s1);
  update public.listings set status = 'hidden' where id = ld;
  perform pg_temp.ng('D12 運営が非公開にした出品は消せない', s1, 'authenticated', format('select public.delete_my_listing(%L)', ld), 'bad_state');

  -- 5. 管理画面で見る残高（admin_user_balance） ------------------------------------
  adm := pg_temp.mkuser('運営', 'buyer');
  insert into public.admin_users (user_id) values (adm);
  insert into public.ledger_entries (user_id, kind, amount) values (s2, 'adjustment', 1200), (s2, 'adjustment', -200);
  perform pg_temp.eq('A01 管理者は人を指定して残高を読める', null, 'service_role', format('select public.admin_user_balance(%L, %L)::text', adm, s2), '1000');
  perform pg_temp.ng('A01b 管理者でない id では読めない', null, 'service_role', format('select public.admin_user_balance(%L, %L)', s1, s2), 'not_admin');
  perform pg_temp.eq('A02 台帳の無い人は 0', null, 'service_role', format('select public.admin_user_balance(%L, %L)::text', adm, b2), '0');
  perform pg_temp.ng('A03 利用者は呼べない（本人の分でも）', s2, 'authenticated', format('select public.admin_user_balance(%L, %L)', s2, s2), 'permission denied');
  perform pg_temp.ng('A04 ログインなしは呼べない', null, 'anon', format('select public.admin_user_balance(%L, %L)', adm, s2), 'permission denied');
end $t$;
