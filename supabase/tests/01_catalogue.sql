-- 01 プロフィール・出品・フォロー・お気に入り・ブロック・検索・見積もり
do $t$
declare
  s1 uuid; s2 uuid; s0 uuid; b1 uuid; b2 uuid;
  l1 uuid; l2 uuid; ld uuid; lf uuid; lh uuid; lp uuid;
  v text;
begin
  s1 := pg_temp.mkuser('みさき', 'seller');
  s2 := pg_temp.mkuser('ゆい', 'seller');
  s0 := pg_temp.mkuser('未確認', 'seller', 'unsubmitted');
  b1 := pg_temp.mkuser('たろう', 'buyer');
  b2 := pg_temp.mkuser('じろう', 'buyer', 'unsubmitted');

  -- 登録 ------------------------------------------------------------------
  perform pg_temp.eq('P01 登録で profiles ができる（出品者）', null, 'postgres', format('select role from public.profiles where id = %L', s1), 'seller');
  perform pg_temp.eq('P02 登録は監査ログに残る', null, 'postgres',
    format('select count(*)::text from public.audit_logs where action = %L and actor_id = %L', 'user.register', s1), '1');
  perform pg_temp.eq('P03 出品者の公開名は呼び名', null, 'anon', format('select public_name from public.profiles where id = %L', s1), 'みさき');
  perform pg_temp.eq('P04 購入者の公開名は伏せる', null, 'anon', format('select public_name from public.profiles where id = %L', b1), 'た***さん');
  perform pg_temp.ng('P05 呼び名（nickname）の列は他人から読めない', null, 'anon', format('select nickname from public.profiles where id = %L', b1), 'permission denied');
  perform pg_temp.ng('P06 通知の設定は他人から読めない', b1, 'authenticated', format('select notify_order from public.profiles where id = %L', s1), 'permission denied');
  perform pg_temp.eq('P07 本人は my_profile で全部読める', b1, 'authenticated', 'select nickname from public.my_profile()', 'たろう');

  -- プロフィールの更新 ----------------------------------------------------
  perform pg_temp.ok('P08 本人は自己紹介を直せる', s1, 'authenticated', format('update public.profiles set bio = %L where id = %L', 'よろしく', s1));
  perform pg_temp.eq('P09 他人のプロフィールは直せない（0行）', b1, 'authenticated',
    format('with u as (update public.profiles set bio = %L where id = %L returning 1) select count(*)::text from u', 'x', s1), '0');
  perform pg_temp.ng('P10 本人確認の状態は本人が変えられない', s0, 'authenticated', format('update public.profiles set kyc_status = %L where id = %L', 'approved', s0), 'permission denied');
  perform pg_temp.ng('P11 役割は本人が変えられない', b1, 'authenticated', format('update public.profiles set role = %L where id = %L', 'seller', b1), 'permission denied');
  perform pg_temp.ng('P12 販売数は本人が変えられない', s1, 'authenticated', format('update public.profiles set sales_count = 99 where id = %L', s1), 'permission denied');
  perform pg_temp.ng('P13 年齢は18歳未満にできない', s1, 'authenticated', format('update public.profiles set age = 17 where id = %L', s1), 'check');
  perform pg_temp.ng('P14 アイコンの場所は自分のフォルダだけ', s1, 'authenticated',
    format('update public.profiles set avatar_path = %L where id = %L', s2::text || '/' || gen_random_uuid()::text || '.webp', s1), 'check');
  perform pg_temp.ng('P15 アイコンの場所に ../ は入れられない', s1, 'authenticated',
    format('update public.profiles set avatar_path = %L where id = %L', s1::text || '/../x.webp', s1), 'check');

  -- 出品 ------------------------------------------------------------------
  l1 := pg_temp.listing(s1);
  perform pg_temp.eq('L01 本人確認済みの出品者は公開できる', null, 'postgres', format('select status from public.listings where id = %L', l1), 'published');
  perform pg_temp.eq('L02 公開は監査ログに残る', null, 'postgres',
    format('select count(*)::text from public.audit_logs where action = %L and target_id = %L', 'listing.publish', l1), '1');
  ld := pg_temp.listing(s0, 'draft');
  perform pg_temp.eq('L03 本人確認前でも下書きは作れる', null, 'postgres', format('select status from public.listings where id = %L', ld), 'draft');
  perform pg_temp.ng('L04 本人確認前は公開できない', s0, 'authenticated', format('update public.listings set status = %L where id = %L', 'published', ld), 'kyc required');
  perform pg_temp.ng('L05 購入者は出品できない', b1, 'authenticated',
    format('insert into public.listings (title, status) values (%L, %L)', 'x', 'draft'), 'row-level security');
  perform pg_temp.ng('L06 写真の場所は自分のフォルダだけ', s1, 'authenticated',
    format('insert into public.listings (title, status, image_paths) values (%L, %L, array[%L])', 'x', 'draft', s2::text || '/' || gen_random_uuid()::text || '.webp'), 'check');
  perform pg_temp.ng('L07 必須がそろわないと公開できない', s1, 'authenticated',
    format('insert into public.listings (title, status) values (%L, %L)', 'x', 'published'), 'listings_complete');
  perform pg_temp.ng('L08 値段は100円単位', s1, 'authenticated', format('update public.listings set price = 3050 where id = %L', l1), 'check');
  perform pg_temp.ng('L09 値段は500円以上', s1, 'authenticated', format('update public.listings set price = 400 where id = %L', l1), 'check');
  perform pg_temp.ng('L10 着用日数は7日以上にできない', s1, 'authenticated', format('update public.listings set worn_days = 7 where id = %L', l1), 'check');
  perform pg_temp.eq('L11 他人の出品は直せない（0行）', s2, 'authenticated',
    format('with u as (update public.listings set price = 500 where id = %L returning 1) select count(*)::text from u', l1), '0');
  perform pg_temp.ng('L12 出品者は「運営の非公開」にできない', s1, 'authenticated', format('update public.listings set status = %L where id = %L', 'hidden', l1), 'not allowed');
  perform pg_temp.ng('L13 出品者は「売り切れ」にできない', s1, 'authenticated', format('update public.listings set status = %L where id = %L', 'sold', l1), 'not allowed');
  perform pg_temp.ng('L14 閲覧数は出品者が変えられない', s1, 'authenticated', format('update public.listings set view_count = 999 where id = %L', l1), 'permission denied');
  perform pg_temp.ng('L15 公開したものは下書きに戻せない', s1, 'authenticated', format('update public.listings set status = %L where id = %L', 'draft', l1), 'draft');
  perform pg_temp.eq('L16 公開中は誰でも見える', null, 'anon', format('select count(*)::text from public.listings where id = %L', l1), '1');
  perform pg_temp.eq('L17 下書きは他人から見えない', b1, 'authenticated', format('select count(*)::text from public.listings where id = %L', ld), '0');
  perform pg_temp.eq('L18 下書きは本人には見える', s0, 'authenticated', format('select count(*)::text from public.listings where id = %L', ld), '1');
  lh := pg_temp.listing(s1);
  update public.listings set status = 'hidden' where id = lh;
  perform pg_temp.eq('L19 運営が非公開にした出品は出品者が直せない（0行）', s1, 'authenticated',
    format('with u as (update public.listings set status = %L where id = %L returning 1) select count(*)::text from u', 'published', lh), '0');
  perform pg_temp.eq('L20 運営の非公開は他人から見えない', null, 'anon', format('select count(*)::text from public.listings where id = %L', lh), '0');
  perform pg_temp.ok('L21 閲覧数を数える', null, 'service_role', format('select public.bump_listing_view(%L, %L)', l1, b1));
  perform pg_temp.ok('L22 本人の閲覧は数えない', null, 'service_role', format('select public.bump_listing_view(%L, %L)', l1, s1));
  perform pg_temp.ng('L22b 閲覧数は画面から直に足せない（ログインなし）', null, 'anon', format('select public.bump_listing_view(%L)', l1), 'permission denied');
  perform pg_temp.ng('L22c 閲覧数は画面から直に足せない（ログイン中）', b1, 'authenticated', format('select public.bump_listing_view(%L, %L)', l1, b1), 'permission denied');
  perform pg_temp.eq('L23 閲覧数は1', null, 'postgres', format('select view_count::text from public.listings where id = %L', l1), '1');

  -- 停止中の出品者 -----------------------------------------------------------
  l2 := pg_temp.listing(s2);
  update public.profiles set status = 'suspended' where id = s2;
  perform pg_temp.eq('L24 停止中の出品者の出品は見えない', null, 'anon', format('select count(*)::text from public.listings where id = %L', l2), '0');
  perform pg_temp.eq('L25 停止中の人は自分のプロフィールを直せない（0行）', s2, 'authenticated',
    format('with u as (update public.profiles set bio = %L where id = %L returning 1) select count(*)::text from u', 'x', s2), '0');
  update public.profiles set status = 'active' where id = s2;

  -- フォロー・フォロワー限定 -------------------------------------------------
  lf := pg_temp.listing(s1, 'published', 'followers_only = true');
  perform pg_temp.eq('F01 フォロワー限定はフォロー前は見えない', b1, 'authenticated', format('select count(*)::text from public.listings where id = %L', lf), '0');
  perform pg_temp.ok('F02 フォローできる', b1, 'authenticated', format('insert into public.follows (seller_id) values (%L)', s1));
  perform pg_temp.eq('F03 フォロー後は見える', b1, 'authenticated', format('select count(*)::text from public.listings where id = %L', lf), '1');
  perform pg_temp.eq('F04 フォロワー数が増える', null, 'anon', format('select follower_count::text from public.profiles where id = %L', s1), '1');
  perform pg_temp.ng('F05 他人になりすましてフォローできない', b1, 'authenticated',
    format('insert into public.follows (follower_id, seller_id) values (%L, %L)', b2, s1), 'permission denied');
  perform pg_temp.ng('F06 本人確認前の出品者はフォローできない', b1, 'authenticated', format('insert into public.follows (seller_id) values (%L)', s0), 'row-level security');

  -- お気に入り --------------------------------------------------------------
  perform pg_temp.ok('V01 お気に入りに入れられる', b1, 'authenticated', format('insert into public.favorites (listing_id) values (%L)', l1));
  perform pg_temp.eq('V02 いいね数が増える', null, 'anon', format('select like_count::text from public.listings where id = %L', l1), '1');
  perform pg_temp.ng('V03 見えない出品（下書き）には付けられない', b1, 'authenticated', format('insert into public.favorites (listing_id) values (%L)', ld), 'row-level security');
  perform pg_temp.ng('V04 自分の出品には付けられない', s1, 'authenticated', format('insert into public.favorites (listing_id) values (%L)', l1), 'row-level security');
  perform pg_temp.eq('V05 他人のお気に入りは見えない', s1, 'authenticated', 'select count(*)::text from public.favorites', '0');

  -- カート ------------------------------------------------------------------
  perform pg_temp.ok('C01 カートに入れられる', b1, 'authenticated', format('insert into public.cart_items (listing_id, options) values (%L, %L)', l1, '{"photo":true}'));
  perform pg_temp.ng('C02 下書きはカートに入れられない', b1, 'authenticated', format('insert into public.cart_items (listing_id) values (%L)', ld), 'row-level security');
  perform pg_temp.eq('C03 他人のカートは見えない', b2, 'authenticated', 'select count(*)::text from public.cart_items', '0');

  -- ブロック ----------------------------------------------------------------
  perform pg_temp.ok('B01 ブロックできる', s1, 'authenticated', format('insert into public.blocks (blocked_id) values (%L)', b1));
  perform pg_temp.eq('B02 ブロックするとフォローが外れる', null, 'postgres', format('select count(*)::text from public.follows where follower_id = %L and seller_id = %L', b1, s1), '0');
  perform pg_temp.eq('B03 ブロックされた人からは出品が見えない', b1, 'authenticated', format('select count(*)::text from public.listings where id = %L', l1), '0');
  perform pg_temp.ng('B04 ブロックされた人はフォローできない', b1, 'authenticated', format('insert into public.follows (seller_id) values (%L)', s1), 'row-level security');
  perform pg_temp.eq('B05 ブロックの一覧は本人だけ', b1, 'authenticated', 'select count(*)::text from public.blocks', '0');
  perform pg_temp.ok('B06 ブロックを外せる', s1, 'authenticated', format('delete from public.blocks where blocked_id = %L', b1));
  perform pg_temp.eq('B07 外すと見える', b1, 'authenticated', format('select count(*)::text from public.listings where id = %L', l1), '1');

  -- 検索 --------------------------------------------------------------------
  lp := pg_temp.listing(s1, 'published', $s$title = '綿100%ショーツ', category = 'bra', price = 8000$s$);
  perform pg_temp.eq('S01 検索で % は文字として扱う', null, 'anon', 'select public.search_listings(''{"q":"%"}'') ->> ''total''', '1');
  perform pg_temp.eq('S02 検索で _ は文字として扱う', null, 'anon', 'select public.search_listings(''{"q":"_"}'') ->> ''total''', '0');
  perform pg_temp.eq('S03 カテゴリで絞れる', null, 'anon', 'select public.search_listings(''{"categories":["bra"]}'') ->> ''total''', '1');
  perform pg_temp.eq('S04 値段で絞れる', null, 'anon', 'select public.search_listings(''{"price_min":5000}'') ->> ''total''', '1');
  perform pg_temp.eq('S05 知らないカテゴリは無視', null, 'anon', 'select public.search_listings(''{"categories":["x''''; drop table x"]}'') ->> ''total''', '3');
  perform pg_temp.eq('S06 匿名の検索にフォロワー限定は出ない', null, 'anon', 'select public.search_listings(''{}'') ->> ''total''', '3');
  perform pg_temp.eq('S07 値段の安い順', null, 'anon', 'select public.search_listings(''{"sort":"price_desc","limit":1}'') -> ''items'' -> 0 ->> ''price''', '8000');
  perform pg_temp.eq('S08 件数の上限は60', null, 'anon', 'select jsonb_array_length(public.search_listings(''{"limit":1000}'') -> ''items'')::text', '3');
  -- 出品者の公開名でも探せる（題名・説明に名前が無くても、その人の公開中の出品が出る）
  perform pg_temp.listing(s2, 'published', $s$title = 'S09の商品'$s$);
  select count(*)::text into v from public.listings where seller_id = s2 and status = 'published' and not followers_only;
  perform pg_temp.eq('S09 出品者の公開名でも探せる', null, 'anon', 'select public.search_listings(''{"q":"ゆい"}'') ->> ''total''', v);

  -- 見積もり -----------------------------------------------------------------
  update public.listings set opt_extend = true, max_worn_days = 4, opt_video = false, anonymous_ok = true where id = l1;
  perform pg_temp.eq('Q01 基本の値段', null, 'anon', format('select public.quote_listing(%L, %L) ->> %L', l1, '{}', 'total'), '3000');
  perform pg_temp.eq('Q02 着用日数の延長は1日500円', null, 'anon', format('select public.quote_listing(%L, %L) ->> %L', l1, '{"worn_days":4}', 'total'), '4000');
  perform pg_temp.eq('Q03 短くするのは追加なし', null, 'anon', format('select public.quote_listing(%L, %L) ->> %L', l1, '{"worn_days":1}', 'total'), '3000');
  perform pg_temp.ng('Q04 上限を超える日数はだめ', null, 'anon', format('select public.quote_listing(%L, %L)', l1, '{"worn_days":5}'), 'bad_options');
  perform pg_temp.ng('Q05 動画が無い出品で動画はだめ', null, 'anon', format('select public.quote_listing(%L, %L)', l1, '{"video":true}'), 'bad_options');
  perform pg_temp.eq('Q06 匿名配送は300円（小計に入らない）', null, 'anon',
    format('select (public.quote_listing(%L, %L) ->> %L) || %L || (public.quote_listing(%L, %L) ->> %L)', l1, '{"anonymous":true}', 'subtotal', '/', l1, '{"anonymous":true}', 'total'), '3000/3300');
  perform pg_temp.ng('Q07 下書きは見積もれない', null, 'anon', format('select public.quote_listing(%L, %L)', ld, '{}'), 'unavailable');
  perform pg_temp.ng('Q08 フォロワー限定はフォローしていないと見積もれない', b2, 'authenticated', format('select public.quote_listing(%L, %L)', lf, '{}'), 'unavailable');
  update public.listings set opt_extend = false where id = l1;
  perform pg_temp.ng('Q09 延長なしの出品は日数を変えられない', null, 'anon', format('select public.quote_listing(%L, %L)', l1, '{"worn_days":1}'), 'bad_options');

  -- 内部の関数は画面から呼べない ------------------------------------------------
  perform pg_temp.ng('X01 監査ログの関数は画面から呼べない', b1, 'authenticated', 'select public.audit(null, ''x'', null, null)', 'permission denied');
  perform pg_temp.ng('X02 通知の関数は画面から呼べない', b1, 'authenticated', format('select public.notify(%L, %L, %L, %L, %L)', b1, 'system', 'x', 'x', '/'), 'permission denied');
  perform pg_temp.ng('X03 監査ログは画面から読めない', s1, 'authenticated', 'select count(*) from public.audit_logs', 'permission denied');
  perform pg_temp.ng('X04 サイト設定は画面から変えられない', s1, 'authenticated', 'update public.site_settings set fee_rate = 0', 'permission denied');
  perform pg_temp.ng('X05 転送先の住所は画面から読めない', b1, 'authenticated', 'select forwarding_address from public.site_settings', 'permission denied');
  perform pg_temp.ng('X06 回数計は画面から読めない', null, 'anon', 'select count(*) from public.rate_limit_hits', 'permission denied');
  perform pg_temp.ng('X07 前の表（items）は画面から読めない', null, 'anon', 'select count(*) from public.items', 'permission denied');
end $t$;
