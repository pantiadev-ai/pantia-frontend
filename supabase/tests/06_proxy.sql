-- 06 代理登録（0010・0013）: 台帳の印・本人確認を省く・パスワードを決めるリンクの回数・本人に渡した印・権限
-- 本人確認の書類の置き場（その人のフォルダ）
create function pg_temp.doc(p_user uuid) returns text language sql as $f$
  select p_user::text || '/' || gen_random_uuid()::text || '.webp';
$f$;
create function pg_temp.reg(p_admin uuid, p_user uuid, p_note text default '') returns text language sql as $f$
  select format('select public.admin_proxy_register(%L, %L, %L)', p_admin, p_user, p_note);
$f$;

do $t$
declare
  adm uuid; adm2 uuid; b1 uuid;
  u1 uuid; u2 uuid; u3 uuid;
  x1 uuid; x2 uuid; x3 uuid; x4 uuid;
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
  -- 代理で登録した人は、書類の提出と審査を省いて、その場で確認済みにする（0013）
  perform pg_temp.eq('P17 代理登録すると本人確認は確認済み', u1, 'authenticated', 'select kyc_status from public.my_profile()', 'approved');
  perform pg_temp.eq('P18 本人確認を省いたことが監査ログに残る', null, 'postgres',
    format('select count(*)::text from public.audit_logs where action = %L and actor_id = %L and target_type = %L and target_id = %L', 'kyc.proxy_skip', adm, 'user', u1), '1');
  perform pg_temp.eq('P19 断った人の本人確認はそのままで、省いた記録も残らない', null, 'postgres',
    format('select ((select count(*) from public.profiles where id in (%L, %L, %L) and kyc_status <> %L)'
      || ' + (select count(*) from public.audit_logs where action = %L and target_id in (%L, %L, %L, %L, %L)))::text',
      x1, x2, x4, 'unsubmitted', 'kyc.proxy_skip', x1, x2, x3, x4, adm2), '0');

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

  -- 4. 代理登録では本人確認を出さない（0013。書類の提出と審査の工程を無くした） -------------------
  u3 := pg_temp.mkuser('代理3', 'seller', 'unsubmitted');
  perform pg_temp.ok('S00 3人目を代理登録', null, 'service_role', pg_temp.reg(adm, u3));
  perform pg_temp.eq('S01 登録しただけで、確認済みの利用者になる', null, 'postgres', format('select public.is_verified(%L)::text', u3), 'true');
  perform pg_temp.ng('S02 代理で本人確認を出す関数はもう無い', null, 'service_role',
    format('select public.admin_proxy_submit_kyc(%L, %L, %L, array[%L], %L::date)', adm, u3, 'license', pg_temp.doc(u3), '1995-04-01'), 'does not exist');
  perform pg_temp.ng('S03 本人が出そうとしても、済んでいるので出せない', null, 'service_role',
    format('select public.submit_kyc(%L, %L, %L, array[%L], %L::date)', u3, 'manual', 'license', pg_temp.doc(u3), '1995-04-01'), 'kyc_in_progress');
  perform pg_temp.eq('S04 申請は作られない', null, 'postgres', format('select count(*)::text from public.kyc_applications where user_id = %L', u3), '0');
end $t$;
