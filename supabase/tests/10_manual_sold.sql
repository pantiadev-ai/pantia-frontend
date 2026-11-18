-- 10 手動の売り切れ（管理者が付けて戻す。本当の売上には数えない）
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

do $t$
declare
  adm uuid; s1 uuid; s2 uuid; b1 uuid; b2 uuid;
  lp uuid; lq uuid; ld uuid; lh uuid; lx uuid; lr uuid; lsold uuid; ls2 uuid; lhide uuid;
  o1 uuid;
begin
  adm := pg_temp.mkuser('運営', 'buyer');
  insert into public.admin_users (user_id) values (adm);
  s1 := pg_temp.mkuser('みさき', 'seller');
  s2 := pg_temp.mkuser('ゆい', 'seller');
  b1 := pg_temp.mkuser('たろう', 'buyer');
  b2 := pg_temp.mkuser('じろう', 'buyer');

  lp := pg_temp.listing(s1);                    -- 公開
  lq := pg_temp.listing(s1, 'published');       -- 公開 → 非公開にする
  perform pg_temp.ok('S00 非公開にする', s1, 'authenticated', format('update public.listings set status = %L where id = %L', 'private', lq));
  ld := pg_temp.listing(s1, 'draft');           -- 下書き
  lh := pg_temp.listing(s1);                    -- 非表示にする
  perform pg_temp.ok('S00b 運営が非表示にする', null, 'service_role', format('select public.admin_set_listing_status(%L, %L, %L, %L)', adm, lh, 'hidden', 'x'));
  lx := pg_temp.listing(s1);                    -- 削除する
  perform pg_temp.ok('S00c 出品者が消す', s1, 'authenticated', format('select public.delete_my_listing(%L)', lx));
  lr := pg_temp.listing(s1);                    -- 入金待ちの注文がある
  lsold := pg_temp.listing(s1);                 -- 本当に売れた
  ls2 := pg_temp.listing(s2);                   -- 売手が停止される
  lhide := pg_temp.listing(s1);                 -- 印のあと非表示にする

  -- 呼べる人 -------------------------------------------------------------------
  perform pg_temp.ng('S01 匿名からは呼べない', null, 'anon', format('select public.admin_mark_sold(%L, %L, %L)', adm, lp, ''), 'permission denied');
  perform pg_temp.ng('S01b 画面（ログイン中の管理者）からも呼べない', adm, 'authenticated', format('select public.admin_mark_sold(%L, %L, %L)', adm, lp, ''), 'permission denied');
  perform pg_temp.ng('S01c 戻す方も画面からは呼べない', adm, 'authenticated', format('select public.admin_unmark_sold(%L, %L)', adm, lp), 'permission denied');
  perform pg_temp.ng('S02 管理者でない id は断る', null, 'service_role', format('select public.admin_mark_sold(%L, %L, %L)', s1, lp, ''), 'not_admin');
  perform pg_temp.ng('S02b 戻す方も管理者でない id は断る', null, 'service_role', format('select public.admin_unmark_sold(%L, %L)', s1, lp), 'not_admin');

  -- 付ける ---------------------------------------------------------------------
  perform pg_temp.ok('S03 公開の出品を売り切れにできる', null, 'service_role', format('select public.admin_mark_sold(%L, %L, %L)', adm, lp, '店頭で売れた'));
  perform pg_temp.eq('S03b 状態は sold、売上の数は0のまま', null, 'postgres', format('select status || %L || sales_count from public.listings where id = %L', '/', lp), 'sold/0');
  perform pg_temp.eq('S03c 印の行に元の状態と理由が残る', null, 'postgres', format('select prev_status || %L || reason || %L || (marked_by = %L)::text from public.listing_manual_sold where listing_id = %L', '/', '/', adm, lp), 'published/店頭で売れた/true');
  perform pg_temp.eq('S03d 売手に知らせる', null, 'postgres', format('select count(*)::text from public.notifications where user_id = %L and kind = %L and title like %L', s1, 'system', '%運営が売り切れにしました%'), '1');
  perform pg_temp.ok('S03e 非公開の出品も売り切れにできる', null, 'service_role', format('select public.admin_mark_sold(%L, %L, %L)', adm, lq, ''));
  perform pg_temp.eq('S03f 非公開の元の状態が残る', null, 'postgres', format('select prev_status from public.listing_manual_sold where listing_id = %L', lq), 'private');
  perform pg_temp.ng('S03g 理由は200文字まで', null, 'service_role', format('select public.admin_mark_sold(%L, %L, %L)', adm, lr, repeat('あ', 201)), 'bad_request');

  -- 見え方 ---------------------------------------------------------------------
  perform pg_temp.eq('S04 匿名からはふつうの売り切れと同じに見える', null, 'anon', format('select status from public.listings where id = %L', lp), 'sold');
  perform pg_temp.ng('S04b 印の表は匿名から読めない', null, 'anon', 'select count(*) from public.listing_manual_sold', 'permission denied');
  perform pg_temp.ng('S04c 印の表は画面（売手）から読めない', s1, 'authenticated', 'select count(*) from public.listing_manual_sold', 'permission denied');
  perform pg_temp.ng('S04d 印の表は画面（管理者）からも読めない', adm, 'authenticated', 'select count(*) from public.listing_manual_sold', 'permission denied');
  perform pg_temp.eq('S04e service_role は読める（管理画面用）', null, 'service_role', format('select count(*)::text from public.listing_manual_sold where listing_id = %L', lp), '1');

  -- 付けられない状態 -----------------------------------------------------------
  perform pg_temp.ng('S05 下書きは断る', null, 'service_role', format('select public.admin_mark_sold(%L, %L, %L)', adm, ld, ''), 'bad_state');
  perform pg_temp.ng('S05b 非表示は断る', null, 'service_role', format('select public.admin_mark_sold(%L, %L, %L)', adm, lh, ''), 'bad_state');
  perform pg_temp.ng('S05c 削除済みは断る', null, 'service_role', format('select public.admin_mark_sold(%L, %L, %L)', adm, lx, ''), 'bad_state');
  perform pg_temp.ng('S05d 売り切れは断る（2回目）', null, 'service_role', format('select public.admin_mark_sold(%L, %L, %L)', adm, lp, ''), 'bad_state');
  perform pg_temp.ng('S05e 無い出品は断る', null, 'service_role', format('select public.admin_mark_sold(%L, %L, %L)', adm, gen_random_uuid(), ''), 'bad_state');

  o1 := pg_temp.buy(b1, lr, false);
  perform pg_temp.ng('S06 在庫1点で入金待ちの注文がある出品は断る', null, 'service_role', format('select public.admin_mark_sold(%L, %L, %L)', adm, lr, ''), 'pantia:reserved');
  perform pg_temp.eq('S06b 断ったあと出品は公開のまま・印は無い', null, 'postgres',
    format('select l.status || %L || (select count(*) from public.listing_manual_sold m where m.listing_id = l.id) from public.listings l where l.id = %L', '/', lr), 'published/0');

  -- 戻す -----------------------------------------------------------------------
  perform pg_temp.eq('S07 戻すと元の状態（公開）に戻り、戻した先を返す', null, 'service_role', format('select public.admin_unmark_sold(%L, %L)', adm, lp), 'published');
  perform pg_temp.eq('S07b 公開に戻り、印の行が消える', null, 'postgres',
    format('select l.status || %L || (select count(*) from public.listing_manual_sold m where m.listing_id = l.id) || %L || l.sales_count from public.listings l where l.id = %L', '/', '/', lp), 'published/0/0');
  perform pg_temp.eq('S07c 非公開から付けた物は非公開に戻る', null, 'service_role', format('select public.admin_unmark_sold(%L, %L)', adm, lq), 'private');
  perform pg_temp.ng('S07d 印の無い出品は戻せない', null, 'service_role', format('select public.admin_unmark_sold(%L, %L)', adm, lp), 'bad_state');

  perform pg_temp.ok('S08a 停止される売手の出品を売り切れにする', null, 'service_role', format('select public.admin_mark_sold(%L, %L, %L)', adm, ls2, ''));
  update public.profiles set status = 'suspended' where id = s2;
  perform pg_temp.eq('S08 元が公開でも、売手が停止中なら非公開に戻す', null, 'service_role', format('select public.admin_unmark_sold(%L, %L)', adm, ls2), 'private');
  perform pg_temp.eq('S08b 出品は非公開', null, 'postgres', format('select status from public.listings where id = %L', ls2), 'private');

  perform pg_temp.buy(b2, lsold);
  perform pg_temp.eq('S09a 本当に売れた物は sold で売上1', null, 'postgres', format('select status || %L || sales_count from public.listings where id = %L', '/', lsold), 'sold/1');
  perform pg_temp.ng('S09 本当に売れた物（印なしの sold）は戻せない', null, 'service_role', format('select public.admin_unmark_sold(%L, %L)', adm, lsold), 'bad_state');
  perform pg_temp.eq('S09b 断ったあとも sold のまま', null, 'postgres', format('select status from public.listings where id = %L', lsold), 'sold');

  -- 印の後始末 -----------------------------------------------------------------
  perform pg_temp.ok('S10a 印を付ける', null, 'service_role', format('select public.admin_mark_sold(%L, %L, %L)', adm, lhide, ''));
  perform pg_temp.ok('S10b 管理者が非表示にする', null, 'service_role', format('select public.admin_set_listing_status(%L, %L, %L, %L)', adm, lhide, 'hidden', '規約違反'));
  perform pg_temp.eq('S10 印のある物を非表示にすると、印の行が消える', null, 'postgres', format('select count(*)::text from public.listing_manual_sold where listing_id = %L', lhide), '0');
  perform pg_temp.ng('S10c 非表示にした物は戻せない', null, 'service_role', format('select public.admin_unmark_sold(%L, %L)', adm, lhide), 'bad_state');

  -- 監査 -----------------------------------------------------------------------
  perform pg_temp.eq('S11 付けた記録が管理者の名義で残る', null, 'postgres', format('select count(*)::text from public.audit_logs where action = %L and actor_id = %L', 'listing.manual_sold', adm), '4');
  perform pg_temp.eq('S11b 戻した記録が管理者の名義で残る', null, 'postgres', format('select count(*)::text from public.audit_logs where action = %L and actor_id = %L', 'listing.manual_unsold', adm), '3');

  -- 表を直接は書けない ---------------------------------------------------------
  perform pg_temp.ng('S12 service_role から印の表へ直接 insert できない', null, 'service_role',
    format('insert into public.listing_manual_sold (listing_id, prev_status, marked_by) values (%L, %L, %L)', lp, 'published', adm), 'permission denied');
  perform pg_temp.ng('S12b service_role から印の表を直接は消せない', null, 'service_role', 'delete from public.listing_manual_sold', 'permission denied');
  perform pg_temp.ng('S12c 画面から印の表へ insert できない', adm, 'authenticated',
    format('insert into public.listing_manual_sold (listing_id, prev_status, marked_by) values (%L, %L, %L)', lp, 'published', adm), 'permission denied');
end $t$;
