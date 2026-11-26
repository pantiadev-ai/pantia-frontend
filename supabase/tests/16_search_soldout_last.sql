-- 16 売り切れの商品も一覧に残し、どの並び順でも買える商品の後ろにまとめる（改修リスト 行6）
-- 決まり: search_listings は公開（published）と売り切れ（sold）を返す。非公開・下書きは返さない。
--         並びは「買える物 → 売り切れ」が先の鍵で、その中で選んだ並び順（新着・人気・値段・評価）。
--         items に status を返す（画面の SOLD の札に使う）。
--         total と件数（facets.categories・options）は売り切れを含め、一覧に出る物と数を合わせる。
--         facets.available は買える物だけの数（トップの「公開中の商品」・出品者ページの「出品中」に使う）。
create function pg_temp.s(p_args jsonb) returns text language sql as $f$
  select format('select public.search_listings(%L::jsonb)', p_args);
$f$;
-- 返ってきた順の名前（A,B,…）
create function pg_temp.order_of(p_args jsonb, p_key text default 'title') returns text language sql as $f$
  select format('select string_agg(x->>%L, %L order by n) from jsonb_array_elements((%s)->%L) with ordinality as t(x, n)',
    p_key, ',', pg_temp.s(p_args), 'items');
$f$;

do $t$
declare
  s1 uuid; buyer uuid;
begin
  s1 := pg_temp.mkuser('うりきれ', 'seller');
  buyer := pg_temp.mkuser('かう', 'buyer');
  -- 売り切れの C は一番新しく・一番人気・一番高い。売り切れの D は一番安い。それでも後ろに来るか
  -- 当日発送（same_day）は既定が true なので、A と D だけ true・B と C は false にそろえる
  perform pg_temp.listing(s1, 'published', $s$title = 'A', price = 1000, published_at = now() - interval '3 hours', same_day = true$s$);
  perform pg_temp.listing(s1, 'published', $s$title = 'B', price = 5000, published_at = now() - interval '2 hours', like_count = 1, same_day = false$s$);
  perform pg_temp.listing(s1, 'published', $s$title = 'C', price = 9000, published_at = now(), like_count = 50, same_day = false, status = 'sold'$s$);
  perform pg_temp.listing(s1, 'published', $s$title = 'D', price = 500, published_at = now() - interval '1 hour', same_day = true, status = 'sold'$s$);
  perform pg_temp.listing(s1, 'published', $s$title = 'P', status = 'private'$s$);
  perform pg_temp.listing(s1, 'draft', $s$title = 'Q'$s$);

  -- 並び ------------------------------------------------------------------------
  perform pg_temp.eq('W01 新着: 買える物が先、売り切れは後ろ（売り切れの方が新しくても）', null, 'anon',
    pg_temp.order_of(jsonb_build_object('seller', s1, 'sort', 'new')), 'B,A,C,D');
  perform pg_temp.eq('W02 人気: 売り切れはいいねが多くても後ろ', null, 'anon',
    pg_temp.order_of(jsonb_build_object('seller', s1, 'sort', 'pop')), 'B,A,C,D');
  perform pg_temp.eq('W03 値段の安い順: 売り切れは安くても後ろ', null, 'anon',
    pg_temp.order_of(jsonb_build_object('seller', s1, 'sort', 'price_asc')), 'A,B,D,C');
  perform pg_temp.eq('W04 値段の高い順: 売り切れは高くても後ろ', null, 'anon',
    pg_temp.order_of(jsonb_build_object('seller', s1, 'sort', 'price_desc')), 'B,A,C,D');
  perform pg_temp.eq('W05 評価の高い順でも後ろ', null, 'anon',
    pg_temp.order_of(jsonb_build_object('seller', s1, 'sort', 'review')), 'B,A,C,D');
  perform pg_temp.eq('W06 ログイン中の利用者が呼んでも同じ', buyer, 'authenticated',
    pg_temp.order_of(jsonb_build_object('seller', s1, 'sort', 'new')), 'B,A,C,D');
  perform pg_temp.eq('W07 2ページ目に売り切れが続く（ページをまたいでも順が崩れない）', null, 'anon',
    pg_temp.order_of(jsonb_build_object('seller', s1, 'sort', 'new', 'limit', 2, 'offset', 2)), 'C,D');
  perform pg_temp.eq('W08 当日発送で絞っても、売り切れは後ろ', null, 'anon',
    pg_temp.order_of(jsonb_build_object('seller', s1, 'same_day', true)), 'A,D');

  -- 返す中身 ----------------------------------------------------------------------
  perform pg_temp.eq('W09 status を返す（買える物は published、売り切れは sold）', null, 'anon',
    pg_temp.order_of(jsonb_build_object('seller', s1), 'status'), 'published,published,sold,sold');

  -- 件数 --------------------------------------------------------------------------
  perform pg_temp.eq('W10 total は売り切れを含む4（非公開・下書きは数えない）', null, 'anon',
    format('select (%s)->>%L', pg_temp.s(jsonb_build_object('seller', s1)), 'total'), '4');
  perform pg_temp.eq('W11 件数（種類・当日発送）も売り切れを含む', null, 'anon',
    format('select ((%1$s)->%2$L->%3$L->>%4$L) || %5$L || ((%1$s)->%2$L->%6$L->>%7$L)',
      pg_temp.s(jsonb_build_object('seller', s1)), 'facets', 'categories', 'all', '/', 'options', 'same_day'), '4/2');
  perform pg_temp.eq('W12 買える物だけの数 facets.available（all・same_day）', null, 'anon',
    format('select ((%1$s)->%2$L->%3$L->>%4$L) || %5$L || ((%1$s)->%2$L->%3$L->>%6$L)',
      pg_temp.s(jsonb_build_object('seller', s1)), 'facets', 'available', 'all', '/', 'same_day'), '2/1');
end $t$;
