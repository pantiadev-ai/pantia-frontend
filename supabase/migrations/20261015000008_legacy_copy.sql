-- =============================================================================
-- 0008 legacy_copy — 前の表（sellers・items）から新しい表へ写す（1回だけ・何度流しても同じ結果）
-- -----------------------------------------------------------------------------
--   ・前の表の列は推定なので、to_jsonb で行ごと読んで、無い列は空として扱う
--   ・profiles: auth.users の全員ぶん作る。sellers に居るか items を持っていれば出品者、それ以外は購入者
--   ・items: 出品の「下書き」として写す（写真は前の箱にあり形が違うため写さない。出品者が写真を足して公開する）
--   ・写した items は legacy_item_map に記録し、2回目からは飛ばす
--   ・前の表は消さない。新しいアプリを出したあと supabase/post-deploy/ の SQL で閉じる
-- =============================================================================

create table public.legacy_item_map (
  item_id    text primary key,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.legacy_item_map enable row level security;
revoke all on public.legacy_item_map from anon, authenticated, service_role;

-- 文字をきれいにする（制御文字を除き、前後の空白を取り、長さを切る）
create or replace function public.legacy_clean(p text, p_max integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(left(btrim(regexp_replace(coalesce(p, ''), '[[:cntrl:]]', '', 'g')), p_max), '');
$$;
revoke all on function public.legacy_clean(text, integer) from public, anon, authenticated, service_role;

create or replace function public.migrate_legacy_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r          record;
  v_j        jsonb;
  v_meta     jsonb;
  v_has_item boolean;
  v_nick     text;
  v_age      integer;
  v_job      text;
  v_owner    text;
  v_seller   uuid;
  v_cat      text;
  v_price    numeric;
  v_created  timestamptz;
  v_id       uuid;
  v_profiles integer := 0;
  v_roles    integer := 0;
  v_listings integer := 0;
  v_skipped  integer := 0;
  v_errors   integer := 0;
begin
  -- 1) 利用者ごとの profiles
  for r in
    select u.id, coalesce(u.raw_user_meta_data, '{}'::jsonb) as meta, u.created_at
    from auth.users u
    where not exists (select 1 from public.profiles p where p.id = u.id)
  loop
    select to_jsonb(s) into v_j from public.sellers s where s.id = r.id;
    v_has_item := exists (
      select 1 from public.items i
      where to_jsonb(i) ->> 'user_id' = r.id::text or to_jsonb(i) ->> 'seller_id' = r.id::text);
    v_meta := r.meta;
    v_nick := coalesce(public.legacy_clean(v_j ->> 'nickname', 20), public.legacy_clean(v_meta ->> 'nickname', 20), 'ユーザー');
    v_age := case when coalesce(v_j ->> 'age', v_meta ->> 'age', '') ~ '^[0-9]{2}$'
                  then coalesce(v_j ->> 'age', v_meta ->> 'age')::integer end;
    if v_age is not null and v_age not between 18 and 99 then
      v_age := null;
    end if;
    v_job := public.legacy_clean(coalesce(v_j ->> 'occupation', v_meta ->> 'occupation'), 20);
    if v_j is not null or v_has_item then
      insert into public.profiles (id, nickname, role, age, occupation, bio, created_at)
      values (r.id, v_nick, 'seller', v_age, v_job, coalesce(left(regexp_replace(coalesce(v_j ->> 'bio', ''), '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]', '', 'g'), 1000), ''),
              r.created_at);
    else
      insert into public.profiles (id, nickname, role, created_at)
      values (r.id, v_nick, 'buyer', r.created_at);
    end if;
    v_profiles := v_profiles + 1;
  end loop;

  -- 2) 出品を持っているのに購入者になっている人は出品者にする（注文がまだ無い人だけ）
  update public.profiles p set role = 'seller'
  where p.role = 'buyer' and p.purchase_count = 0
    and not exists (select 1 from public.orders o where o.buyer_id = p.id)
    and exists (select 1 from public.items i
                where to_jsonb(i) ->> 'user_id' = p.id::text or to_jsonb(i) ->> 'seller_id' = p.id::text);
  get diagnostics v_roles = row_count;

  -- 3) items → listings（下書き）
  for r in select to_jsonb(i) as j from public.items i loop
    v_j := r.j;
    if v_j ->> 'id' is null or exists (select 1 from public.legacy_item_map m where m.item_id = v_j ->> 'id') then
      continue;
    end if;
    v_owner := coalesce(v_j ->> 'user_id', v_j ->> 'seller_id', '');
    if v_owner !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    v_seller := v_owner::uuid;
    if not exists (select 1 from public.profiles p where p.id = v_seller and p.role = 'seller') then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    v_cat := coalesce(v_j ->> 'category', '');
    v_cat := case
      when v_cat in ('panty', 'bra', 'set', 'fluid', 'clothes', 'other') then v_cat
      when v_cat like '%パンティ%' or v_cat like '%ショーツ%' then 'panty'
      when v_cat like '%セット%' then 'set'
      when v_cat like '%ブラ%' then 'bra'
      when v_cat like '%体液%' then 'fluid'
      when v_cat like '%衣類%' then 'clothes'
      when v_cat = '' then null
      else 'other' end;
    v_price := case when coalesce(v_j ->> 'price', '') ~ '^[0-9]{1,9}(\.[0-9]+)?$' then (v_j ->> 'price')::numeric end;
    v_created := case when coalesce(v_j ->> 'created_at', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                      then (v_j ->> 'created_at')::timestamptz else now() end;
    begin
      insert into public.listings (seller_id, title, description, category, price, same_day, status, created_at)
      values (
        v_seller,
        coalesce(public.legacy_clean(v_j ->> 'title', 40), ''),
        coalesce(left(regexp_replace(coalesce(v_j ->> 'description', ''), '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]', '', 'g'), 500), ''),
        v_cat,
        case when v_price is null then null else (round(least(greatest(v_price, 500), 100000) / 100) * 100)::integer end,
        coalesce(v_j ->> 'shipping_badge', '') <> '通常発送',
        'draft',
        v_created)
      returning id into v_id;
      insert into public.legacy_item_map (item_id, listing_id) values (v_j ->> 'id', v_id);
      v_listings := v_listings + 1;
    exception when others then
      v_errors := v_errors + 1;
    end;
  end loop;

  return jsonb_build_object('profiles', v_profiles, 'roles_fixed', v_roles, 'listings', v_listings,
                            'skipped', v_skipped, 'errors', v_errors);
end;
$$;
revoke all on function public.migrate_legacy_data() from public, anon, authenticated, service_role;

select public.migrate_legacy_data();
