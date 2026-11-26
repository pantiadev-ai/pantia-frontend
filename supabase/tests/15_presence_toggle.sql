-- 15 ログイン中の表示（緑の点・オンラインの絞り込み）を、運営の設定で出す／隠す（改修リスト 行9）
-- 決まり: site_settings.show_presence は既定で false（隠す）。誰でも読める（公開の画面が出し分けに使う）。
--         false のあいだ、search_listings は「オンラインの人だけ」の絞り込みを効かせず、seller_online を false で返し、件数の online を 0 にする。
--         変えられるのは admin_update_settings（service_role・管理者の id）だけ。記録は settings.update に show_presence が残る。
create function pg_temp.search(p_seller uuid, p_online boolean) returns text language sql as $f$
  select format('select public.search_listings(jsonb_build_object(%L, %L, %L, %s))', 'seller', p_seller, 'online', p_online::text);
$f$;
create function pg_temp.setp(p_admin uuid, p_patch text) returns text language sql as $f$
  select format('select public.admin_update_settings(%L, %L::jsonb)', p_admin, p_patch);
$f$;

do $t$
declare
  adm uuid; on1 uuid; off1 uuid; buyer uuid;
  fee text;
begin
  adm := pg_temp.mkuser('運営', 'buyer');
  insert into public.admin_users (user_id) values (adm);
  on1 := pg_temp.mkuser('いまいる', 'seller');
  off1 := pg_temp.mkuser('るす', 'seller');
  buyer := pg_temp.mkuser('かう', 'buyer');
  perform pg_temp.listing(on1, 'published');
  perform pg_temp.listing(off1, 'published');
  update public.profiles set last_seen_at = now() where id = on1;
  update public.profiles set last_seen_at = now() - interval '1 hour' where id = off1;
  -- この試験の中だけ「隠す」にそろえる（最後に全部取り消される）
  update public.site_settings set show_presence = false where id;
  fee := (select fee_rate::text from public.site_settings where id);

  -- 列 ---------------------------------------------------------------------------
  perform pg_temp.eq('V01 既定は false（隠す）・空にできない', null, 'postgres',
    $q$select column_default || '/' || is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'site_settings' and column_name = 'show_presence'$q$, 'false/NO');
  perform pg_temp.eq('V02 匿名でも読める（公開の画面の出し分けに使う）', null, 'anon',
    'select show_presence::text from public.site_settings', 'false');
  perform pg_temp.eq('V02b ログイン中の利用者も読める', buyer, 'authenticated',
    'select show_presence::text from public.site_settings', 'false');
  perform pg_temp.ng('V02c 画面からは書き換えられない', adm, 'authenticated',
    'update public.site_settings set show_presence = true where id', 'permission denied');

  -- 隠すあいだ ---------------------------------------------------------------------
  perform pg_temp.eq('V03 隠すあいだは「オンラインの人だけ」が効かない（留守の人の出品も出る）', null, 'anon',
    format('select (%s)->>%L', pg_temp.search(off1, true), 'total'), '1');
  perform pg_temp.eq('V03b いまいる人の出品でも seller_online は false', null, 'anon',
    format('select (%s)->%L->0->>%L', pg_temp.search(on1, false), 'items', 'seller_online'), 'false');
  perform pg_temp.eq('V03c 件数の online は 0', null, 'anon',
    format('select (%s)->%L->%L->>%L', pg_temp.search(on1, false), 'facets', 'options', 'online'), '0');
  perform pg_temp.eq('V03d ログイン中の利用者が呼んでも同じ（seller_online は false）', buyer, 'authenticated',
    format('select (%s)->%L->0->>%L', pg_temp.search(on1, true), 'items', 'seller_online'), 'false');

  -- 変えられる人 -------------------------------------------------------------------
  perform pg_temp.ng('V04 匿名からは呼べない', null, 'anon', pg_temp.setp(adm, '{"show_presence":true}'), 'permission denied');
  perform pg_temp.ng('V04b 画面（ログイン中の管理者）からは呼べない', adm, 'authenticated', pg_temp.setp(adm, '{"show_presence":true}'), 'permission denied');
  perform pg_temp.ng('V04c 管理者でない id は断る', null, 'service_role', pg_temp.setp(buyer, '{"show_presence":true}'), 'not_admin');
  perform pg_temp.eq('V04d 断ったあとも false のまま', null, 'postgres', 'select show_presence::text from public.site_settings', 'false');

  -- 出す ---------------------------------------------------------------------------
  perform pg_temp.ok('V05 運営が「出す」にできる', null, 'service_role', pg_temp.setp(adm, '{"show_presence":true}'));
  perform pg_temp.eq('V05b true になり、ほかの設定（手数料）はそのまま', null, 'postgres',
    'select show_presence::text || ''/'' || fee_rate::text from public.site_settings', 'true/' || fee);
  perform pg_temp.eq('V05c 出すあいだは「オンラインの人だけ」が効く（留守の人は出ない）', null, 'anon',
    format('select (%s)->>%L', pg_temp.search(off1, true), 'total'), '0');
  perform pg_temp.eq('V05d いまいる人は出る', null, 'anon',
    format('select (%s)->>%L', pg_temp.search(on1, true), 'total'), '1');
  perform pg_temp.eq('V05e いまいる人の seller_online は true・件数の online は 1', null, 'anon',
    format('select ((%1$s)->%2$L->0->>%3$L) || %4$L || ((%1$s)->%5$L->%6$L->>%7$L)', pg_temp.search(on1, false), 'items', 'seller_online', '/', 'facets', 'options', 'online'), 'true/1');
  perform pg_temp.eq('V05f 留守の人の seller_online は false', null, 'anon',
    format('select (%s)->%L->0->>%L', pg_temp.search(off1, false), 'items', 'seller_online'), 'false');

  -- 戻す・記録 ---------------------------------------------------------------------
  perform pg_temp.ok('V06 運営が「隠す」に戻せる', null, 'service_role', pg_temp.setp(adm, '{"show_presence":false}'));
  perform pg_temp.eq('V06b false に戻る', null, 'postgres', 'select show_presence::text from public.site_settings', 'false');
  perform pg_temp.eq('V06c 戻したあとは、また seller_online が false', null, 'anon',
    format('select (%s)->%L->0->>%L', pg_temp.search(on1, false), 'items', 'seller_online'), 'false');
  perform pg_temp.eq('V07 記録 settings.update に show_presence が残る（出す・戻すの2回）', null, 'postgres',
    format('select string_agg(detail->>%L, %L order by created_at, id) from public.audit_logs where action = %L and actor_id = %L',
      'show_presence', ',', 'settings.update', adm), 'true,false');
end $t$;
