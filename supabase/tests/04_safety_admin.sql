-- 04 通報・本人確認・ロール変更・退会・管理画面の操作・集計・掃除・DB全体の決まり
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
-- 買って払う。注文の id を返す
create function pg_temp.buy(p_buyer uuid, p_listing uuid, p_pay boolean default true) returns uuid language plpgsql as $f$
declare r text; g uuid;
begin
  r := pg_temp.co(p_buyer, pg_temp.items(p_listing));
  if r like 'ERR %' then raise exception 'checkout 失敗: %', r; end if;
  g := (r::jsonb ->> 'group_id')::uuid;
  if p_pay then perform pg_temp.pay(g, (r::jsonb ->> 'total')::integer); end if;
  return (select id from public.orders where group_id = g limit 1);
end $f$;
-- 本人確認の書類の置き場（その人のフォルダ）
create function pg_temp.doc(p_user uuid) returns text language sql as $f$
  select p_user::text || '/' || gen_random_uuid()::text || '.webp';
$f$;
create function pg_temp.today() returns date language sql as $f$ select (now() at time zone 'Asia/Tokyo')::date; $f$;

do $t$
declare
  adm uuid; s1 uuid; s2 uuid; b1 uuid; b2 uuid; b3 uuid; b4 uuid;
  k1 uuid; k2 uuid; k3 uuid; k4 uuid; k5 uuid; k6 uuid; w1 uuid; rc uuid; u1 uuid;
  l1 uuid; l2 uuid; l3 uuid; l4 uuid; l5 uuid; ll uuid; ld uuid; lrc uuid; lw uuid;
  o1 uuid; o2 uuid; o3 uuid; o4 uuid;
  th uuid; mm uuid; rv uuid; req uuid; req2 uuid; app uuid; app2 uuid; pid uuid;
  n bigint; r text; j jsonb;
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
  l3 := pg_temp.listing(s1);
  l4 := pg_temp.listing(s1);
  l5 := pg_temp.listing(s2);
  ll := pg_temp.listing(s1);
  ld := pg_temp.listing(s1, 'draft');

  -- 通報 ----------------------------------------------------------------------
  r := pg_temp.val(b1, 'authenticated', format('select public.file_report(%L, %L, %L, %L)::text', 'listing', l1, 'inappropriate', '写真が不適切です'));
  perform pg_temp.chk('R01 出品を通報できる（通報番号が返る）', r ~ '^[0-9]+$', r);
  n := r::bigint;
  perform pg_temp.ng('R02 同じ物を続けて通報できない', b1, 'authenticated', format('select public.file_report(%L, %L, %L, %L)', 'listing', l1, 'spam', ''), 'already_reported');
  perform pg_temp.ng('R03 自分は通報できない', b1, 'authenticated', format('select public.file_report(%L, %L, %L, %L)', 'user', b1, 'spam', ''), 'unavailable');
  perform pg_temp.ng('R04 下書きの出品は通報できない', b1, 'authenticated', format('select public.file_report(%L, %L, %L, %L)', 'listing', ld, 'spam', ''), 'unavailable');
  perform pg_temp.ng('R05 知らない理由は断る', b1, 'authenticated', format('select public.file_report(%L, %L, %L, %L)', 'user', s1, 'hate', ''), 'bad_report');
  perform pg_temp.ng('R06 500字を超える詳細は断る', b1, 'authenticated', format('select public.file_report(%L, %L, %L, %L)', 'user', s1, 'other', repeat('あ', 501)), 'bad_report');
  perform pg_temp.ng('R06b 「その他」は詳しい内容が要る', b1, 'authenticated', format('select public.file_report(%L, %L, %L, %L)', 'user', s1, 'other', '   '), 'bad_report');
  th := pg_temp.val(b1, 'authenticated', format('select public.open_thread(%L)', s1))::uuid;
  perform pg_temp.val(b1, 'authenticated', format('select public.send_message(%L, %L)', th, 'こんにちは'));
  mm := pg_temp.val(s1, 'authenticated', format('select public.send_message(%L, %L)', th, 'どうも'))::uuid;
  perform pg_temp.ok('R07 会話の相手のメッセージを通報できる', b1, 'authenticated', format('select public.file_report(%L, %L, %L, %L)', 'message', mm, 'harassment', ''));
  perform pg_temp.ng('R08 他人の会話のメッセージは通報できない', b2, 'authenticated', format('select public.file_report(%L, %L, %L, %L)', 'message', mm, 'harassment', ''), 'unavailable');
  perform pg_temp.ng('R09 通報の一覧は利用者から読めない', b1, 'authenticated', 'select count(*) from public.reports', 'permission denied');
  perform pg_temp.ng('R10 ログインしていないと通報できない', null, 'anon', format('select public.file_report(%L, %L, %L, %L)', 'user', s1, 'spam', ''), 'permission denied');
  update public.profiles set status = 'suspended' where id = b2;
  perform pg_temp.ng('R11 停止中の人は通報できない', b2, 'authenticated', format('select public.file_report(%L, %L, %L, %L)', 'user', s1, 'spam', ''), 'not_allowed');
  update public.profiles set status = 'active' where id = b2;
  perform pg_temp.eq('R12 通報は監査ログに残る', null, 'postgres', format('select count(*)::text from public.audit_logs where action = %L and actor_id = %L', 'report.file', b1), '2');
  perform pg_temp.ng('R13 管理者でない id では処理できない', null, 'service_role',
    format('select public.admin_report_update(%L, (select id from public.reports where report_no = %s), %L, %L)', b1, n, 'resolved', ''), 'not_admin');
  perform pg_temp.ng('R14 知らない状態は断る', null, 'service_role',
    format('select public.admin_report_update(%L, (select id from public.reports where report_no = %s), %L, %L)', adm, n, 'done', ''), 'bad_request');
  perform pg_temp.ok('R15 管理者が対応済みにできる', null, 'service_role',
    format('select public.admin_report_update(%L, (select id from public.reports where report_no = %s), %L, %L)', adm, n, 'resolved', '写真を差し替えてもらった'));
  perform pg_temp.eq('R16 対応の記録', null, 'postgres', format('select status || %L || (handled_by = %L) from public.reports where report_no = %s', '/', adm, n), 'resolved/true');
  perform pg_temp.ok('R17 対応済みのあとは同じ物をまた通報できる', b1, 'authenticated', format('select public.file_report(%L, %L, %L, %L)', 'listing', l1, 'spam', ''));
  perform pg_temp.eq('R18 対応は監査ログに残る', null, 'postgres', format('select count(*)::text from public.audit_logs where action = %L and actor_id = %L', 'report.resolved', adm), '1');

  -- 本人確認（書類を運営が目で見る） ------------------------------------------
  k1 := pg_temp.mkuser('けい', 'buyer', 'unsubmitted');
  perform pg_temp.ng('K01 画面から直接は申請できない', k1, 'authenticated',
    format('select public.submit_kyc(%L, %L, %L, array[%L], %L::date)', k1, 'manual', 'license', pg_temp.doc(k1), '1995-04-01'), 'permission denied');
  perform pg_temp.ng('K02 書類なしでは申請できない', null, 'service_role',
    format('select public.submit_kyc(%L, %L, %L, %L::text[], %L::date)', k1, 'manual', 'license', '{}', '1995-04-01'), 'bad_kyc');
  perform pg_temp.ng('K03 他人のフォルダの書類は使えない', null, 'service_role',
    format('select public.submit_kyc(%L, %L, %L, array[%L], %L::date)', k1, 'manual', 'license', pg_temp.doc(b1), '1995-04-01'), 'bad_kyc');
  perform pg_temp.ng('K04 未来の生年月日は断る', null, 'service_role',
    format('select public.submit_kyc(%L, %L, %L, array[%L], %L::date)', k1, 'manual', 'license', pg_temp.doc(k1), pg_temp.today() + 1), 'bad_kyc');
  perform pg_temp.ng('K05 書類は3枚まで', null, 'service_role',
    format('select public.submit_kyc(%L, %L, %L, array[%L, %L, %L, %L], %L::date)', k1, 'manual', 'license', pg_temp.doc(k1), pg_temp.doc(k1), pg_temp.doc(k1), pg_temp.doc(k1), '1995-04-01'), 'bad_kyc');
  r := pg_temp.val(null, 'service_role', format('select public.submit_kyc(%L, %L, %L, array[%L, %L], %L::date)::text', k1, 'manual', 'license', pg_temp.doc(k1), pg_temp.doc(k1), '1995-04-01'));
  perform pg_temp.chk('K06 申請できる', r !~ '^ERR' and r::jsonb ->> 'status' = 'pending', r);
  app := (r::jsonb ->> 'app_id')::uuid;
  perform pg_temp.eq('K07 申請中の印', k1, 'authenticated', 'select kyc_status from public.my_profile()', 'pending');
  perform pg_temp.ng('K08 申請中は2回目を出せない', null, 'service_role',
    format('select public.submit_kyc(%L, %L, %L, array[%L], %L::date)', k1, 'manual', 'license', pg_temp.doc(k1), '1995-04-01'), 'kyc_in_progress');
  perform pg_temp.eq('K09 本人は申請の状態を読める', k1, 'authenticated', 'select status from public.kyc_applications', 'pending');
  perform pg_temp.ng('K10 本人でも書類の場所は読めない', k1, 'authenticated', 'select document_paths from public.kyc_applications', 'permission denied');
  perform pg_temp.ng('K11 本人でも生年月日は読めない', k1, 'authenticated', 'select birth_date from public.kyc_applications', 'permission denied');
  perform pg_temp.eq('K12 他人の申請は見えない', b1, 'authenticated', 'select count(*)::text from public.kyc_applications', '0');
  perform pg_temp.ng('K13 管理者でない id では審査できない', null, 'service_role', format('select public.admin_kyc_start_review(%L, %L)', b1, app), 'not_admin');
  perform pg_temp.ok('K14 審査を始める', null, 'service_role', format('select public.admin_kyc_start_review(%L, %L)', adm, app));
  perform pg_temp.eq('K15 書類を見たことが監査ログに残る', null, 'postgres',
    format('select status || %L || (select count(*) from public.audit_logs where action = %L and target_id = %L) from public.kyc_applications where id = %L', '/', 'kyc.view_documents', app, app), 'reviewing/1');
  perform pg_temp.ng('K16 却下には理由が要る', null, 'service_role', format('select public.admin_kyc_decide(%L, %L, false, %L)', adm, app, ' '), 'bad_reason');
  perform pg_temp.ng('K17 承認と18歳未満は両立しない', null, 'service_role', format('select public.admin_kyc_decide(%L, %L, true, %L, true)', adm, app, ''), 'bad_kyc');
  r := pg_temp.val(null, 'service_role', format('select public.admin_kyc_decide(%L, %L, false, %L)::text', adm, app, '書類の文字が読めません'));
  perform pg_temp.chk('K18 却下すると消す書類の場所を返す', r !~ '^ERR' and jsonb_array_length(r::jsonb -> 'purge_paths') = 2, r);
  perform pg_temp.eq('K19 却下を本人に知らせる（理由つき）', null, 'postgres',
    format('select body from public.notifications where user_id = %L and kind = %L', k1, 'kyc'), '書類の文字が読めません');
  perform pg_temp.ng('K20 決まった申請は2回決められない', null, 'service_role', format('select public.admin_kyc_decide(%L, %L, true, %L)', adm, app, ''), 'bad_state');
  r := pg_temp.val(null, 'service_role', format('select public.submit_kyc(%L, %L, %L, array[%L], %L::date)::text', k1, 'manual', 'passport', pg_temp.doc(k1), '1995-04-01'));
  perform pg_temp.chk('K21 却下のあと出し直せる', r !~ '^ERR', r);
  app2 := (r::jsonb ->> 'app_id')::uuid;
  perform pg_temp.ok('K22 承認できる', null, 'service_role', format('select public.admin_kyc_decide(%L, %L, true, %L)', adm, app2, ''));
  perform pg_temp.eq('K23 承認で本人確認済みになる', k1, 'authenticated', 'select kyc_status from public.my_profile()', 'approved');
  perform pg_temp.ng('K24 承認後は申請できない', null, 'service_role',
    format('select public.submit_kyc(%L, %L, %L, array[%L], %L::date)', k1, 'manual', 'license', pg_temp.doc(k1), '1995-04-01'), 'kyc_in_progress');
  perform pg_temp.eq('K25 承認・却下は監査ログに残る', null, 'postgres',
    format('select count(*)::text from public.audit_logs where action in (%L, %L) and actor_id = %L', 'kyc.approve', 'kyc.reject', adm), '2');

  -- 18歳未満
  k2 := pg_temp.mkuser('みせいねん', 'seller', 'unsubmitted');
  r := pg_temp.val(null, 'service_role', format('select public.submit_kyc(%L, %L, %L, array[%L], %L::date)::text',
         k2, 'manual', 'license', pg_temp.doc(k2), (pg_temp.today() - interval '18 years' + interval '1 day')::date));
  perform pg_temp.chk('K26 18歳の誕生日の前日までは18歳未満として却下', r !~ '^ERR' and r::jsonb ->> 'status' = 'rejected_underage' and jsonb_array_length(r::jsonb -> 'purge_paths') = 1, r);
  perform pg_temp.eq('K27 18歳未満は利用停止になる', null, 'postgres',
    format('select status || %L || kyc_status || %L || (select count(*) from public.user_sanctions where user_id = %L and kind = %L) from public.profiles where id = %L', '/', '/', k2, 'suspend', k2), 'suspended/rejected/1');
  perform pg_temp.ng('K28 18歳未満は出し直せない', null, 'service_role',
    format('select public.submit_kyc(%L, %L, %L, array[%L], %L::date)', k2, 'manual', 'license', pg_temp.doc(k2), '1990-01-01'), 'not_allowed');
  k6 := pg_temp.mkuser('じゅうはち', 'buyer', 'unsubmitted');
  r := pg_temp.val(null, 'service_role', format('select public.submit_kyc(%L, %L, %L, array[%L], %L::date)::text',
         k6, 'manual', 'license', pg_temp.doc(k6), (pg_temp.today() - interval '18 years')::date));
  perform pg_temp.chk('K29 18歳の誕生日当日は申請できる', r !~ '^ERR' and r::jsonb ->> 'status' = 'pending', r);
  k3 := pg_temp.mkuser('ねんれいさしょう', 'buyer', 'unsubmitted');
  app := (pg_temp.val(null, 'service_role', format('select public.submit_kyc(%L, %L, %L, array[%L], %L::date)::text',
           k3, 'manual', 'license', pg_temp.doc(k3), '2000-01-01'))::jsonb ->> 'app_id')::uuid;
  perform pg_temp.ok('K30 書類で18歳未満と分かったら却下（未成年）', null, 'service_role', format('select public.admin_kyc_decide(%L, %L, false, %L, true)', adm, app, '18歳未満'));
  perform pg_temp.eq('K31 未成年で却下すると停止・出し直し不可', null, 'postgres',
    format('select p.status || %L || k.resubmit_allowed from public.profiles p join public.kyc_applications k on k.user_id = p.id where k.id = %L', '/', app), 'suspended/false');

  -- 出し直しを止める／また受け付ける
  k5 := pg_temp.mkuser('だしなおし', 'buyer', 'unsubmitted');
  app := (pg_temp.val(null, 'service_role', format('select public.submit_kyc(%L, %L, %L, array[%L], %L::date)::text',
           k5, 'manual', 'license', pg_temp.doc(k5), '1990-01-01'))::jsonb ->> 'app_id')::uuid;
  perform pg_temp.ok('K32 出し直し不可で却下', null, 'service_role', format('select public.admin_kyc_decide(%L, %L, false, %L, false, false)', adm, app, '他人の書類'));
  perform pg_temp.ng('K33 出し直し不可なら申請できない', null, 'service_role',
    format('select public.submit_kyc(%L, %L, %L, array[%L], %L::date)', k5, 'manual', 'license', pg_temp.doc(k5), '1990-01-01'), 'kyc_resubmit_closed');
  perform pg_temp.ok('K34 管理者がまた受け付ける', null, 'service_role', format('select public.admin_kyc_allow_resubmit(%L, %L)', adm, app));
  perform pg_temp.ng('K35 受け付けを2回はできない', null, 'service_role', format('select public.admin_kyc_allow_resubmit(%L, %L)', adm, app), 'bad_state');
  perform pg_temp.ok('K36 受け付けたら申請できる', null, 'service_role',
    format('select public.submit_kyc(%L, %L, %L, array[%L], %L::date)', k5, 'manual', 'license', pg_temp.doc(k5), '1990-01-01'));

  -- TRUSTDOCK（結果を webhook で受ける）
  k4 := pg_temp.mkuser('とらすと', 'buyer', 'unsubmitted');
  app := (pg_temp.val(null, 'service_role', format('select public.submit_kyc(%L, %L, %L, %L::text[], %L::date)::text',
           k4, 'trustdock', 'mynumber', '{}', '1990-01-01'))::jsonb ->> 'app_id')::uuid;
  perform pg_temp.ok('K37 受付番号を結ぶ', null, 'service_role', format('select public.kyc_set_provider_ref(%L, %L)', app, 'td_test_1'));
  perform pg_temp.eq('K38 知らない受付番号は無視', null, 'service_role', format('select public.kyc_provider_result(%L, true, null, false) ->> %L', 'td_test_x', 'status'), 'not_found');
  perform pg_temp.eq('K39 結果で承認', null, 'service_role', format('select public.kyc_provider_result(%L, true, null, false) ->> %L', 'td_test_1', 'status'), 'approved');
  perform pg_temp.eq('K40 同じ結果が2回来ても1回分だけ', null, 'service_role', format('select public.kyc_provider_result(%L, false, null, false) ->> %L', 'td_test_1', 'status'), 'not_found');
  perform pg_temp.eq('K41 承認のまま', null, 'postgres', format('select kyc_status from public.profiles where id = %L', k4), 'approved');
  perform pg_temp.ng('K42 結果を受ける関数は利用者から呼べない', k4, 'authenticated', format('select public.kyc_provider_result(%L, true, null, false)', 'td_test_1'), 'permission denied');

  -- 注文の取り消し（管理者） --------------------------------------------------
  o1 := pg_temp.buy(b1, l1);
  perform pg_temp.ng('O01 取り消しには理由が要る', null, 'service_role', format('select public.admin_cancel_order(%L, %L, %L)', adm, o1, ''), 'bad_reason');
  perform pg_temp.ng('O02 管理者でない id では取り消せない', null, 'service_role', format('select public.admin_cancel_order(%L, %L, %L)', s1, o1, 'x'), 'not_admin');
  perform pg_temp.ng('O03 画面からは取り消せない', adm, 'authenticated', format('select public.admin_cancel_order(%L, %L, %L)', adm, o1, 'x'), 'permission denied');
  perform pg_temp.eq('O04 支払い済みを取り消すと返金が要る', null, 'service_role',
    format('select public.admin_cancel_order(%L, %L, %L) ->> %L', adm, o1, '出品者と連絡が取れない', 'needs_refund'), 'true');
  perform pg_temp.eq('O05 注文・出品・購入数が戻る', null, 'postgres',
    format('select o.status || %L || o.needs_refund || %L || l.status || %L || p.purchase_count from public.orders o join public.listings l on l.id = o.listing_id join public.profiles p on p.id = o.buyer_id where o.id = %L',
      '/', '/', '/', o1), 'cancelled/true/private/0');
  perform pg_temp.eq('O06 会話にお知らせが残る', null, 'postgres',
    format('select count(*)::text from public.messages where order_id = %L and kind = %L and body like %L', o1, 'system', '%運営によりキャンセル%'), '1');
  perform pg_temp.eq('O07 両方に知らせる', null, 'postgres',
    format('select count(*)::text from public.notifications where kind = %L and link = %L and title like %L', 'order', '/orders/' || o1, '%キャンセル%'), '2');
  perform pg_temp.ng('O08 2回は取り消せない', null, 'service_role', format('select public.admin_cancel_order(%L, %L, %L)', adm, o1, 'x'), 'bad_state');
  perform pg_temp.ok('O09 返金の済んだ印', null, 'service_role', format('select public.mark_refunded(%L, %L)', o1, 're_test'));
  perform pg_temp.eq('O10 同じ入金がまた来ても何もしない', null, 'service_role',
    format('select public.mark_group_paid((select group_id from public.orders where id = %L), %L, 3000)', o1, 'pi_test'), 'already');
  o2 := pg_temp.buy(b2, l2, false);
  perform pg_temp.eq('O11 支払い前を取り消すと返金は要らない', null, 'service_role',
    format('select public.admin_cancel_order(%L, %L, %L) ->> %L', adm, o2, 'いたずら注文', 'needs_refund'), 'false');
  perform pg_temp.eq('O12 取り消した後に払われたら生き返らせず返金にする', null, 'service_role',
    format('select public.mark_group_paid((select group_id from public.orders where id = %L), %L, 3000)', o2, 'pi_late'), 'refund_needed');
  perform pg_temp.eq('O13 取り消しは監査ログに残る', null, 'postgres', format('select count(*)::text from public.audit_logs where action = %L and actor_id = %L', 'order.cancel', adm), '2');

  -- レビューの非表示（管理者） ------------------------------------------------
  o3 := pg_temp.buy(b3, l3);
  perform pg_temp.val(s1, 'authenticated', format('select public.ship_order(%L, %L, %L)', o3, 'yamato', 'ABCD-1234'));
  perform pg_temp.val(b3, 'authenticated', format('select public.complete_order(%L)', o3));
  rv := pg_temp.val(b3, 'authenticated', format('select public.post_review(%L, 4, %L)', o3, 'よかったです'))::uuid;
  perform pg_temp.eq('V01 レビューが評価に入る', null, 'anon', format('select rating_sum || %L || rating_count from public.profiles where id = %L', '/', s1), '4/1');
  perform pg_temp.ok('V02 管理者がレビューを隠す', null, 'service_role', format('select public.admin_moderate(%L, %L, %L, %L)', adm, 'review', rv, 'hide'));
  perform pg_temp.eq('V03 隠すと評価から外れ、誰にも見えない', null, 'anon',
    format('select (select rating_sum || %L || rating_count from public.profiles where id = %L) || %L || (select count(*) from public.reviews where id = %L)', '/', s1, '/', rv), '0/0/0');
  perform pg_temp.ok('V04 戻せる', null, 'service_role', format('select public.admin_moderate(%L, %L, %L, %L)', adm, 'review', rv, 'approve'));
  perform pg_temp.eq('V05 戻すと評価に入る', null, 'anon', format('select rating_sum || %L || rating_count from public.profiles where id = %L', '/', s1), '4/1');
  perform pg_temp.ng('V06 同じ操作は2回できない', null, 'service_role', format('select public.admin_moderate(%L, %L, %L, %L)', adm, 'review', rv, 'approve'), 'bad_state');
  perform pg_temp.ng('V07 知らない種類は断る', null, 'service_role', format('select public.admin_moderate(%L, %L, %L, %L)', adm, 'user', rv, 'hide'), 'bad_request');

  -- 集計（ダッシュボード・出品者の売上・ランキング） --------------------------
  j := pg_temp.val(null, 'service_role', format('select public.admin_dashboard(%L)::text', adm))::jsonb;
  perform pg_temp.chk('D01 ダッシュボード（月6本・週7日・今月の取引あり）',
    jsonb_array_length(j -> 'monthly') = 6 and jsonb_array_length(j -> 'new_users_week') = 7 and (j ->> 'trades_month')::int >= 1
    and (j ->> 'refunds_open')::int >= 1 and (j ->> 'kyc_open')::int >= 1, j::text);
  perform pg_temp.eq('D02 月の本数は24まで', null, 'service_role', format('select jsonb_array_length(public.admin_dashboard(%L, 100) -> %L)::text', adm, 'monthly'), '24');
  perform pg_temp.ng('D03 管理者でない id では見られない', null, 'service_role', format('select public.admin_dashboard(%L)', s1), 'not_admin');
  perform pg_temp.ng('D04 画面からは見られない', adm, 'authenticated', format('select public.admin_dashboard(%L)', adm), 'permission denied');
  perform pg_temp.eq('D05 出品者の売上（週: 7日・今日の分）', s1, 'authenticated',
    $q$select jsonb_array_length(s -> 'series') || '/' || (s -> 'series' -> -1 ->> 'sales') || '/' || (s ->> 'count_month') from public.seller_stats('week') s$q$, '7/3000/1');
  perform pg_temp.eq('D06 出品者の売上（月7本・年3本）', s1, 'authenticated',
    $q$select jsonb_array_length(public.seller_stats('month') -> 'series') || '/' || jsonb_array_length(public.seller_stats('year') -> 'series')$q$, '7/3');
  perform pg_temp.ng('D07 購入者は出品者の売上を見られない', b1, 'authenticated', 'select public.seller_stats()', 'not_allowed');
  perform pg_temp.eq('D08 週間ランキング（出品者）', null, 'anon', 'select public.weekly_ranking(''sellers'', 1) -> 0 ->> ''id''', s1::text);
  perform pg_temp.eq('D09 週間ランキング（出品）', null, 'anon', 'select public.weekly_ranking(''listings'', 1) -> 0 ->> ''id''', l3::text);
  perform pg_temp.chk('D10 ランキングは50件まで', (select jsonb_array_length(public.weekly_ranking('sellers', 1000))) <= 50, '');

  -- 振込・台帳（管理者） ------------------------------------------------------
  perform pg_temp.ng('Y01 調整の額が0は断る', null, 'service_role', format('select public.admin_ledger_adjust(%L, %L, 0, %L)', adm, s1, '調整'), 'bad_request');
  perform pg_temp.ng('Y02 調整にはメモが要る', null, 'service_role', format('select public.admin_ledger_adjust(%L, %L, 100, %L)', adm, s1, ' '), 'bad_request');
  perform pg_temp.ng('Y03 調整の上限', null, 'service_role', format('select public.admin_ledger_adjust(%L, %L, 1000001, %L)', adm, s1, '調整'), 'bad_request');
  perform pg_temp.ok('Y04 残高を調整できる', null, 'service_role', format('select public.admin_ledger_adjust(%L, %L, 5000, %L)', adm, s1, 'キャンペーン'));
  perform pg_temp.eq('Y05 調整が残高に入る', s1, 'authenticated', 'select public.my_balance()::text', '7550');
  perform pg_temp.ok('Y06 口座を登録', s1, 'authenticated',
    format('insert into public.bank_accounts (bank_name, branch_name, account_type, account_number, holder_kana) values (%L, %L, %L, %L, %L)', 'A銀行', '渋谷支店', 'ordinary', '1234567', 'ミサキ'));
  pid := pg_temp.val(s1, 'authenticated', 'select public.request_payout(3000)')::uuid;
  perform pg_temp.ng('Y07 差し戻しには理由が要る', null, 'service_role', format('select public.admin_payout_reject(%L, %L, %L)', adm, pid, ''), 'bad_reason');
  perform pg_temp.ok('Y08 差し戻せる', null, 'service_role', format('select public.admin_payout_reject(%L, %L, %L)', adm, pid, '口座の名義が違います'));
  perform pg_temp.eq('Y09 差し戻すと残高に戻る', s1, 'authenticated',
    'select public.my_balance() || ''/'' || (select kind from public.my_ledger(1))', '7550/payout_reversal');
  perform pg_temp.ng('Y10 差し戻しは2回できない', null, 'service_role', format('select public.admin_payout_reject(%L, %L, %L)', adm, pid, 'x'), 'bad_state');
  perform pg_temp.ng('Y11 差し戻したものは振り込めない', null, 'service_role', format('select public.admin_payout_pay(%L, %L)', adm, pid), 'bad_state');
  pid := pg_temp.val(s1, 'authenticated', 'select public.request_payout(3000)')::uuid;
  perform pg_temp.ng('Y12 管理者でない id では振り込めない', null, 'service_role', format('select public.admin_payout_pay(%L, %L)', s1, pid), 'not_admin');
  perform pg_temp.eq('Y13 振り込んだ印', null, 'service_role', format('select public.admin_payout_pay(%L, %L) ->> %L', adm, pid, 'net'), '3000');
  perform pg_temp.eq('Y14 振り込んだあとの残高', s1, 'authenticated', 'select public.my_balance() || ''/'' || (select status from public.payouts where id = ''' || pid || ''')', '4550/paid');
  perform pg_temp.ng('Y15 2回は振り込めない', null, 'service_role', format('select public.admin_payout_pay(%L, %L)', adm, pid), 'bad_state');
  perform pg_temp.eq('Y16 振込・差し戻しを本人に知らせる', null, 'postgres', format('select count(*)::text from public.notifications where user_id = %L and kind = %L', s1, 'payout'), '2');
  perform pg_temp.ng('Y17 振込の状態は画面から変えられない', s1, 'authenticated', format('update public.payouts set status = %L', 'paid'), 'permission denied');
  perform pg_temp.ok('Y18 返金のあとの差し引き', null, 'service_role', format('select public.admin_ledger_adjust(%L, %L, -550, %L, %L)', adm, s1, '返金分', o3));
  perform pg_temp.eq('Y19 差し引きの種類', s1, 'authenticated', 'select kind || ''/'' || amount || ''/'' || balance from public.my_ledger(1)', 'refund_clawback/-550/4000');
  perform pg_temp.eq('Y20 振込・調整は監査ログに残る', null, 'postgres',
    format('select count(*)::text from public.audit_logs where actor_id = %L and action in (%L, %L, %L)', adm, 'payout.pay', 'payout.reject', 'ledger.adjust'), '4');

  -- ロールの変更 --------------------------------------------------------------
  rc := pg_temp.mkuser('てんこう', 'seller');
  update public.profiles set age = 24, occupation = '会社員' where id = rc;
  lrc := pg_temp.listing(rc);
  r := pg_temp.val(rc, 'authenticated', format('select public.request_role_change(%L)', '買う側だけにします'));
  perform pg_temp.chk('C01 出品者から購入者への変更を申請できる', r !~ '^ERR', r);
  req := r::uuid;
  perform pg_temp.ng('C02 申請中は2件目を出せない', rc, 'authenticated', format('select public.request_role_change(%L)', ''), 'already_requested');
  perform pg_temp.ng('C03 残高がある出品者は申請できない', s1, 'authenticated', format('select public.request_role_change(%L)', ''), 'balance_left');
  o4 := pg_temp.buy(b4, l4);
  perform pg_temp.ng('C04 取引中の購入者は申請できない', b4, 'authenticated', format('select public.request_role_change(%L)', ''), 'open_orders');
  perform pg_temp.ng('C05 理由は200字まで', b1, 'authenticated', format('select public.request_role_change(%L)', repeat('あ', 201)), 'bad_reason');
  perform pg_temp.eq('C06 本人は申請を読める・他人は読めない', null, 'postgres',
    format('select %L', (select pg_temp.val(rc, 'authenticated', 'select count(*)::text from public.role_change_requests') || '/' || pg_temp.val(b1, 'authenticated', 'select count(*)::text from public.role_change_requests'))), '1/0');
  perform pg_temp.ng('C07 ロールは画面から直接変えられない', b1, 'authenticated', format('update public.profiles set role = %L where id = %L', 'seller', b1), 'permission denied');
  perform pg_temp.ok('C08 管理者が承認', null, 'service_role', format('select public.admin_role_change_decide(%L, %L, true, %L)', adm, req, ''));
  perform pg_temp.eq('C09 承認で購入者になり、出品は非公開・年齢と職業は消える', null, 'postgres',
    format('select p.role || %L || l.status || %L || coalesce(p.age::text, %L) || %L || coalesce(p.occupation, %L) from public.profiles p join public.listings l on l.seller_id = p.id where p.id = %L',
      '/', '/', '-', '/', '-', rc), 'buyer/private/-/-');
  perform pg_temp.eq('C10 承認を本人に知らせる', null, 'postgres', format('select count(*)::text from public.notifications where user_id = %L and title like %L', rc, '%承認されました%'), '1');
  perform pg_temp.ng('C11 決まった申請は2回決められない', null, 'service_role', format('select public.admin_role_change_decide(%L, %L, false, %L)', adm, req, 'x'), 'bad_state');
  req2 := pg_temp.val(b2, 'authenticated', format('select public.request_role_change(%L)', '出品してみたい'))::uuid;
  perform pg_temp.ng('C12 却下には理由が要る', null, 'service_role', format('select public.admin_role_change_decide(%L, %L, false, %L)', adm, req2, ''), 'bad_reason');
  perform pg_temp.ok('C13 却下できる', null, 'service_role', format('select public.admin_role_change_decide(%L, %L, false, %L)', adm, req2, '取引中の返金が済んでから'));
  perform pg_temp.eq('C14 却下のあとも購入者のまま', null, 'postgres', format('select role from public.profiles where id = %L', b2), 'buyer');
  perform pg_temp.ng('C15 管理者でない id では決められない', null, 'service_role', format('select public.admin_role_change_decide(%L, %L, true, %L)', b1, req2, ''), 'not_admin');

  -- 出品の非表示（管理者） ----------------------------------------------------
  perform pg_temp.ok('L01 管理者が出品を隠す', null, 'service_role', format('select public.admin_set_listing_status(%L, %L, %L, %L)', adm, ll, 'hidden', '規約違反の写真'));
  perform pg_temp.eq('L02 隠した出品は誰にも見えない', null, 'anon', format('select count(*)::text from public.listings where id = %L', ll), '0');
  perform pg_temp.eq('L03 出品者は隠された出品を公開に戻せない（0行）', s1, 'authenticated',
    format('with u as (update public.listings set status = %L where id = %L returning 1) select count(*)::text from u', 'published', ll), '0');
  perform pg_temp.eq('L04 出品者に知らせる（理由つき）', null, 'postgres',
    format('select count(*)::text from public.notifications where user_id = %L and title like %L and body like %L', s1, '%非表示%', '%規約違反の写真%'), '1');
  perform pg_temp.ok('L05 管理者が戻す', null, 'service_role', format('select public.admin_set_listing_status(%L, %L, %L, %L)', adm, ll, 'published', ''));
  perform pg_temp.eq('L06 戻すと見える', null, 'anon', format('select count(*)::text from public.listings where id = %L', ll), '1');
  perform pg_temp.ng('L07 知らない状態は断る', null, 'service_role', format('select public.admin_set_listing_status(%L, %L, %L, %L)', adm, ll, 'sold', ''), 'bad_request');
  perform pg_temp.ng('L08 下書きは操作できない', null, 'service_role', format('select public.admin_set_listing_status(%L, %L, %L, %L)', adm, ld, 'hidden', ''), 'bad_state');
  perform pg_temp.ng('L09 売り切れは公開に戻せない', null, 'service_role', format('select public.admin_set_listing_status(%L, %L, %L, %L)', adm, l3, 'published', ''), 'bad_state');

  -- 利用停止・警告（管理者） --------------------------------------------------
  u1 := pg_temp.mkuser('ていし', 'buyer');
  perform pg_temp.ng('U01 画面からは停止できない', adm, 'authenticated', format('select public.admin_set_user_status(%L, %L, %L, %L)', adm, u1, 'suspended', ''), 'permission denied');
  perform pg_temp.ng('U02 管理者でない id では停止できない', null, 'service_role', format('select public.admin_set_user_status(%L, %L, %L, %L)', b1, u1, 'suspended', ''), 'not_admin');
  perform pg_temp.ng('U03 自分は停止できない', null, 'service_role', format('select public.admin_set_user_status(%L, %L, %L, %L)', adm, adm, 'suspended', ''), 'bad_request');
  perform pg_temp.ok('U04 停止できる', null, 'service_role', format('select public.admin_set_user_status(%L, %L, %L, %L)', adm, u1, 'suspended', '迷惑行為'));
  perform pg_temp.eq('U05 停止の記録と監査ログ', null, 'postgres',
    format('select (select status from public.profiles where id = %L) || %L || (select count(*) from public.user_sanctions where user_id = %L and kind = %L) || %L || (select count(*) from public.audit_logs where action = %L and target_id = %L)',
      u1, '/', u1, 'suspend', '/', 'user.suspend', u1), 'suspended/1/1');
  perform pg_temp.ng('U06 停止中は2回停止できない', null, 'service_role', format('select public.admin_set_user_status(%L, %L, %L, %L)', adm, u1, 'suspended', ''), 'bad_state');
  perform pg_temp.chk('U07 停止中は買えない', pg_temp.co(u1, pg_temp.items(l5)) like '%not_allowed%', '');
  perform pg_temp.ok('U08 解除できる', null, 'service_role', format('select public.admin_set_user_status(%L, %L, %L, %L)', adm, u1, 'active', ''));
  perform pg_temp.ng('U09 動いている人は解除できない', null, 'service_role', format('select public.admin_set_user_status(%L, %L, %L, %L)', adm, u1, 'active', ''), 'bad_state');
  perform pg_temp.ng('U10 警告には理由が要る', null, 'service_role', format('select public.admin_warn_user(%L, %L, %L)', adm, u1, ''), 'bad_request');
  perform pg_temp.ok('U11 警告できる', null, 'service_role', format('select public.admin_warn_user(%L, %L, %L)', adm, u1, '外部への誘導はやめてください'));
  perform pg_temp.eq('U12 警告を本人に知らせる', null, 'postgres', format('select title from public.notifications where user_id = %L and title like %L', u1, '%警告%'), '運営からの警告');
  perform pg_temp.ng('U13 動いている人は退会扱いにできない', null, 'service_role', format('select public.admin_withdraw_user(%L, %L, %L)', adm, u1, ''), 'bad_state');
  perform pg_temp.ok('U14 出品者を停止', null, 'service_role', format('select public.admin_set_user_status(%L, %L, %L, %L)', adm, s2, 'suspended', '詐欺の疑い'));
  perform pg_temp.eq('U15 停止中の出品者の出品は見えない', null, 'anon', format('select count(*)::text from public.listings where id = %L', l5), '0');
  perform pg_temp.ok('U16 残高を足しておく', null, 'service_role', format('select public.admin_ledger_adjust(%L, %L, 1000, %L)', adm, s2, '確認用'));
  perform pg_temp.ok('U17 停止中の出品者を退会扱いにできる（残高があっても）', null, 'service_role', format('select public.admin_withdraw_user(%L, %L, %L)', adm, s2, '詐欺'));
  perform pg_temp.eq('U18 退会扱いになり、台帳は残る', null, 'postgres',
    format('select (select status from public.profiles where id = %L) || %L || (select sum(amount) from public.ledger_entries where user_id = %L)', s2, '/', s2), 'withdrawn/1000');

  -- 本人の退会 ----------------------------------------------------------------
  w1 := pg_temp.mkuser('たいかい', 'seller');
  update public.profiles set avatar_path = w1::text || '/' || gen_random_uuid()::text || '.webp' where id = w1;
  lw := pg_temp.listing(w1);
  perform pg_temp.val(w1, 'authenticated', format('insert into public.posts (body, image_paths) values (%L, array[%L]) returning id', 'さようなら', w1::text || '/' || gen_random_uuid()::text || '.webp'));
  perform pg_temp.val(b1, 'authenticated', format('insert into public.follows (seller_id) values (%L) returning seller_id', w1));
  insert into public.kyc_applications (user_id, provider, doc_type, document_paths, birth_date, status, decided_at)
  values (w1, 'manual', 'license', array[pg_temp.doc(w1)], '1990-01-01', 'approved', now()),
         (w1, 'manual', 'passport', array[pg_temp.doc(w1)], '1990-01-01', 'pending', null);
  perform pg_temp.ng('W01 画面から直接は退会できない', w1, 'authenticated', format('select public.withdraw_account(%L, %L)', w1, ''), 'permission denied');
  perform pg_temp.ng('W02 取引中の出品者は退会できない', null, 'service_role', format('select public.withdraw_account(%L, %L)', s1, ''), 'open_orders');
  u1 := pg_temp.mkuser('ざんだか', 'seller');
  perform pg_temp.val(null, 'service_role', format('select public.admin_ledger_adjust(%L, %L, 100, %L)', adm, u1, '確認用'));
  perform pg_temp.ng('W02b 残高が残っていると退会できない', null, 'service_role', format('select public.withdraw_account(%L, %L)', u1, ''), 'balance_left');
  perform pg_temp.ng('W03 取引中は退会できない', null, 'service_role', format('select public.withdraw_account(%L, %L)', b4, ''), 'open_orders');
  perform pg_temp.ng('W04 管理者は退会できない', null, 'service_role', format('select public.withdraw_account(%L, %L)', adm, ''), 'not_allowed');
  r := pg_temp.val(null, 'service_role', format('select public.withdraw_account(%L, %L)::text', w1, '使わなくなった'));
  perform pg_temp.chk('W05 退会すると消す画像・書類の場所を返す',
    r !~ '^ERR' and jsonb_array_length(r::jsonb -> 'purge_paths' -> 'avatars') = 1 and jsonb_array_length(r::jsonb -> 'purge_paths' -> 'listing-images') = 1
    and jsonb_array_length(r::jsonb -> 'purge_paths' -> 'post-images') = 1 and jsonb_array_length(r::jsonb -> 'purge_paths' -> 'kyc-documents') = 2, r);
  perform pg_temp.eq('W06 公開の情報が空になる', null, 'postgres',
    format('select status || %L || public_name || %L || coalesce(avatar_path, %L) || %L || coalesce(nullif(bio, ''''), %L) from public.profiles where id = %L', '/', '/', '-', '/', '-', w1), 'withdrawn/退会したユーザー/-/-');
  perform pg_temp.eq('W06b 退会した人のページは誰にも見えない', null, 'anon', format('select count(*)::text from public.profiles where id = %L', w1), '0');
  perform pg_temp.eq('W07 出品・つぶやき・フォローが消える', null, 'postgres',
    format('select (select status from public.listings where id = %L) || %L || (select count(*) from public.posts where author_id = %L) || %L || (select count(*) from public.follows where seller_id = %L)',
      lw, '/', w1, '/', w1), 'deleted/0/0');
  perform pg_temp.eq('W08 本人確認の書類の場所が消え、審査中の申請は却下になる', null, 'postgres',
    format('select string_agg(status || %L || cardinality(document_paths) || %L || (documents_purged_at is not null), %L order by doc_type) from public.kyc_applications where user_id = %L',
      ':', ':', ',', w1), 'approved:0:true,rejected:0:true');
  perform pg_temp.ng('W09 2回は退会できない', null, 'service_role', format('select public.withdraw_account(%L, %L)', w1, ''), 'bad_state');
  perform pg_temp.eq('W10 退会の記録と監査ログ', null, 'postgres',
    format('select (select count(*) from public.user_sanctions where user_id = %L and kind = %L) || %L || (select count(*) from public.audit_logs where action = %L and target_id = %L)',
      w1, 'withdraw', '/', 'user.withdraw', w1), '1/1');

  -- サイト設定 ----------------------------------------------------------------
  perform pg_temp.ng('S01 知らない項目は断る', null, 'service_role', format('select public.admin_update_settings(%L, %L::jsonb)', adm, '{"service_name":"x"}'), 'bad_request');
  perform pg_temp.ng('S02 形が違えば断る', null, 'service_role', format('select public.admin_update_settings(%L, %L::jsonb)', adm, '[1]'), 'bad_request');
  perform pg_temp.ng('S03 手数料は50%未満', null, 'service_role', format('select public.admin_update_settings(%L, %L::jsonb)', adm, '{"fee_rate":0.6}'), 'check');
  perform pg_temp.ng('S04 お知らせは500字まで', null, 'service_role', format('select public.admin_update_settings(%L, %L::jsonb)', adm, jsonb_build_object('notice', repeat('あ', 501))), 'check');
  perform pg_temp.ng('S05 管理者でない id では変えられない', null, 'service_role', format('select public.admin_update_settings(%L, %L::jsonb)', b1, '{"fee_rate":0.1}'), 'not_admin');
  perform pg_temp.ok('S06 変えられる', null, 'service_role', format('select public.admin_update_settings(%L, %L::jsonb)', adm, '{"fee_rate":0.12,"notice":"メンテのお知らせ"}'));
  perform pg_temp.eq('S07 誰でも手数料とお知らせを読める', null, 'anon', 'select fee_rate || ''/'' || notice from public.site_settings', '0.120/メンテのお知らせ');
  perform pg_temp.ng('S08 転送先の住所は利用者から読めない', b1, 'authenticated', 'select forwarding_address from public.site_settings', 'permission denied');
  perform pg_temp.ng('S09 設定は画面から直接変えられない', b1, 'authenticated', 'update public.site_settings set fee_rate = 0', 'permission denied');
  perform pg_temp.eq('S10 設定の変更は監査ログに残る', null, 'postgres', format('select count(*)::text from public.audit_logs where action = %L and actor_id = %L', 'settings.update', adm), '1');

  -- 掃除（保存期間） ----------------------------------------------------------
  insert into public.notifications (user_id, kind, title, read_at, created_at) values (b1, 'system', '古いお知らせ', now() - interval '100 days', now() - interval '100 days');
  update public.orders set completed_at = now() - interval '91 days' where id = o3;
  update public.orders set cancelled_at = now() - interval '100 days' where id in (o1, o2);
  app := (select id from public.kyc_applications where user_id = k1 and status = 'approved');
  update public.kyc_applications set decided_at = now() - interval '8 days' where id = app;
  perform pg_temp.ng('Z01 掃除は利用者から呼べない', b1, 'authenticated', 'select public.cleanup_retention()', 'permission denied');
  j := pg_temp.val(null, 'service_role', 'select public.cleanup_retention()::text')::jsonb;
  perform pg_temp.chk('Z02 判定から7日たった書類を消す対象に挙げる', j -> 'kyc_purge' @> jsonb_build_array(jsonb_build_object('app_id', app)), j::text);
  perform pg_temp.eq('Z03 終わった取引のお届け先は90日で消す（返金待ちは残す）', null, 'postgres',
    format('select string_agg((exists (select 1 from public.order_addresses a where a.order_id = x))::text, %L order by ord) from unnest(array[%L, %L, %L]::uuid[]) with ordinality t(x, ord)', ',', o3, o1, o2),
    'false,false,true');
  perform pg_temp.eq('Z04 読んだお知らせは90日で消す', null, 'postgres', format('select count(*)::text from public.notifications where title = %L', '古いお知らせ'), '0');
  perform pg_temp.ok('Z05 書類を消した印', null, 'service_role', format('select public.kyc_mark_purged(%L)', app));
  perform pg_temp.chk('Z06 消した書類は次から挙げない',
    not (pg_temp.val(null, 'service_role', 'select public.cleanup_retention()::text')::jsonb -> 'kyc_purge' @> jsonb_build_array(jsonb_build_object('app_id', app))), '');
  perform pg_temp.ok('Z07 審査中の申請に消した印を付けようとしても', null, 'service_role',
    format('select public.kyc_mark_purged(id) from public.kyc_applications where user_id = %L', k6));
  perform pg_temp.eq('Z08 書類の場所はそのまま', null, 'postgres',
    format('select cardinality(document_paths) || %L || (documents_purged_at is null) from public.kyc_applications where user_id = %L', '/', k6), '1/true');

  -- DB 全体の決まり -----------------------------------------------------------
  perform pg_temp.eq('G01 管理用の関数は利用者・匿名から呼べない', null, 'postgres',
    $q$select coalesce(string_agg(p.proname, ','), '') from pg_proc p join pg_namespace s on s.oid = p.pronamespace
       where s.nspname = 'public' and p.proname like 'admin\_%'
         and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))$q$, '');
  perform pg_temp.eq('G02 管理用の関数はすべて管理者を確かめる', null, 'postgres',
    $q$select coalesce(string_agg(p.proname, ','), '') from pg_proc p join pg_namespace s on s.oid = p.pronamespace
       where s.nspname = 'public' and p.proname like 'admin\_%' and p.prosrc not like '%assert_admin(p_admin)%'$q$, '');
  perform pg_temp.eq('G03 security definer の関数はすべて search_path を固定', null, 'postgres',
    $q$select coalesce(string_agg(p.proname, ','), '') from pg_proc p join pg_namespace s on s.oid = p.pronamespace
       where s.nspname = 'public' and p.prosecdef and not coalesce('search_path=""' = any(p.proconfig), false)$q$, '');
  perform pg_temp.eq('G04 public の表はすべて RLS が有効', null, 'postgres',
    $q$select coalesce(string_agg(c.relname, ','), '') from pg_class c join pg_namespace s on s.oid = c.relnamespace
       where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity$q$, '');
  perform pg_temp.eq('G05 中で使うだけの関数は利用者・匿名から呼べない', null, 'postgres',
    $q$select coalesce(string_agg(p.proname, ','), '') from pg_proc p join pg_namespace s on s.oid = p.pronamespace
       where s.nspname = 'public' and p.proname in ('notify', 'audit', 'suspend_internal', 'withdraw_internal', 'kyc_apply_decision', 'seller_can_leave',
         'ensure_thread', 'post_system_message', 'finish_order', 'legacy_clean', 'migrate_legacy_data', 'assert_admin', 'mark_group_paid', 'mark_refunded',
         'create_checkout', 'cancel_expired_orders', 'auto_complete_orders', 'cleanup_retention', 'submit_kyc', 'withdraw_account')
         and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))$q$, '');
end $t$;
