-- 14 キャラを最初から作る（0020）: 作ってすぐの売手に印を付ける・パスワードを決めるリンクの回数・パスワードを決めた印
-- 決まり: 作れるのは代理登録と同じ「作ってすぐの売手」だけ（未提出・10分以内・一度もログインしていない・代理登録でも印でもない）。
--         印は created_via = 'create' で入れ、本人確認は済みにする。代理登録の台帳には入れない。
--         リンクは create の印で、パスワードを決める前の、止めていない人だけ。パスワードを決めた印は1回だけ（本人の名義）。
create function pg_temp.cre(p_admin uuid, p_user uuid, p_note text default '') returns text language sql as $f$
  select format('select public.admin_create_character(%L, %L, %L)', p_admin, p_user, p_note);
$f$;
create function pg_temp.lnk(p_admin uuid, p_user uuid) returns text language sql as $f$
  select format('select public.admin_character_link_issued(%L, %L)::text', p_admin, p_user);
$f$;
create function pg_temp.pwd(p_user uuid) returns text language sql as $f$
  select format('select public.character_mark_password_set(%L)::text', p_user);
$f$;

do $t$
declare
  adm uuid; adm2 uuid; s1 uuid; c1 uuid; c2 uuid; m2 uuid;
  b1 uuid; old uuid; signed uuid; prx uuid; mk uuid; sus uuid; pend uuid; appr uuid;
  ng_ids uuid[];
begin
  adm := pg_temp.mkuser('運営', 'buyer');
  adm2 := pg_temp.mkuser('運営2', 'buyer');
  insert into public.admin_users (user_id) values (adm), (adm2);
  s1 := pg_temp.mkuser('みさき', 'seller');                     -- ふつうの売手（印なし）
  c1 := pg_temp.mkuser('新キャラ', 'seller', 'unsubmitted');     -- 管理画面で作ってすぐの売手

  -- K01 呼べる人 -----------------------------------------------------------------
  perform pg_temp.ng('K01 作る関数は匿名から呼べない', null, 'anon', pg_temp.cre(adm, c1), 'permission denied');
  perform pg_temp.ng('K01b 作る関数は画面（ログイン中の管理者）から呼べない', adm, 'authenticated', pg_temp.cre(adm, c1), 'permission denied');
  perform pg_temp.ng('K01c リンクの関数は匿名から呼べない', null, 'anon', pg_temp.lnk(adm, c1), 'permission denied');
  perform pg_temp.ng('K01d リンクの関数は画面から呼べない', adm, 'authenticated', pg_temp.lnk(adm, c1), 'permission denied');
  perform pg_temp.ng('K01e パスワードの印の関数は匿名から呼べない', null, 'anon', pg_temp.pwd(c1), 'permission denied');
  perform pg_temp.ng('K01f パスワードの印の関数は本人の画面からも呼べない', c1, 'authenticated', pg_temp.pwd(c1), 'permission denied');

  -- K02 管理者でない・頼みの形が違う ---------------------------------------------------
  perform pg_temp.ng('K02 作る: 管理者でない id は断る', null, 'service_role', pg_temp.cre(s1, c1), 'not_admin');
  perform pg_temp.ng('K02b リンク: 管理者でない id は断る', null, 'service_role', pg_temp.lnk(s1, c1), 'not_admin');
  perform pg_temp.ng('K02c 自分自身はキャラにできない', null, 'service_role', pg_temp.cre(adm, adm), 'bad_request');
  perform pg_temp.ng('K02d 管理者はキャラにできない', null, 'service_role', pg_temp.cre(adm, adm2), 'bad_request');
  perform pg_temp.ng('K02e メモは200文字まで', null, 'service_role', pg_temp.cre(adm, c1, repeat('あ', 201)), 'bad_request');
  perform pg_temp.eq('K02f 断ったあと、印も本人確認もそのまま', null, 'postgres',
    format('select (select count(*) from public.character_accounts where user_id = %L) || %L || kyc_status from public.profiles where id = %L', c1, '/', c1),
    '0/unsubmitted');

  -- K03 作ってすぐの売手をキャラにする ---------------------------------------------------
  perform pg_temp.ok('K03 作ってすぐの売手をキャラにできる', null, 'service_role', pg_temp.cre(adm, c1, E'メインの\nキャラ'));
  perform pg_temp.eq('K03b 印の行: 道は create・メモ（制御文字は空白）・付けた人・リンクとパスワードはまだ', null, 'postgres',
    format('select created_via || %L || note || %L || (marked_by = %L)::text || %L || link_issue_count || %L || (password_set_at is null and link_issued_at is null)::text from public.character_accounts where user_id = %L',
      '/', '/', adm, '/', '/', c1),
    'create/メインの キャラ/true/0/true');
  perform pg_temp.eq('K03c 本人確認が済みになる', null, 'postgres', format('select kyc_status from public.profiles where id = %L', c1), 'approved');
  perform pg_temp.eq('K03d 記録が2件（管理者の名義）', null, 'postgres',
    format('select string_agg(action, %L order by action) from public.audit_logs where actor_id = %L and target_id = %L', ',', adm, c1),
    'kyc.character_skip,user.character_create');
  perform pg_temp.eq('K03e 代理登録の台帳には載らない', null, 'postgres',
    format('select count(*)::text from public.proxy_registrations where user_id = %L', c1), '0');
  perform pg_temp.ng('K03f 同じ人を2回は作れない', null, 'service_role', pg_temp.cre(adm, c1), 'bad_state');

  -- K04 作ってすぐの売手でない人は断る -------------------------------------------------
  b1 := pg_temp.mkuser('購入者', 'buyer', 'unsubmitted');
  old := pg_temp.mkuser('古い人', 'seller', 'unsubmitted');
  update public.profiles set created_at = now() - interval '11 minutes' where id = old;
  signed := pg_temp.mkuser('ログイン済み', 'seller', 'unsubmitted');
  update auth.users set last_sign_in_at = now() where id = signed;
  prx := pg_temp.mkuser('代理の人', 'seller', 'unsubmitted');
  insert into public.proxy_registrations (user_id, registered_by) values (prx, adm);   -- 代理登録の台帳だけ（本人確認は未提出のまま）
  mk := pg_temp.mkuser('印あり', 'seller', 'unsubmitted');
  insert into public.character_accounts (user_id, marked_by) values (mk, adm);         -- 印だけ（本人確認は未提出のまま）
  sus := pg_temp.mkuser('停止中', 'seller', 'unsubmitted');
  update public.profiles set status = 'suspended' where id = sus;
  pend := pg_temp.mkuser('審査中', 'seller', 'pending');
  appr := pg_temp.mkuser('確認済み', 'seller', 'approved');
  ng_ids := array[b1, old, signed, prx, mk, sus, pend, appr];

  perform pg_temp.ng('K04 購入者は作れない', null, 'service_role', pg_temp.cre(adm, b1), 'bad_state');
  perform pg_temp.ng('K04b 作って10分を過ぎた人は作れない', null, 'service_role', pg_temp.cre(adm, old), 'bad_state');
  perform pg_temp.ng('K04c 一度でもログインした人は作れない', null, 'service_role', pg_temp.cre(adm, signed), 'bad_state');
  perform pg_temp.ng('K04d 代理登録の人は作れない', null, 'service_role', pg_temp.cre(adm, prx), 'bad_state');
  perform pg_temp.ng('K04e もう印がある人は作れない', null, 'service_role', pg_temp.cre(adm, mk), 'bad_state');
  perform pg_temp.ng('K04f 停止中の人は作れない', null, 'service_role', pg_temp.cre(adm, sus), 'bad_state');
  perform pg_temp.ng('K04g 本人確認の審査中の人は作れない', null, 'service_role', pg_temp.cre(adm, pend), 'bad_state');
  perform pg_temp.ng('K04h 本人確認が済んだ人は作れない', null, 'service_role', pg_temp.cre(adm, appr), 'bad_state');
  perform pg_temp.ng('K04i 知らない id は作れない', null, 'service_role', pg_temp.cre(adm, gen_random_uuid()), 'bad_state');
  perform pg_temp.eq('K04j 断ったあと、印は前から付いていた1行だけ（道は mark）', null, 'postgres',
    format('select count(*) || %L || string_agg(created_via, %L) from public.character_accounts where user_id = any(%L::uuid[])', '/', ',', ng_ids), '1/mark');
  perform pg_temp.eq('K04k 断ったあと、本人確認はそのまま', null, 'postgres',
    format('select string_agg(kyc_status, %L order by kyc_status) from public.profiles where id = any(%L::uuid[])', ',', ng_ids),
    'approved,pending,unsubmitted,unsubmitted,unsubmitted,unsubmitted,unsubmitted,unsubmitted');
  perform pg_temp.eq('K04l 断ったあと、作った記録も省いた記録も無い', null, 'postgres',
    format('select count(*)::text from public.audit_logs where action in (%L, %L) and target_id = any(%L::text[])', 'user.character_create', 'kyc.character_skip', ng_ids),
    '0');

  -- K05 パスワードを決めるリンク --------------------------------------------------------
  perform pg_temp.eq('K05 リンクの1回目', null, 'service_role', pg_temp.lnk(adm, c1), '1');
  perform pg_temp.eq('K05b 作り直すと回数が増える（別の管理者でも）', null, 'service_role', pg_temp.lnk(adm2, c1), '2');
  perform pg_temp.eq('K05c 回数と時刻が残る', null, 'postgres',
    format('select link_issue_count || %L || (link_issued_at is not null)::text from public.character_accounts where user_id = %L', '/', c1), '2/true');
  perform pg_temp.eq('K05d 記録に回数つきで残る', null, 'postgres',
    format('select string_agg(detail ->> %L, %L order by detail ->> %L) from public.audit_logs where action = %L and target_id = %L', 'count', ',', 'count', 'user.character_link', c1),
    '1,2');
  perform pg_temp.ng('K05e これまでの「キャラにする」（mark）の人には作れない', null, 'service_role', pg_temp.lnk(adm, mk), 'bad_state');
  perform pg_temp.ng('K05f 印の無い売手には作れない', null, 'service_role', pg_temp.lnk(adm, s1), 'bad_state');
  perform pg_temp.ng('K05g 代理登録の人には作れない', null, 'service_role', pg_temp.lnk(adm, prx), 'bad_state');
  c2 := pg_temp.mkuser('新キャラ2', 'seller', 'unsubmitted');
  perform pg_temp.ok('K05h 2人目を作る', null, 'service_role', pg_temp.cre(adm, c2));
  update public.profiles set status = 'suspended' where id = c2;
  perform pg_temp.ng('K05i 止めたキャラには作れない', null, 'service_role', pg_temp.lnk(adm, c2), 'bad_state');
  perform pg_temp.eq('K05j 断ったときは回数が増えない', null, 'postgres',
    format('select string_agg(link_issue_count::text, %L order by link_issue_count) from public.character_accounts where user_id in (%L, %L)', ',', c2, mk), '0,0');

  -- K06 パスワードを決めた印 -----------------------------------------------------------
  perform pg_temp.eq('K06 作ったキャラは、パスワードを決めた印が付く', null, 'service_role', pg_temp.pwd(c1), 'true');
  perform pg_temp.eq('K06b 2回目は何もしない', null, 'service_role', pg_temp.pwd(c1), 'false');
  perform pg_temp.eq('K06c 印の時刻が入り、記録は本人の名義で1回だけ', null, 'postgres',
    format('select (select (password_set_at is not null)::text from public.character_accounts where user_id = %L) || %L || count(*) from public.audit_logs where action = %L and actor_id = %L and target_id = %L',
      c1, '/', 'user.character_password', c1, c1),
    'true/1');
  perform pg_temp.eq('K06d 印の無い売手は false', null, 'service_role', pg_temp.pwd(s1), 'false');
  perform pg_temp.eq('K06e 代理登録の人も false（代理登録の印は別の関数）', null, 'service_role', pg_temp.pwd(prx), 'false');
  perform pg_temp.eq('K06f 知らない id も false', null, 'service_role', pg_temp.pwd(gen_random_uuid()), 'false');
  perform pg_temp.eq('K06g 印の無い人には何も入らない', null, 'postgres',
    format('select (select count(*) from public.character_accounts where user_id in (%L, %L)) || %L || count(*) from public.audit_logs where action = %L and target_id in (%L, %L)',
      s1, prx, '/', 'user.character_password', s1, prx),
    '0/0');
  perform pg_temp.ng('K06h パスワードを決めたあとはリンクを作れない', null, 'service_role', pg_temp.lnk(adm, c1), 'bad_state');
  perform pg_temp.eq('K06i 断ったときは回数が増えない', null, 'postgres',
    format('select link_issue_count::text from public.character_accounts where user_id = %L', c1), '2');

  -- K07 これまでの「キャラにする」はそのまま -----------------------------------------------
  m2 := pg_temp.mkuser('印のキャラ', 'seller', 'unsubmitted');
  perform pg_temp.ok('K07 これまでの「キャラにする」も使える', null, 'service_role',
    format('select public.admin_mark_character(%L, %L, %L)', adm, m2, ''));
  perform pg_temp.eq('K07b これまでの道で付けた印は mark・リンクの回数は0', null, 'postgres',
    format('select created_via || %L || link_issue_count from public.character_accounts where user_id = %L', '/', m2), 'mark/0');
  perform pg_temp.ng('K07c service_role から印の表へ直接は書けない（新しい列も）', null, 'service_role',
    format('update public.character_accounts set password_set_at = now() where user_id = %L', m2), 'permission denied');
end $t$;
