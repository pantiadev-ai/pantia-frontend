-- 06 代理登録（0010）: 台帳の印・パスワードを決めるリンクの回数・本人に渡した印・本人確認の代理提出・権限
-- 本人確認の書類の置き場（その人のフォルダ）
create function pg_temp.doc(p_user uuid) returns text language sql as $f$
  select p_user::text || '/' || gen_random_uuid()::text || '.webp';
$f$;
create function pg_temp.today() returns date language sql as $f$ select (now() at time zone 'Asia/Tokyo')::date; $f$;
create function pg_temp.reg(p_admin uuid, p_user uuid, p_note text default '') returns text language sql as $f$
  select format('select public.admin_proxy_register(%L, %L, %L)', p_admin, p_user, p_note);
$f$;

do $t$
declare
  adm uuid; adm2 uuid; b1 uuid;
  u1 uuid; u2 uuid; u3 uuid; u4 uuid; u5 uuid;
  x1 uuid; x2 uuid; x3 uuid; x4 uuid;
  r text; app uuid;
begin
  adm := pg_temp.mkuser('運営', 'buyer');
  adm2 := pg_temp.mkuser('運営2', 'buyer');
  insert into public.admin_users (user_id) values (adm), (adm2);
  b1 := pg_temp.mkuser('たろう', 'buyer');

  -- 1. 代理登録の印 -----------------------------------------------------------------
  u1 := pg_temp.mkuser('代理1', 'seller', 'unsubmitted');
  perform pg_temp.ng('P01 匿名からは呼べない', null, 'anon', pg_temp.reg(adm, u1), 'permission denied');
  perform pg_temp.ng('P02 画面（ログイン中）からは呼べない', adm, 'authenticated', pg_temp.reg(adm, u1), 'permission denied');
  perform pg_temp.ng('P03 管理者でない id では登録できない', null, 'service_role', pg_temp.reg(b1, u1), 'not_admin');
  perform pg_temp.ng('P04 自分自身は登録できない', null, 'service_role', pg_temp.reg(adm, adm), 'bad_request');
  perform pg_temp.ng('P05 管理者は代理登録の扱いにできない', null, 'service_role', pg_temp.reg(adm, adm2), 'bad_request');
  perform pg_temp.ng('P06 メモは200文字まで', null, 'service_role', pg_temp.reg(adm, u1, repeat('あ', 201)), 'bad_request');

  x1 := pg_temp.mkuser('古い人', 'buyer', 'unsubmitted');
  update public.profiles set created_at = now() - interval '11 minutes' where id = x1;
  perform pg_temp.ng('P07 作って10分を過ぎた人は登録できない', null, 'service_role', pg_temp.reg(adm, x1), 'bad_state');
  x2 := pg_temp.mkuser('ログイン済み', 'buyer', 'unsubmitted');
  update auth.users set last_sign_in_at = now() where id = x2;
  perform pg_temp.ng('P08 一度でもログインした人は登録できない', null, 'service_role', pg_temp.reg(adm, x2), 'bad_state');
  x3 := pg_temp.mkuser('確認済み', 'buyer', 'approved');
  perform pg_temp.ng('P09 本人確認が済んだ人は登録できない', null, 'service_role', pg_temp.reg(adm, x3), 'bad_state');
  x4 := pg_temp.mkuser('停止中', 'buyer', 'unsubmitted');
  update public.profiles set status = 'suspended' where id = x4;
  perform pg_temp.ng('P10 停止中の人は登録できない', null, 'service_role', pg_temp.reg(adm, x4), 'bad_state');
  perform pg_temp.ng('P11 知らない id は登録できない', null, 'service_role', pg_temp.reg(adm, gen_random_uuid()), 'bad_state');

  perform pg_temp.ok('P12 代理登録できる', null, 'service_role', pg_temp.reg(adm, u1, E'LINE で依頼\nあり'));
  perform pg_temp.eq('P13 台帳に載る（登録した運営・制御文字は空白に）', null, 'postgres',
    format('select registered_by::text || %L || note || %L || link_issue_count || %L || (handed_over_at is null) from public.proxy_registrations where user_id = %L', '/', '/', '/', u1),
    adm::text || '/LINE で依頼 あり/0/true');
  perform pg_temp.ng('P14 2回は登録できない', null, 'service_role', pg_temp.reg(adm, u1), 'bad_state');
  perform pg_temp.eq('P15 監査ログに残る', null, 'postgres',
    format('select count(*)::text from public.audit_logs where action = %L and actor_id = %L and target_type = %L and target_id = %L', 'user.proxy_register', adm, 'user', u1), '1');
  perform pg_temp.eq('P16 断った人は台帳に載らない', null, 'postgres',
    format('select count(*)::text from public.proxy_registrations where user_id in (%L, %L, %L, %L, %L)', x1, x2, x3, x4, adm2), '0');

  -- 台帳の表そのもの
  perform pg_temp.ng('P20 service_role でも表に直接は書けない', null, 'service_role',
    format('insert into public.proxy_registrations (user_id, registered_by) values (%L, %L)', x1, adm), 'permission denied');
  perform pg_temp.ng('P21 service_role でも表を直接は書き換えられない', null, 'service_role',
    format('update public.proxy_registrations set handed_over_at = now() where user_id = %L', u1), 'permission denied');
  perform pg_temp.ng('P22 本人からは台帳を読めない', u1, 'authenticated', 'select count(*) from public.proxy_registrations', 'permission denied');
  perform pg_temp.ng('P23 匿名からは台帳を読めない', null, 'anon', 'select count(*) from public.proxy_registrations', 'permission denied');

  -- 2. パスワードを決めるリンク ------------------------------------------------------
  perform pg_temp.ng('L01 画面（ログイン中）からは呼べない', adm, 'authenticated', format('select public.admin_proxy_link_issued(%L, %L)', adm, u1), 'permission denied');
  perform pg_temp.ng('L02 管理者でない id では作れない', null, 'service_role', format('select public.admin_proxy_link_issued(%L, %L)', b1, u1), 'not_admin');
  perform pg_temp.ng('L03 ふつうに登録した人には作れない', null, 'service_role', format('select public.admin_proxy_link_issued(%L, %L)', adm, b1), 'bad_state');
  perform pg_temp.eq('L04 1回目', null, 'service_role', format('select public.admin_proxy_link_issued(%L, %L)::text', adm, u1), '1');
  perform pg_temp.eq('L05 作り直すと回数が増える', null, 'service_role', format('select public.admin_proxy_link_issued(%L, %L)::text', adm, u1), '2');
  perform pg_temp.eq('L06 監査ログに回数つきで残る', null, 'postgres',
    format('select string_agg(detail ->> %L, %L order by detail ->> %L) from public.audit_logs where action = %L and target_id = %L', 'count', ',', 'count', 'user.proxy_link', u1), '1,2');

  u2 := pg_temp.mkuser('代理2', 'buyer', 'unsubmitted');
  perform pg_temp.ok('L07 2人目を代理登録', null, 'service_role', pg_temp.reg(adm2, u2));
  update public.profiles set status = 'suspended' where id = u2;
  perform pg_temp.ng('L08 停止中の人には作れない', null, 'service_role', format('select public.admin_proxy_link_issued(%L, %L)', adm, u2), 'bad_state');
  perform pg_temp.eq('L09 断ったときは回数が増えない', null, 'postgres', format('select link_issue_count::text from public.proxy_registrations where user_id = %L', u2), '0');

  -- 3. 本人に渡した印 --------------------------------------------------------------
  perform pg_temp.ng('H01 画面（ログイン中）からは呼べない', u1, 'authenticated', format('select public.proxy_mark_handed_over(%L)', u1), 'permission denied');
  perform pg_temp.eq('H02 ふつうに登録した人は何もしない', null, 'service_role', format('select public.proxy_mark_handed_over(%L)::text', b1), 'false');
  perform pg_temp.eq('H03 代理登録した人は渡した印が付く', null, 'service_role', format('select public.proxy_mark_handed_over(%L)::text', u1), 'true');
  perform pg_temp.eq('H04 2回目は何もしない', null, 'service_role', format('select public.proxy_mark_handed_over(%L)::text', u1), 'false');
  perform pg_temp.eq('H05 監査ログは本人の名前で1回だけ', null, 'postgres',
    format('select count(*)::text from public.audit_logs where action = %L and actor_id = %L and target_id = %L', 'user.proxy_handover', u1, u1), '1');
  perform pg_temp.ng('H06 渡したあとはリンクを作れない', null, 'service_role', format('select public.admin_proxy_link_issued(%L, %L)', adm, u1), 'bad_state');
  perform pg_temp.eq('H07 断ったときは回数が増えない', null, 'postgres', format('select link_issue_count::text from public.proxy_registrations where user_id = %L', u1), '2');

  -- 4. 本人確認の代理提出 -----------------------------------------------------------
  u3 := pg_temp.mkuser('代理3', 'seller', 'unsubmitted');
  perform pg_temp.ok('S00 3人目を代理登録', null, 'service_role', pg_temp.reg(adm, u3));
  perform pg_temp.ng('S01 画面（ログイン中）からは呼べない', adm, 'authenticated',
    format('select public.admin_proxy_submit_kyc(%L, %L, %L, array[%L], %L::date)', adm, u3, 'license', pg_temp.doc(u3), '1995-04-01'), 'permission denied');
  perform pg_temp.ng('S02 管理者でない id では出せない', null, 'service_role',
    format('select public.admin_proxy_submit_kyc(%L, %L, %L, array[%L], %L::date)', b1, u3, 'license', pg_temp.doc(u3), '1995-04-01'), 'not_admin');
  perform pg_temp.ng('S03 自分の分は出せない', null, 'service_role',
    format('select public.admin_proxy_submit_kyc(%L, %L, %L, array[%L], %L::date)', adm, adm, 'license', pg_temp.doc(adm), '1995-04-01'), 'bad_request');
  perform pg_temp.ng('S04 ふつうに登録した人の分は出せない', null, 'service_role',
    format('select public.admin_proxy_submit_kyc(%L, %L, %L, array[%L], %L::date)', adm, b1, 'license', pg_temp.doc(b1), '1995-04-01'), 'bad_state');
  perform pg_temp.ng('S05 他人のフォルダの書類は使えない', null, 'service_role',
    format('select public.admin_proxy_submit_kyc(%L, %L, %L, array[%L], %L::date)', adm, u3, 'license', pg_temp.doc(b1), '1995-04-01'), 'bad_kyc');
  r := pg_temp.val(null, 'service_role',
    format('select public.admin_proxy_submit_kyc(%L, %L, %L, array[%L, %L], %L::date)::text', adm, u3, 'license', pg_temp.doc(u3), pg_temp.doc(u3), '1995-04-01'));
  perform pg_temp.chk('S06 代理で出せる', r !~ '^ERR' and r::jsonb ->> 'status' = 'pending', r);
  app := (r::jsonb ->> 'app_id')::uuid;
  perform pg_temp.eq('S07 出した運営が申請に残る', null, 'postgres',
    format('select submitted_by::text || %L || provider || %L || status from public.kyc_applications where id = %L', '/', '/', app), adm::text || '/manual/pending');
  perform pg_temp.eq('S08 本人の印は審査中', u3, 'authenticated', 'select kyc_status from public.my_profile()', 'pending');
  perform pg_temp.eq('S09 監査ログに申請と本人が残る', null, 'postgres',
    format('select count(*)::text from public.audit_logs where action = %L and actor_id = %L and target_type = %L and target_id = %L and detail ->> %L = %L',
      'kyc.proxy_submit', adm, 'kyc', app, 'user', u3), '1');
  perform pg_temp.ng('S10 審査中は2回目を出せない', null, 'service_role',
    format('select public.admin_proxy_submit_kyc(%L, %L, %L, array[%L], %L::date)', adm, u3, 'license', pg_temp.doc(u3), '1995-04-01'), 'kyc_in_progress');
  perform pg_temp.ng('S11 本人からは出した運営の列を読めない', u3, 'authenticated',
    format('select submitted_by from public.kyc_applications where id = %L', app), 'permission denied');
  perform pg_temp.eq('S12 本人は自分の申請をふつうに読める', u3, 'authenticated',
    format('select status from public.kyc_applications where id = %L', app), 'pending');
  perform pg_temp.ok('S13 審査はふつうどおり（別の運営が承認）', null, 'service_role', format('select public.admin_kyc_decide(%L, %L, true, %L)', adm2, app, ''));
  perform pg_temp.eq('S14 承認されると確認済み', u3, 'authenticated', 'select kyc_status from public.my_profile()', 'approved');

  -- 本人が出した申請には、出した運営は入らない
  u4 := pg_temp.mkuser('代理4', 'buyer', 'unsubmitted');
  perform pg_temp.ok('S20 4人目を代理登録', null, 'service_role', pg_temp.reg(adm, u4));
  r := pg_temp.val(null, 'service_role', format('select public.submit_kyc(%L, %L, %L, array[%L], %L::date)::text', u4, 'manual', 'passport', pg_temp.doc(u4), '1990-01-01'));
  perform pg_temp.eq('S21 本人が出した申請は出した運営が空', null, 'postgres',
    format('select (submitted_by is null)::text from public.kyc_applications where id = %L', (r::jsonb ->> 'app_id')::uuid), 'true');

  -- 18歳未満は代理でも止まる（書類は消す対象になり、利用を止める）
  u5 := pg_temp.mkuser('代理5', 'buyer', 'unsubmitted');
  perform pg_temp.ok('S30 5人目を代理登録', null, 'service_role', pg_temp.reg(adm, u5));
  r := pg_temp.val(null, 'service_role', format('select public.admin_proxy_submit_kyc(%L, %L, %L, array[%L], %L::date)::text',
    adm, u5, 'license', pg_temp.doc(u5), (pg_temp.today() - interval '17 years')::date));
  perform pg_temp.chk('S31 18歳未満は却下して書類を消す対象に', r !~ '^ERR' and r::jsonb ->> 'status' = 'rejected_underage' and jsonb_array_length(r::jsonb -> 'purge_paths') = 1, r);
  perform pg_temp.eq('S32 18歳未満は利用を止める', null, 'postgres', format('select status from public.profiles where id = %L', u5), 'suspended');
  perform pg_temp.ng('S33 止めたあとはリンクを作れない', null, 'service_role', format('select public.admin_proxy_link_issued(%L, %L)', adm, u5), 'bad_state');
end $t$;
