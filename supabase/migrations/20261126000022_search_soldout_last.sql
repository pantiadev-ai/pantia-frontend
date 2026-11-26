-- 0022 売り切れの商品も一覧に残し、どの並び順でも買える商品の後ろにまとめる（改修リスト 行6）
--
-- 先方の声: 「soldoutにした商品を一覧から消えているので残して欲しい」。
-- 今までの search_listings は公開（published）の物だけを返していたので、入金で売り切れになった物も、
-- 運営が手で売り切れにした物も、一覧・トップの新着・出品者ページから消えていた。
--
--   ・search_listings（0021 の定義に足した。ログイン中の表示の扱いはそのまま）:
--       - 公開と売り切れ（sold）を返す。見えるかは今までどおり listings_read（RLS）も通る（売り切れは前から読める）
--       - 並びの最初の鍵を「売り切れか」にし、そのあと選んだ並び順。ページをまたいでも順は崩れない
--       - items に status を返す（画面の SOLD の札。lib/catalogue.ts の soldOut）
--       - total と件数（facets.categories・options）は売り切れを含める（一覧に出る物と数を合わせる）
--       - facets.available に買える物だけの数（all・same_day）を足す

-- -----------------------------------------------------------------------------
-- 一覧の検索: 売り切れも返し、後ろにまとめる
-- -----------------------------------------------------------------------------
create or replace function public.search_listings(p jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_q        text := nullif(btrim(left(coalesce(p ->> 'q', ''), 50)), '');
  v_like     text;
  v_cats     text[];
  v_worn     text[];
  v_min      integer := greatest(coalesce((p ->> 'price_min')::integer, 0), 0);
  v_max      integer := least(coalesce((p ->> 'price_max')::integer, 100000), 100000);
  v_same_day boolean := coalesce((p ->> 'same_day')::boolean, false);
  v_photo    boolean := coalesce((p ->> 'photo')::boolean, false);
  v_anon     boolean := coalesce((p ->> 'anonymous')::boolean, false);
  v_letter   boolean := coalesce((p ->> 'letter')::boolean, false);
  v_nego     boolean := coalesce((p ->> 'negotiable')::boolean, false);
  v_online   boolean := coalesce((p ->> 'online')::boolean, false);
  v_rating4  boolean := coalesce((p ->> 'rating4')::boolean, false);
  v_sales10  boolean := coalesce((p ->> 'sales10')::boolean, false);
  v_seller   uuid := nullif(p ->> 'seller', '')::uuid;
  v_sort     text := coalesce(p ->> 'sort', 'new');
  v_limit    integer := least(greatest(coalesce((p ->> 'limit')::integer, 24), 1), 60);
  v_offset   integer := least(greatest(coalesce((p ->> 'offset')::integer, 0), 0), 10000);
  v_presence boolean;
  v_result   jsonb;
begin
  -- 運営が「ログイン中の表示を出す」にしていないあいだは、オンラインの絞り込み・印・件数を全部止める（0021。そのまま残す）
  select coalesce(st.show_presence, false) into v_presence from public.site_settings st where st.id;
  v_presence := coalesce(v_presence, false);
  if not v_presence then
    v_online := false;
  end if;
  if v_q is not null then
    v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  select coalesce(array_agg(x), '{}') into v_cats
  from jsonb_array_elements_text(case when jsonb_typeof(p -> 'categories') = 'array' then p -> 'categories' else '[]'::jsonb end) x
  where x in ('panty', 'bra', 'set', 'fluid', 'clothes', 'other');
  select coalesce(array_agg(x), '{}') into v_worn
  from jsonb_array_elements_text(case when jsonb_typeof(p -> 'worn') = 'array' then p -> 'worn' else '[]'::jsonb end) x
  where x in ('1', '2', '3', '4-5', '6+');
  if v_sort not in ('new', 'pop', 'price_asc', 'price_desc', 'review') then
    v_sort := 'new';
  end if;

  with base as (
    select l.id, l.title, l.category, l.price, l.worn_days, l.image_paths[1] as image_path,
           l.same_day, l.opt_photo, l.opt_letter, l.anonymous_ok, l.pre_message_ok, l.cool_shipping, l.followers_only,
           l.like_count, l.sales_count, l.published_at, l.status,
           l.seller_id, s.public_name as seller_name, s.avatar_path as seller_avatar, s.last_seen_at as seller_last_seen,
           s.rating_sum, s.rating_count, s.sales_count as seller_sales,
           (v_presence and s.last_seen_at > now() - interval '10 minutes') as seller_online
    from public.listings l
    join public.profiles s on s.id = l.seller_id
    -- 売り切れも一覧に残す（0022）。非公開・下書き・削除・運営の非公開は出さない。見えるかは listings_read（RLS）でも確かめる
    where l.status in ('published', 'sold')
      -- 検索欄は「商品・出品者を検索」なので、出品者の公開名も探す
      and (v_like is null or l.title ilike v_like escape '\' or l.description ilike v_like escape '\' or s.public_name ilike v_like escape '\')
      and l.price between v_min and v_max
      and (cardinality(v_worn) = 0
           or (l.worn_days = 1 and '1' = any (v_worn))
           or (l.worn_days = 2 and '2' = any (v_worn))
           or (l.worn_days = 3 and '3' = any (v_worn))
           or (l.worn_days in (4, 5) and '4-5' = any (v_worn))
           or (l.worn_days >= 6 and '6+' = any (v_worn)))
      and (v_seller is null or l.seller_id = v_seller)
  ),
  opt as (
    select * from base b
    where (not v_same_day or b.same_day)
      and (not v_photo or b.opt_photo)
      and (not v_anon or b.anonymous_ok)
      and (not v_letter or b.opt_letter)
      and (not v_nego or b.pre_message_ok)
      and (not v_online or coalesce(b.seller_online, false))
      and (not v_rating4 or (b.rating_count > 0 and b.rating_sum::numeric / b.rating_count >= 4))
      and (not v_sales10 or b.seller_sales >= 10)
  ),
  hits as (
    select * from opt o where cardinality(v_cats) = 0 or o.category = any (v_cats)
  ),
  page as (
    select h.* from hits h
    order by
      -- 売り切れは、どの並び順でも買える物の後ろ（0022）
      (h.status = 'sold') asc,
      case when v_sort = 'price_asc' then h.price end asc,
      case when v_sort = 'price_desc' then h.price end desc,
      case when v_sort = 'pop' then h.like_count + h.sales_count * 3 + (case when h.same_day then 1 else 0 end) end desc,
      case when v_sort = 'review' then h.rating_sum::numeric / nullif(h.rating_count, 0) end desc nulls last,
      h.published_at desc, h.id
    limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from hits),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', pg.id, 'title', pg.title, 'category', pg.category, 'price', pg.price, 'worn_days', pg.worn_days,
        'image_path', pg.image_path, 'same_day', pg.same_day, 'opt_photo', pg.opt_photo, 'opt_letter', pg.opt_letter,
        'anonymous_ok', pg.anonymous_ok, 'pre_message_ok', pg.pre_message_ok, 'cool_shipping', pg.cool_shipping,
        'followers_only', pg.followers_only, 'like_count', pg.like_count, 'published_at', pg.published_at,
        'seller_id', pg.seller_id, 'seller_name', pg.seller_name, 'seller_avatar', pg.seller_avatar,
        'seller_online', coalesce(pg.seller_online, false), 'status', pg.status)
        order by
          (pg.status = 'sold') asc,
          case when v_sort = 'price_asc' then pg.price end asc,
          case when v_sort = 'price_desc' then pg.price end desc,
          case when v_sort = 'pop' then pg.like_count + pg.sales_count * 3 + (case when pg.same_day then 1 else 0 end) end desc,
          case when v_sort = 'review' then pg.rating_sum::numeric / nullif(pg.rating_count, 0) end desc nulls last,
          pg.published_at desc, pg.id)
      from page pg), '[]'::jsonb),
    'facets', jsonb_build_object(
      'categories', (select jsonb_build_object(
          'all', count(*),
          'panty', count(*) filter (where o.category = 'panty'),
          'bra', count(*) filter (where o.category = 'bra'),
          'set', count(*) filter (where o.category = 'set'),
          'fluid', count(*) filter (where o.category = 'fluid'),
          'clothes', count(*) filter (where o.category = 'clothes'),
          'other', count(*) filter (where o.category = 'other'))
        from opt o),
      'options', (select jsonb_build_object(
          'same_day', count(*) filter (where h.same_day),
          'photo', count(*) filter (where h.opt_photo),
          'anonymous', count(*) filter (where h.anonymous_ok),
          'letter', count(*) filter (where h.opt_letter),
          'negotiable', count(*) filter (where h.pre_message_ok),
          'online', count(*) filter (where coalesce(h.seller_online, false)),
          'rating4', count(*) filter (where h.rating_count > 0 and h.rating_sum::numeric / h.rating_count >= 4),
          'sales10', count(*) filter (where h.seller_sales >= 10))
        from hits h),
      -- 買える物だけの数（トップの「公開中の商品」・出品者ページの「出品中」）。total と上の件数は売り切れを含む（0022）
      'available', (select jsonb_build_object(
          'all', count(*) filter (where h.status = 'published'),
          'same_day', count(*) filter (where h.status = 'published' and h.same_day))
        from hits h)
    )
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.search_listings(jsonb) from public;
grant execute on function public.search_listings(jsonb) to anon, authenticated;
