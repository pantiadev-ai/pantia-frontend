-- =============================================================================
-- 0021 presence toggle — ログイン中の表示を、運営の設定で出す／隠す（改修リスト 行9）
-- -----------------------------------------------------------------------------
-- 決まり
--   ・site_settings.show_presence（既定 false = 隠す）。公開の画面が出し分けに使うので、誰でも読める（列の select）
--   ・変えるのは admin_update_settings だけ（0012 の定義に show_presence を1つ足した。ほかは同じ）
--   ・search_listings（0003 の定義に足した）: false のあいだは「オンラインの人だけ」の絞り込みを効かせず、
--     seller_online を false で返し、件数の online を 0 にする（古い URL の ?online=1 でも、出品は全部出る）
--   ・profiles.last_seen_at は今までどおり読める。隠すのは画面の表示と絞り込み
--   ・管理画面の表示（利用者の一覧の最終ログイン）はそのまま
-- =============================================================================

alter table public.site_settings
  add column show_presence boolean not null default false;
grant select (show_presence) on public.site_settings to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 1. 管理画面: サイト設定に show_presence を足す
-- -----------------------------------------------------------------------------
create or replace function public.admin_update_settings(p_admin uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key   text;
  v_cur   public.site_settings;
  v_log   jsonb;
  v_words text[];
begin
  perform public.assert_admin(p_admin);
  if jsonb_typeof(p_patch) <> 'object' then
    raise exception 'pantia:bad_request' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('fee_rate', 'anonymous_fee', 'min_payout', 'payout_fee', 'auto_complete_days', 'video_fee', 'extend_fee_per_day',
                     'registration_open', 'maintenance', 'notice', 'mail_order', 'mail_kyc', 'mail_payout', 'mod_spam_filter', 'show_presence',
                     'forwarding_address', 'transfer_enabled', 'transfer_bank', 'transfer_branch', 'transfer_type',
                     'transfer_number', 'transfer_holder', 'banned_words') then
      raise exception 'pantia:bad_request' using errcode = '22023';
    end if;
  end loop;
  if p_patch ? 'banned_words' then
    if jsonb_typeof(p_patch -> 'banned_words') <> 'array'
       or exists (select 1 from jsonb_array_elements(p_patch -> 'banned_words') e where jsonb_typeof(e) <> 'string') then
      raise exception 'pantia:bad_request' using errcode = '22023';
    end if;
    v_words := array(select e.v from jsonb_array_elements_text(p_patch -> 'banned_words') with ordinality as e(v, i) order by e.i);
  end if;
  select * into v_cur from public.site_settings where id for update;
  -- 受付をオンにするなら振込先が全部そろっていること（制約の 23514 より先に、わかる文で止める）
  if coalesce((p_patch ->> 'transfer_enabled')::boolean, v_cur.transfer_enabled)
     and (coalesce(p_patch ->> 'transfer_bank', v_cur.transfer_bank) = ''
          or coalesce(p_patch ->> 'transfer_branch', v_cur.transfer_branch) = ''
          or coalesce(p_patch ->> 'transfer_number', v_cur.transfer_number) = ''
          or coalesce(p_patch ->> 'transfer_holder', v_cur.transfer_holder) = '') then
    raise exception 'pantia:transfer_incomplete' using errcode = '22023';
  end if;
  update public.site_settings s set
    fee_rate           = coalesce((p_patch ->> 'fee_rate')::numeric, s.fee_rate),
    anonymous_fee      = coalesce((p_patch ->> 'anonymous_fee')::integer, s.anonymous_fee),
    min_payout         = coalesce((p_patch ->> 'min_payout')::integer, s.min_payout),
    payout_fee         = coalesce((p_patch ->> 'payout_fee')::integer, s.payout_fee),
    auto_complete_days = coalesce((p_patch ->> 'auto_complete_days')::integer, s.auto_complete_days),
    video_fee          = coalesce((p_patch ->> 'video_fee')::integer, s.video_fee),
    extend_fee_per_day = coalesce((p_patch ->> 'extend_fee_per_day')::integer, s.extend_fee_per_day),
    registration_open  = coalesce((p_patch ->> 'registration_open')::boolean, s.registration_open),
    maintenance        = coalesce((p_patch ->> 'maintenance')::boolean, s.maintenance),
    notice             = coalesce(p_patch ->> 'notice', s.notice),
    mail_order         = coalesce((p_patch ->> 'mail_order')::boolean, s.mail_order),
    mail_kyc           = coalesce((p_patch ->> 'mail_kyc')::boolean, s.mail_kyc),
    mail_payout        = coalesce((p_patch ->> 'mail_payout')::boolean, s.mail_payout),
    mod_spam_filter    = coalesce((p_patch ->> 'mod_spam_filter')::boolean, s.mod_spam_filter),
    show_presence      = coalesce((p_patch ->> 'show_presence')::boolean, s.show_presence),
    forwarding_address = coalesce(p_patch ->> 'forwarding_address', s.forwarding_address),
    transfer_enabled   = coalesce((p_patch ->> 'transfer_enabled')::boolean, s.transfer_enabled),
    transfer_bank      = coalesce(p_patch ->> 'transfer_bank', s.transfer_bank),
    transfer_branch    = coalesce(p_patch ->> 'transfer_branch', s.transfer_branch),
    transfer_type      = coalesce(p_patch ->> 'transfer_type', s.transfer_type),
    transfer_number    = coalesce(p_patch ->> 'transfer_number', s.transfer_number),
    transfer_holder    = coalesce(p_patch ->> 'transfer_holder', s.transfer_holder),
    banned_words       = coalesce(v_words, s.banned_words),
    updated_by         = p_admin
  where s.id;
  v_log := p_patch - 'transfer_number' - 'banned_words';
  if p_patch ? 'transfer_number' then
    v_log := v_log || jsonb_build_object('transfer_number', 'changed');
  end if;
  if p_patch ? 'banned_words' then
    v_log := v_log || jsonb_build_object('banned_words', cardinality(v_words));
  end if;
  perform public.audit(p_admin, 'settings.update', 'settings', 'site', v_log);
end;
$$;
revoke all on function public.admin_update_settings(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_update_settings(uuid, jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- 2. 一覧の検索: 隠すあいだは、オンラインの絞り込み・印・件数を止める
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
  -- 運営が「ログイン中の表示を出す」にしていないあいだは、オンラインの絞り込み・印・件数を全部止める（0021）
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
    where l.status = 'published'
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
        'seller_online', coalesce(pg.seller_online, false))
        order by
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
        from hits h)
    )
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.search_listings(jsonb) from public;
grant execute on function public.search_listings(jsonb) to anon, authenticated;
