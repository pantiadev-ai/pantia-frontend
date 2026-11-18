-- 11 キャラ（運営で入れた売手）の印と、管理画面からキャラの名前で出す出品
-- 出品の中身（saveListing の row と同じ26列）。p_extra で上書き・足す
create function pg_temp.crow(p_owner uuid, p_extra jsonb default '{}'::jsonb) returns jsonb language sql as $f$
  select jsonb_build_object(
    'title', 'キャラの商品', 'description', '説明です', 'category', 'panty', 'worn_days', 2,
    'material', 'cotton', 'color', 'white', 'size', 'M', 'price', 3000, 'stock_mode', 'single',
    'opt_photo', true, 'opt_letter', true, 'opt_ziplock', false, 'opt_card', false,
    'opt_video', false, 'opt_extend', false, 'max_worn_days', null, 'request_only', false,
    'same_day', true, 'anonymous_ok', false, 'pre_message_ok', true, 'followers_only', false,
    'cool_shipping', false, 'ship_estimate', 'same_next', 'ng_note', '', 'paid_options', '[]'::jsonb,
    'image_paths', jsonb_build_array(p_owner::text || '/' || gen_random_uuid()::text || '.webp')
  ) || p_extra;
$f$;
-- 管理画面（service_role）からキャラの出品を作る SQL
create function pg_temp.mk(p_admin uuid, p_seller uuid, p_row jsonb, p_publish boolean) returns text language sql as $f$
  select format('select public.admin_create_character_listing(%L, %L, %L::jsonb, %L)::text', p_admin, p_seller, p_row, p_publish);
$f$;

do $t$
declare
  adm uuid; ch uuid; ch2 uuid; s1 uuid; b1 uuid; sus uuid; fan uuid; pend uuid; rej uuid; prx uuid;
  r text; lc uuid; ld uuid; lx uuid;
begin
  adm := pg_temp.mkuser('運営', 'buyer');
  insert into public.admin_users (user_id) values (adm);
  ch := pg_temp.mkuser('キャラ花子', 'seller', 'unsubmitted');   -- 本人確認がまだのキャラ
  ch2 := pg_temp.mkuser('キャラ二号', 'seller');                 -- 本人確認が済みのキャラ
  s1 := pg_temp.mkuser('みさき', 'seller');                      -- ふつうの売手（印なし）
  b1 := pg_temp.mkuser('たろう', 'buyer');
  sus := pg_temp.mkuser('停止中', 'seller');
  update public.profiles set status = 'suspended' where id = sus;
  fan := pg_temp.mkuser('ファン', 'buyer');
  -- 本物の売手（書類を出した人・代理登録の人）。印を付けると書類なしで「確認済み」になってしまう
  pend := pg_temp.mkuser('審査中', 'seller', 'pending');
  rej := pg_temp.mkuser('却下', 'seller', 'rejected');
  prx := pg_temp.mkuser('代理の人', 'seller', 'unsubmitted');
  insert into public.proxy_registrations (user_id, registered_by) values (prx, adm);
  insert into public.follows (follower_id, seller_id) values (fan, ch);

  -- 呼べる人 -------------------------------------------------------------------
  perform pg_temp.ng('C01 印を付ける関数は匿名から呼べない', null, 'anon', format('select public.admin_mark_character(%L, %L, %L)', adm, ch, ''), 'permission denied');
  perform pg_temp.ng('C01b 印を付ける関数は画面（ログイン中の管理者）から呼べない', adm, 'authenticated', format('select public.admin_mark_character(%L, %L, %L)', adm, ch, ''), 'permission denied');
  perform pg_temp.ng('C01c 印を外す関数は匿名から呼べない', null, 'anon', format('select public.admin_unmark_character(%L, %L)', adm, ch), 'permission denied');
  perform pg_temp.ng('C01d 印を外す関数は画面から呼べない', adm, 'authenticated', format('select public.admin_unmark_character(%L, %L)', adm, ch), 'permission denied');
  perform pg_temp.ng('C01e 出品の関数は匿名から呼べない', null, 'anon', pg_temp.mk(adm, ch, pg_temp.crow(ch), true), 'permission denied');
  perform pg_temp.ng('C01f 出品の関数は画面から呼べない', adm, 'authenticated', pg_temp.mk(adm, ch, pg_temp.crow(ch), true), 'permission denied');
  perform pg_temp.ng('C01g 出品の関数はキャラ本人の画面からも呼べない', ch, 'authenticated', pg_temp.mk(adm, ch, pg_temp.crow(ch), true), 'permission denied');
  perform pg_temp.ng('C02 印を付ける: 管理者でない id は断る', null, 'service_role', format('select public.admin_mark_character(%L, %L, %L)', s1, ch, ''), 'not_admin');
  perform pg_temp.ng('C02b 印を外す: 管理者でない id は断る', null, 'service_role', format('select public.admin_unmark_character(%L, %L)', s1, ch), 'not_admin');
  perform pg_temp.ng('C02c 出品: 管理者でない id は断る', null, 'service_role', pg_temp.mk(s1, ch, pg_temp.crow(ch), true), 'not_admin');

  -- 印を付けられない人 ---------------------------------------------------------
  perform pg_temp.ng('C03 購入者には付けられない', null, 'service_role', format('select public.admin_mark_character(%L, %L, %L)', adm, b1, ''), 'bad_state');
  perform pg_temp.ng('C03b 停止中の人には付けられない', null, 'service_role', format('select public.admin_mark_character(%L, %L, %L)', adm, sus, ''), 'bad_state');
  perform pg_temp.ng('C03c 管理者自身には付けられない', null, 'service_role', format('select public.admin_mark_character(%L, %L, %L)', adm, adm, ''), 'bad_request');
  perform pg_temp.ng('C03d メモは200文字まで', null, 'service_role', format('select public.admin_mark_character(%L, %L, %L)', adm, ch, repeat('あ', 201)), 'bad_request');
  perform pg_temp.ng('C03e 無い人には付けられない', null, 'service_role', format('select public.admin_mark_character(%L, %L, %L)', adm, gen_random_uuid(), ''), 'bad_state');
  perform pg_temp.ng('C03g 本人確認の審査中の売手には付けられない', null, 'service_role', format('select public.admin_mark_character(%L, %L, %L)', adm, pend, ''), 'bad_state');
  perform pg_temp.ng('C03h 本人確認で断られた売手には付けられない', null, 'service_role', format('select public.admin_mark_character(%L, %L, %L)', adm, rej, ''), 'bad_state');
  perform pg_temp.ng('C03i 代理登録の売手には付けられない', null, 'service_role', format('select public.admin_mark_character(%L, %L, %L)', adm, prx, ''), 'bad_state');
  perform pg_temp.eq('C03j 断ったあと、3人の本人確認の状態はそのまま', null, 'postgres',
    format('select string_agg(kyc_status, %L order by kyc_status) from public.profiles where id in (%L, %L, %L)', '/', pend, rej, prx), 'pending/rejected/unsubmitted');
  perform pg_temp.eq('C03f 断ったあと印の行は無い', null, 'postgres', 'select count(*)::text from public.character_accounts', '0');

  -- 印を付ける -----------------------------------------------------------------
  perform pg_temp.ok('C04 売手に印を付けられる', null, 'service_role', format('select public.admin_mark_character(%L, %L, %L)', adm, ch, 'メインのキャラ'));
  perform pg_temp.eq('C04b 印の行にメモと付けた人が残る', null, 'postgres',
    format('select note || %L || (marked_by = %L)::text from public.character_accounts where user_id = %L', '/', adm, ch), 'メインのキャラ/true');
  perform pg_temp.eq('C04c 本人確認が済みになる', null, 'postgres', format('select kyc_status from public.profiles where id = %L', ch), 'approved');
  perform pg_temp.eq('C04d 監査に印を付けた記録（管理者の名義）', null, 'postgres',
    format('select count(*)::text from public.audit_logs where action = %L and actor_id = %L and target_id = %L', 'user.character_mark', adm, ch), '1');
  perform pg_temp.eq('C04e 監査に本人確認を省いた記録（管理者の名義）', null, 'postgres',
    format('select count(*)::text from public.audit_logs where action = %L and actor_id = %L and target_id = %L', 'kyc.character_skip', adm, ch), '1');
  perform pg_temp.ng('C04f 同じ人に2回は付けられない', null, 'service_role', format('select public.admin_mark_character(%L, %L, %L)', adm, ch, ''), 'bad_state');
  perform pg_temp.ok('C04g 本人確認が済みの売手にも付けられる', null, 'service_role', format('select public.admin_mark_character(%L, %L, %L)', adm, ch2, ''));
  perform pg_temp.eq('C04h 本人確認が済みの人には省いた記録を残さない', null, 'postgres',
    format('select count(*)::text from public.audit_logs where action = %L and target_id = %L', 'kyc.character_skip', ch2), '0');

  -- 印の表は利用者から見えない ---------------------------------------------------
  perform pg_temp.ng('C05 印の表は匿名から読めない', null, 'anon', 'select count(*) from public.character_accounts', 'permission denied');
  perform pg_temp.ng('C05b 印の表はキャラ本人の画面から読めない', ch, 'authenticated', 'select count(*) from public.character_accounts', 'permission denied');
  perform pg_temp.ng('C05c 印の表は管理者の画面からも読めない', adm, 'authenticated', 'select count(*) from public.character_accounts', 'permission denied');
  perform pg_temp.eq('C05d service_role は読める（管理画面用）', null, 'service_role', 'select count(*)::text from public.character_accounts', '2');
  perform pg_temp.ng('C05e service_role から印の表へ直接 insert できない', null, 'service_role',
    format('insert into public.character_accounts (user_id, marked_by) values (%L, %L)', s1, adm), 'permission denied');
  perform pg_temp.ng('C05f service_role から印の表を直接は消せない', null, 'service_role', 'delete from public.character_accounts', 'permission denied');

  -- 印の無い売手には出せない ---------------------------------------------------
  perform pg_temp.ng('C06 印の無い売手には出品できない', null, 'service_role', pg_temp.mk(adm, s1, pg_temp.crow(s1), true), 'bad_state');
  perform pg_temp.ng('C06b 購入者には出品できない', null, 'service_role', pg_temp.mk(adm, b1, pg_temp.crow(b1), false), 'bad_state');
  perform pg_temp.eq('C06c 断ったあと出品は無い', null, 'postgres', format('select count(*)::text from public.listings where seller_id in (%L, %L)', s1, b1), '0');

  -- キャラに出品する -----------------------------------------------------------
  r := pg_temp.val(null, 'service_role', pg_temp.mk(adm, ch, pg_temp.crow(ch), true));
  perform pg_temp.chk('C07 キャラに公開で出品できる', r !~ '^ERR', r);
  if r !~ '^ERR' then lc := r::uuid; end if;
  perform pg_temp.eq('C07b 名義はキャラ・公開・数は0・公開日が入る', null, 'postgres',
    format('select (seller_id = %L)::text || %L || status || %L || view_count || like_count || sales_count || %L || (published_at is not null)::text from public.listings where id = %L',
      ch, '/', '/', '/', lc), 'true/published/000/true');
  perform pg_temp.eq('C07c フォロワーに新着の通知が届く', null, 'postgres',
    format('select count(*)::text from public.notifications where user_id = %L and kind = %L and link = %L', fan, 'listing', '/items/' || lc::text), '1');
  perform pg_temp.eq('C07d 匿名から見える（キャラの名前の出品として）', null, 'anon', format('select (seller_id = %L)::text from public.listings where id = %L', ch, lc), 'true');

  perform pg_temp.ng('C08 写真が他人のフォルダなら止まる', null, 'service_role',
    pg_temp.mk(adm, ch, pg_temp.crow(ch, jsonb_build_object('image_paths', jsonb_build_array(s1::text || '/' || gen_random_uuid()::text || '.webp'))), true), 'listings_check');  -- paths_ok(image_paths, seller_id, 5) の制約。2列を見るので名前は listings_check
  perform pg_temp.ng('C08b 写真の形がおかしければ止まる', null, 'service_role',
    pg_temp.mk(adm, ch, pg_temp.crow(ch, jsonb_build_object('image_paths', jsonb_build_array(ch::text || '/../x.webp'))), false), 'listings_check');

  perform pg_temp.ng('C09 中身が足りないまま公開はできない', null, 'service_role',
    pg_temp.mk(adm, ch, pg_temp.crow(ch, jsonb_build_object('description', '', 'image_paths', '[]'::jsonb)), true), 'listings_complete');
  r := pg_temp.val(null, 'service_role', pg_temp.mk(adm, ch, pg_temp.crow(ch, jsonb_build_object('description', '', 'image_paths', '[]'::jsonb)), false));
  perform pg_temp.chk('C09b 下書きなら足りなくても保存できる', r !~ '^ERR', r);
  if r !~ '^ERR' then ld := r::uuid; end if;
  perform pg_temp.eq('C09c 下書きは公開日なし・通知なし', null, 'postgres',
    format('select status || %L || (published_at is null)::text || %L || (select count(*) from public.notifications n where n.link = %L) from public.listings where id = %L',
      '/', '/', '/items/' || coalesce(ld::text, ''), ld), 'draft/true/0');

  -- 名義・状態・数は関数が決める -----------------------------------------------
  r := pg_temp.val(null, 'service_role', pg_temp.mk(adm, ch, pg_temp.crow(ch, jsonb_build_object(
    'id', gen_random_uuid(), 'seller_id', s1, 'status', 'hidden', 'sales_count', 99, 'view_count', 50, 'like_count', 7,
    'published_at', '2000-01-01T00:00:00Z')), true));
  perform pg_temp.chk('C10 中身に余計な列があっても出品できる', r !~ '^ERR', r);
  if r !~ '^ERR' then lx := r::uuid; end if;
  perform pg_temp.eq('C10b 名義・状態・数・公開日は中身の値が効かない', null, 'postgres',
    format('select (seller_id = %L)::text || %L || status || %L || view_count || like_count || sales_count || %L || (published_at > now() - interval %L)::text from public.listings where id = %L',
      ch, '/', '/', '/', '1 hour', lx), 'true/published/000/true');

  -- 監査 -----------------------------------------------------------------------
  perform pg_temp.eq('C11 出品の記録が管理者の名義で残り、詳細にキャラの id', null, 'postgres',
    format('select count(*)::text from public.audit_logs where action = %L and actor_id = %L and detail ->> %L = %L',
      'listing.character_create', adm, 'seller_id', ch::text), '3');

  -- キャラでログインすれば、ふつうの売手の道で直せる -----------------------------
  perform pg_temp.ok('C12 キャラの画面から題を直せる', ch, 'authenticated', format('update public.listings set title = %L where id = %L', 'キャラが直した', lc));
  perform pg_temp.ok('C12b キャラの画面から非公開にできる', ch, 'authenticated', format('update public.listings set status = %L where id = %L', 'private', lc));
  perform pg_temp.eq('C12c 直した中身が残る', null, 'postgres', format('select title || %L || status from public.listings where id = %L', '/', lc), 'キャラが直した/private');
  perform pg_temp.eq('C12d ほかの売手からは直せない（0行）', s1, 'authenticated',
    format('with u as (update public.listings set title = %L where id = %L returning id) select count(*)::text from u', 'x', lc), '0');
  perform pg_temp.eq('C12e ほかの売手の操作で中身は変わらない', null, 'postgres', format('select title from public.listings where id = %L', lc), 'キャラが直した');

  -- キャラが停止中なら公開できない -----------------------------------------------
  update public.profiles set status = 'suspended' where id = ch2;
  perform pg_temp.ng('C06d 停止中のキャラには公開で出品できない', null, 'service_role', pg_temp.mk(adm, ch2, pg_temp.crow(ch2), true), 'bad_state');

  -- 印を外す -------------------------------------------------------------------
  perform pg_temp.ok('C13 印を外せる', null, 'service_role', format('select public.admin_unmark_character(%L, %L)', adm, ch));
  perform pg_temp.eq('C13b 印の行が消える', null, 'postgres', format('select count(*)::text from public.character_accounts where user_id = %L', ch), '0');
  perform pg_temp.ng('C13c 外したあとは出品できない', null, 'service_role', pg_temp.mk(adm, ch, pg_temp.crow(ch), false), 'bad_state');
  perform pg_temp.eq('C13d 出していた出品と本人確認はそのまま', null, 'postgres',
    format('select (select count(*) from public.listings l where l.seller_id = %L and l.status <> %L) || %L || kyc_status from public.profiles where id = %L', ch, 'deleted', '/', ch), '3/approved');
  perform pg_temp.eq('C13e 監査に外した記録（管理者の名義）', null, 'postgres',
    format('select count(*)::text from public.audit_logs where action = %L and actor_id = %L and target_id = %L', 'user.character_unmark', adm, ch), '1');
  perform pg_temp.ng('C13f 印の無い人からは外せない', null, 'service_role', format('select public.admin_unmark_character(%L, %L)', adm, ch), 'bad_state');
end $t$;
