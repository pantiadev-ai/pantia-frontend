-- 18 代理登録で作った人をキャラにする（0024。2026-11-27 に決めた）
--   ・代理登録の人にも「キャラにする」が使える。理由のメモが必須（空・空白だけは bad_reason）
--   ・それ以外の条件は 0017 と同じ（売手・利用中・本人確認が未提出か済み・印がまだ無い）
--   ・代理登録の行は触らない。外しても代理登録の行は残る
--   ・記録 user.character_mark の detail に from_proxy（true / false）を残す
do $t$
declare
  adm uuid; p1 uuid; p2 uuid; pho uuid; pend uuid; rej uuid; pb uuid; ps uuid; s1 uuid;
begin
  adm := pg_temp.mkuser('運営', 'buyer');
  insert into public.admin_users (user_id) values (adm);
  p1 := pg_temp.mkuser('代理の売手', 'seller');                 -- 代理登録（0013 で本人確認は済み）
  p2 := pg_temp.mkuser('代理の売手二', 'seller');
  pho := pg_temp.mkuser('渡し済みの代理', 'seller');            -- 本人にパスワードを渡し済み
  pend := pg_temp.mkuser('代理の審査中', 'seller', 'pending');
  rej := pg_temp.mkuser('代理の却下', 'seller', 'rejected');
  pb := pg_temp.mkuser('代理の購入者', 'buyer');
  ps := pg_temp.mkuser('代理の停止中', 'seller');
  update public.profiles set status = 'suspended' where id = ps;
  insert into public.proxy_registrations (user_id, registered_by, note) values
    (p1, adm, '電話で受付'), (p2, adm, ''), (pend, adm, ''), (rej, adm, ''), (pb, adm, ''), (ps, adm, '');
  insert into public.proxy_registrations (user_id, registered_by, handed_over_at) values (pho, adm, now());
  s1 := pg_temp.mkuser('ふつうの売手', 'seller');

  -- 呼べる人 -------------------------------------------------------------------
  perform pg_temp.ng('X07 画面（ログイン中の管理者）からは呼べない', adm, 'authenticated',
    format('select public.admin_mark_character(%L, %L, %L)', adm, p1, '理由'), 'permission denied');

  -- メモが要る -----------------------------------------------------------------
  perform pg_temp.ng('X02 代理登録の人はメモが空だと断る', null, 'service_role',
    format('select public.admin_mark_character(%L, %L, %L)', adm, p2, ''), 'bad_reason');
  perform pg_temp.ng('X02b 空白だけのメモも断る', null, 'service_role',
    format('select public.admin_mark_character(%L, %L, %L)', adm, p2, '　  '), 'bad_reason');
  perform pg_temp.ng('X02c 改行・タブだけのメモも断る', null, 'service_role',
    format('select public.admin_mark_character(%L, %L, %L)', adm, p2, E'\n\t'), 'bad_reason');
  perform pg_temp.ng('X02d メモが null でも断る', null, 'service_role',
    format('select public.admin_mark_character(%L, %L, null)', adm, p2), 'bad_reason');
  perform pg_temp.eq('X02e 断ったあと印は無く、本人確認と代理登録の行はそのまま', null, 'postgres',
    format('select (select count(*) from public.character_accounts c where c.user_id = %L) || %L || kyc_status || %L || (select count(*) from public.proxy_registrations x where x.user_id = %L) from public.profiles where id = %L',
      p2, '/', '/', p2, p2), '0/approved/1');

  -- 0017 と同じ条件で断る人 -----------------------------------------------------
  perform pg_temp.ng('X03 代理登録でも本人確認の審査中なら断る', null, 'service_role',
    format('select public.admin_mark_character(%L, %L, %L)', adm, pend, '理由'), 'bad_state');
  perform pg_temp.ng('X03b 代理登録でも本人確認で断られた人は断る', null, 'service_role',
    format('select public.admin_mark_character(%L, %L, %L)', adm, rej, '理由'), 'bad_state');
  perform pg_temp.ng('X04 代理登録の購入者は断る', null, 'service_role',
    format('select public.admin_mark_character(%L, %L, %L)', adm, pb, '理由'), 'bad_state');
  perform pg_temp.ng('X04b 代理登録で止めた人は断る', null, 'service_role',
    format('select public.admin_mark_character(%L, %L, %L)', adm, ps, '理由'), 'bad_state');
  -- 断った人の行だけ数える（画面の試験が残したキャラがあっても揺れないように）
  perform pg_temp.eq('X04c 断ったあと印の行は無い', null, 'postgres',
    format('select count(*)::text from public.character_accounts where user_id in (%L, %L, %L, %L, %L)', p2, pend, rej, pb, ps), '0');

  -- 付ける ---------------------------------------------------------------------
  perform pg_temp.ok('X01 代理登録の売手に、メモつきで印を付けられる', null, 'service_role',
    format('select public.admin_mark_character(%L, %L, %L)', adm, p1, '  先方の依頼でキャラに  '));
  perform pg_temp.eq('X01b 印の行に整えたメモと付けた人が残る（作り方は mark）', null, 'postgres',
    format('select note || %L || (marked_by = %L)::text || %L || created_via from public.character_accounts where user_id = %L', '/', adm, '/', p1),
    '先方の依頼でキャラに/true/mark');
  perform pg_temp.eq('X01c 代理登録の行はそのまま（メモも）', null, 'postgres',
    format('select count(*) || %L || max(note) from public.proxy_registrations where user_id = %L', '/', p1), '1/電話で受付');
  perform pg_temp.eq('X01d 本人確認は済みのまま・省いた記録は残さない', null, 'postgres',
    format('select kyc_status || %L || (select count(*) from public.audit_logs a where a.action = %L and a.target_id = %L) from public.profiles where id = %L',
      '/', 'kyc.character_skip', p1::text, p1), 'approved/0');
  perform pg_temp.ng('X01e 同じ人に2回は付けられない', null, 'service_role',
    format('select public.admin_mark_character(%L, %L, %L)', adm, p1, '理由'), 'bad_state');
  perform pg_temp.ok('X08 本人に渡し済みの代理登録の人も、メモがあれば付けられる（DB では止めない）', null, 'service_role',
    format('select public.admin_mark_character(%L, %L, %L)', adm, pho, '渡し済みだが本人の了承あり'));

  -- 記録 -----------------------------------------------------------------------
  perform pg_temp.ok('X05a ふつうの売手はメモなしで今までどおり付けられる', null, 'service_role',
    format('select public.admin_mark_character(%L, %L, %L)', adm, s1, ''));
  perform pg_temp.eq('X05 代理登録の人の記録は from_proxy が true でメモつき（管理者の名義）', null, 'postgres',
    format('select (detail ->> %L) || %L || (detail ->> %L) from public.audit_logs where action = %L and actor_id = %L and target_id = %L',
      'from_proxy', '/', 'note', 'user.character_mark', adm, p1::text), 'true/先方の依頼でキャラに');
  perform pg_temp.eq('X05b ふつうの売手の記録は from_proxy が false', null, 'postgres',
    format('select detail ->> %L from public.audit_logs where action = %L and target_id = %L', 'from_proxy', 'user.character_mark', s1::text), 'false');

  -- 外す -----------------------------------------------------------------------
  perform pg_temp.ok('X06 印を外せる', null, 'service_role', format('select public.admin_unmark_character(%L, %L)', adm, p1));
  perform pg_temp.eq('X06b 印だけ消え、代理登録の行は残る', null, 'postgres',
    format('select (select count(*) from public.character_accounts c where c.user_id = %L) || %L || (select count(*) from public.proxy_registrations x where x.user_id = %L)',
      p1, '/', p1), '0/1');
end $t$;
