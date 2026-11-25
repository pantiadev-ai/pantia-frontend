-- 13 運営が出品日（published_at）を変える
-- 決まり: 下書き・削除済みは断る（bad_state）。null・今より先（5分の猶予）・2000-01-01 JST より前は断る（bad_request）。
--         出品日だけを変え、フォロワーへの知らせは出し直さない。記録は listing.published_at（from・to）。
create function pg_temp.setat(p_admin uuid, p_listing uuid, p_at timestamptz) returns text language sql as $f$
  select format('select public.admin_set_listing_published_at(%L, %L, %L::timestamptz)', p_admin, p_listing, p_at);
$f$;

do $t$
declare
  adm uuid; s1 uuid; fan uuid;
  lp uuid; ls uuid; lv uuid; lh uuid; ld uuid; lx uuid;
  t3 timestamptz := date_trunc('minute', now()) - interval '3 days';
  t0 timestamptz;
  nf text;
begin
  adm := pg_temp.mkuser('運営', 'buyer');
  insert into public.admin_users (user_id) values (adm);
  s1 := pg_temp.mkuser('みさき', 'seller');
  fan := pg_temp.mkuser('ファン', 'buyer');
  insert into public.follows (follower_id, seller_id) values (fan, s1);

  lp := pg_temp.listing(s1, 'published');
  ls := pg_temp.listing(s1, 'published', 'status = ''sold''');
  lv := pg_temp.listing(s1, 'published', 'status = ''private''');
  lh := pg_temp.listing(s1, 'published', 'status = ''hidden''');
  ld := pg_temp.listing(s1, 'draft');
  lx := pg_temp.listing(s1, 'published', 'status = ''deleted''');
  select published_at into t0 from public.listings where id = lp;
  nf := (select count(*)::text from public.notifications where user_id = fan);

  -- 呼べる人 -------------------------------------------------------------------
  perform pg_temp.ng('P01 匿名からは呼べない', null, 'anon', pg_temp.setat(adm, lp, t3), 'permission denied');
  perform pg_temp.ng('P01b 画面（ログイン中の管理者）からは呼べない', adm, 'authenticated', pg_temp.setat(adm, lp, t3), 'permission denied');
  perform pg_temp.ng('P01c 出品者本人の画面からも呼べない', s1, 'authenticated', pg_temp.setat(s1, lp, t3), 'permission denied');
  perform pg_temp.ng('P02 管理者でない id は断る', null, 'service_role', pg_temp.setat(s1, lp, t3), 'not_admin');

  -- 変えられる -----------------------------------------------------------------
  perform pg_temp.ok('P03 公開中の出品を3日前にできる', null, 'service_role', pg_temp.setat(adm, lp, t3));
  perform pg_temp.eq('P03b 出品日が指定の時刻になり、状態はそのまま', null, 'postgres',
    format('select (published_at = %L::timestamptz)::text || %L || status from public.listings where id = %L', t3, '/', lp), 'true/published');
  perform pg_temp.ok('P03c 2000-01-01 0:00 JST ちょうどにはできる', null, 'service_role', pg_temp.setat(adm, lv, '2000-01-01 00:00+09'));
  perform pg_temp.ok('P03d 今から1分後（5分の猶予の内）にはできる', null, 'service_role', pg_temp.setat(adm, lh, now() + interval '1 minute'));
  perform pg_temp.ok('P04 売り切れの出品も変えられる', null, 'service_role', pg_temp.setat(adm, ls, t3));
  perform pg_temp.ok('P04b 非公開の出品も変えられる', null, 'service_role', pg_temp.setat(adm, lv, t3));
  perform pg_temp.ok('P04c 運営の非表示の出品も変えられる', null, 'service_role', pg_temp.setat(adm, lh, t3));
  perform pg_temp.eq('P04d 3つとも指定の時刻・状態はそのまま', null, 'postgres',
    format('select string_agg(status || %L || (published_at = %L::timestamptz)::text, %L order by status) from public.listings where id in (%L, %L, %L)',
      ':', t3, ',', ls, lv, lh), 'hidden:true,private:true,sold:true');

  -- 変えられない出品 -------------------------------------------------------------
  perform pg_temp.ng('P05 下書きは変えられない', null, 'service_role', pg_temp.setat(adm, ld, t3), 'bad_state');
  perform pg_temp.ng('P05b 削除済みは変えられない', null, 'service_role', pg_temp.setat(adm, lx, t3), 'bad_state');
  perform pg_temp.ng('P05c 無い出品は断る', null, 'service_role', pg_temp.setat(adm, gen_random_uuid(), t3), 'bad_request');
  perform pg_temp.eq('P05d 下書きの出品日は空のまま・削除済みは元のまま', null, 'postgres',
    format('select (select (published_at is null)::text from public.listings where id = %L) || %L || (select (published_at = %L::timestamptz)::text from public.listings where id = %L)',
      ld, '/', t3, lx), 'true/false');

  -- 変えられない日時 -------------------------------------------------------------
  perform pg_temp.ng('P06 今から1時間後は断る', null, 'service_role', pg_temp.setat(adm, lp, now() + interval '1 hour'), 'bad_request');
  perform pg_temp.ng('P06b 1999-12-31 は断る', null, 'service_role', pg_temp.setat(adm, lp, '1999-12-31 12:00+09'), 'bad_request');
  perform pg_temp.ng('P06c 2000-01-01 0:00 JST の1秒前は断る', null, 'service_role', pg_temp.setat(adm, lp, '1999-12-31 23:59:59+09'), 'bad_request');
  perform pg_temp.ng('P06d 空（null）は断る', null, 'service_role',
    format('select public.admin_set_listing_published_at(%L, %L, null)', adm, lp), 'bad_request');
  perform pg_temp.eq('P06e 断ったあとも出品日は3日前のまま', null, 'postgres',
    format('select (published_at = %L::timestamptz)::text from public.listings where id = %L', t3, lp), 'true');

  -- 知らせと記録 ----------------------------------------------------------------
  perform pg_temp.eq('P07 フォロワーへの知らせは増えない', null, 'postgres',
    format('select count(*)::text from public.notifications where user_id = %L', fan), nf);
  perform pg_temp.eq('P08 記録 listing.published_at が成功の回数だけ残る（管理者の名義）', null, 'postgres',
    format('select count(*)::text from public.audit_logs where action = %L and actor_id = %L', 'listing.published_at', adm), '6');
  perform pg_temp.eq('P08b 記録に題名・元の日時・新しい日時が残る', null, 'postgres',
    format('select (detail->>%L) || %L || ((detail->>%L)::timestamptz = %L::timestamptz)::text || %L || ((detail->>%L)::timestamptz = %L::timestamptz)::text
            from public.audit_logs where action = %L and target_id = %L',
      'title', '/', 'from', t0, '/', 'to', t3, 'listing.published_at', lp::text), 'テスト商品/true/true');
end $t$;
