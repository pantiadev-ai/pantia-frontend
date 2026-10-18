-- =============================================================================
-- 0003 catalogue — 出品・お気に入り・カート・フォロー・ブロック・商品の検索
-- -----------------------------------------------------------------------------
-- 決まり
--   ・出品者が「公開」にできるのは、出品者で・有効で・本人確認が済んでいるときだけ（下書きは確認の前でも可）
--   ・誰でも見られる出品は「公開中・売り切れ」で、出品者が公開できる状態のものだけ。
--     フォロワー限定はフォローしている人だけ、ブロックし合っている人には見せない
--   ・状態（公開・非公開・運営の非公開・売り切れ）を利用者が変えられる道は、下の見張り（trigger）で絞る
--   ・画像のパスは「出品者の id/<uuid>.webp」だけ（他人の画像を指させない。28 §A8-2）
--   ・数（いいね・フォロワー）は security definer の trigger だけが書く
-- =============================================================================

-- 画像のパスの並びが「<owner>/<uuid>.webp」だけで、重複なし・最大 p_max 個か
create or replace function public.paths_ok(p_paths text[], p_owner uuid, p_max integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(p_paths), 0) <= p_max
     and not exists (
       select 1 from unnest(p_paths) x
       where x is null
          or x !~ ('^' || p_owner::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$')
     )
     and (select count(distinct x) from unnest(p_paths) x) = coalesce(cardinality(p_paths), 0);
$$;
revoke all on function public.paths_ok(text[], uuid, integer) from public;
grant execute on function public.paths_ok(text[], uuid, integer) to anon, authenticated, service_role;

-- 出品者として人前に出せる人か（出品者・有効・本人確認済み）
create or replace function public.seller_is_public(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_uid and p.role = 'seller' and p.status = 'active' and p.kyc_status = 'approved'
  );
$$;
revoke all on function public.seller_is_public(uuid) from public;
grant execute on function public.seller_is_public(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- blocks: ブロック。した人だけが見える。ブロックしたら、お互いのフォローを外す
-- -----------------------------------------------------------------------------
create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);
alter table public.blocks enable row level security;
revoke all on public.blocks from anon, authenticated;
grant select, delete on public.blocks to authenticated;
grant insert (blocked_id) on public.blocks to authenticated;
alter table public.blocks alter column blocker_id set default auth.uid();
create policy blocks_own_read on public.blocks for select to authenticated using (blocker_id = (select auth.uid()));
create policy blocks_own_insert on public.blocks for insert to authenticated with check (blocker_id = (select auth.uid()));
create policy blocks_own_delete on public.blocks for delete to authenticated using (blocker_id = (select auth.uid()));

-- 自分と相手のどちらかがブロックしているか（ログインしていなければ false）
create or replace function public.is_blocked_with(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = (select auth.uid()) and b.blocked_id = p_other)
       or (b.blocker_id = p_other and b.blocked_id = (select auth.uid()))
  );
$$;
revoke all on function public.is_blocked_with(uuid) from public;
grant execute on function public.is_blocked_with(uuid) to anon, authenticated;

-- 2人の間にブロックがあるか（サーバーの関数の中で使う）
create or replace function public.blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b) or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;
revoke all on function public.blocked_between(uuid, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- follows: 購入者・出品者が出品者をフォローする
-- -----------------------------------------------------------------------------
create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  seller_id   uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, seller_id),
  check (follower_id <> seller_id)
);
create index follows_seller_idx on public.follows (seller_id, created_at desc);
alter table public.follows enable row level security;
revoke all on public.follows from anon, authenticated;
grant select, delete on public.follows to authenticated;
grant insert (seller_id) on public.follows to authenticated;
alter table public.follows alter column follower_id set default auth.uid();
-- フォローしている人は自分の分、出品者は自分のフォロワーを見られる
create policy follows_read on public.follows for select to authenticated
  using (follower_id = (select auth.uid()) or seller_id = (select auth.uid()));
create policy follows_insert on public.follows for insert to authenticated
  with check (
    follower_id = (select auth.uid())
    and public.seller_is_public(seller_id)
    and not public.is_blocked_with(seller_id)
    and exists (select 1 from public.profiles me where me.id = (select auth.uid()) and me.status = 'active')
  );
create policy follows_delete on public.follows for delete to authenticated using (follower_id = (select auth.uid()));

create or replace function public.is_following(p_seller uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.follows f where f.follower_id = (select auth.uid()) and f.seller_id = p_seller);
$$;
revoke all on function public.is_following(uuid) from public;
grant execute on function public.is_following(uuid) to anon, authenticated;

create or replace function public.follows_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set follower_count = follower_count + 1 where id = new.seller_id;
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    if exists (select 1 from public.profiles p where p.id = new.seller_id and p.notify_follow) then
      perform public.notify(new.seller_id, 'follow', 'フォローされました',
        public.san((select p.public_name from public.profiles p where p.id = new.follower_id)) || 'があなたをフォローしました。',
        '/mypage');
    end if;
    return new;
  else
    update public.profiles set follower_count = greatest(follower_count - 1, 0) where id = old.seller_id;
    update public.profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
    return old;
  end if;
end;
$$;
revoke all on function public.follows_count() from public, anon, authenticated;
create trigger follows_count after insert or delete on public.follows for each row execute function public.follows_count();

-- ブロックしたら、お互いのフォローを外す
create or replace function public.blocks_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and seller_id = new.blocked_id)
     or (follower_id = new.blocked_id and seller_id = new.blocker_id);
  return new;
end;
$$;
revoke all on function public.blocks_cleanup() from public, anon, authenticated;
create trigger blocks_cleanup after insert on public.blocks for each row execute function public.blocks_cleanup();

-- -----------------------------------------------------------------------------
-- listings: 出品
-- -----------------------------------------------------------------------------
create table public.listings (
  id             uuid primary key default gen_random_uuid(),
  seller_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title          text not null default '' check (char_length(title) <= 40 and title !~ '[[:cntrl:]]'),
  description    text not null default '' check (char_length(description) <= 500),
  category       text check (category in ('panty', 'bra', 'set', 'fluid', 'clothes', 'other')),
  worn_days      smallint check (worn_days between 1 and 6),
  material       text check (material in ('cotton', 'lace', 'silk', 'nylon', 'other')),
  color          text check (color in ('white', 'black', 'pink', 'beige', 'blue', 'other')),
  size           text check (size in ('S', 'M', 'L', 'LL', 'free')),
  price          integer check (price between 500 and 100000 and price % 100 = 0),
  stock_mode     text not null default 'single' check (stock_mode in ('single', 'multiple')),
  -- 無料の付け物（買う人が選べるのは写真・手紙。ジップロック・カードは出品者の案内）
  opt_photo      boolean not null default true,
  opt_letter     boolean not null default true,
  opt_ziplock    boolean not null default false,
  opt_card       boolean not null default false,
  -- 有料の付け物（値段は site_settings の video_fee・extend_fee_per_day）
  opt_video      boolean not null default false,
  opt_extend     boolean not null default false,
  max_worn_days  smallint check (max_worn_days between 1 and 6),
  request_only   boolean not null default false,
  -- 発送
  same_day       boolean not null default true,
  anonymous_ok   boolean not null default false,
  pre_message_ok boolean not null default true,
  followers_only boolean not null default false,
  cool_shipping  boolean not null default false,
  ship_estimate  text not null default 'same_next' check (ship_estimate in ('same_next', 'd1_2', 'd2_3', 'd3_5')),
  ng_note        text not null default '' check (char_length(ng_note) <= 200),
  image_paths    text[] not null default '{}' check (public.paths_ok(image_paths, seller_id, 5)),
  -- draft 下書き / published 公開中 / private 出品者の非公開 / sold 売り切れ / hidden 運営の非公開 / deleted 削除
  status         text not null default 'draft' check (status in ('draft', 'published', 'private', 'sold', 'hidden', 'deleted')),
  view_count     integer not null default 0 check (view_count >= 0),
  like_count     integer not null default 0 check (like_count >= 0),
  sales_count    integer not null default 0 check (sales_count >= 0),
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- 下書き・削除以外は、全部の必須がそろっていること（写真は1〜5枚）
  constraint listings_complete check (
    status in ('draft', 'deleted')
    or (char_length(title) >= 1 and char_length(description) >= 1 and category is not null
        and worn_days is not null and price is not null and cardinality(image_paths) between 1 and 5)
  ),
  constraint listings_max_worn check (max_worn_days is null or (worn_days is not null and max_worn_days >= worn_days))
);
create index listings_seller_idx on public.listings (seller_id, created_at desc);
create index listings_public_idx on public.listings (published_at desc) where status = 'published';
create index listings_category_idx on public.listings (category, published_at desc) where status = 'published';
create index listings_title_trgm on public.listings using gin (title extensions.gin_trgm_ops);
create trigger listings_touch before update on public.listings for each row execute function public.touch_updated_at();

alter table public.listings enable row level security;
revoke all on public.listings from anon, authenticated;
grant select on public.listings to anon, authenticated;
grant insert (title, description, category, worn_days, material, color, size, price, stock_mode,
              opt_photo, opt_letter, opt_ziplock, opt_card, opt_video, opt_extend, max_worn_days, request_only,
              same_day, anonymous_ok, pre_message_ok, followers_only, cool_shipping, ship_estimate, ng_note,
              image_paths, status)
  on public.listings to authenticated;
grant update (title, description, category, worn_days, material, color, size, price, stock_mode,
              opt_photo, opt_letter, opt_ziplock, opt_card, opt_video, opt_extend, max_worn_days, request_only,
              same_day, anonymous_ok, pre_message_ok, followers_only, cool_shipping, ship_estimate, ng_note,
              image_paths, status)
  on public.listings to authenticated;

create policy listings_read on public.listings for select to anon, authenticated
  using (
    (seller_id = (select auth.uid()) and status <> 'deleted')
    or (
      status in ('published', 'sold')
      and public.seller_is_public(seller_id)
      and (not followers_only or public.is_following(seller_id))
      and not public.is_blocked_with(seller_id)
    )
  );
create policy listings_insert_own on public.listings for insert to authenticated
  with check (
    seller_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'seller' and p.status = 'active')
  );
create policy listings_update_own on public.listings for update to authenticated
  using (seller_id = (select auth.uid()) and status not in ('deleted', 'hidden'))
  with check (seller_id = (select auth.uid()));

-- 状態を変える道の見張り。利用者（画面）からの変更だけを絞る。サーバーの関数（service_role・definer）は通す
--   security definer にしない（is_end_user が呼んだ人を見分けられなくなる）
create or replace function public.listings_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ok_seller boolean;
begin
  if not public.is_end_user() then
    if new.status = 'published' and new.published_at is null then
      new.published_at := now();
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'published') then
      raise exception 'listing status not allowed' using errcode = '42501';
    end if;
    new.view_count := 0; new.like_count := 0; new.sales_count := 0; new.published_at := null;
  else
    -- 売り切れの出品は、削除だけできる（取引の記録は注文の側に残る）
    if old.status = 'sold' and not (new.status = 'deleted') then
      raise exception 'sold listing is read-only' using errcode = '42501';
    end if;
    if new.status not in ('draft', 'published', 'private', 'deleted') then
      raise exception 'listing status not allowed' using errcode = '42501';
    end if;
    -- 一度公開したものは下書きに戻さない
    if old.status <> 'draft' and new.status = 'draft' then
      raise exception 'cannot return to draft' using errcode = '42501';
    end if;
  end if;

  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    select (p.role = 'seller' and p.status = 'active' and p.kyc_status = 'approved') into v_ok_seller
    from public.profiles p where p.id = new.seller_id;
    if not coalesce(v_ok_seller, false) then
      raise exception 'kyc required to publish' using errcode = '42501';
    end if;
    if new.published_at is null then
      new.published_at := now();
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.listings_guard() from public, anon, authenticated;
create trigger listings_guard before insert or update on public.listings for each row execute function public.listings_guard();

-- 公開した出品をフォロワーに知らせる（最初の公開のときだけ）
create or replace function public.listings_announce()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.published_at is null) then
    insert into public.notifications (user_id, kind, title, body, link)
    select f.follower_id, 'listing', left(public.san(s.public_name) || 'の新着商品', 100), left(new.title, 300),
           '/items/' || new.id::text
    from public.follows f
    join public.profiles u on u.id = f.follower_id and u.notify_new_listing and u.status = 'active'
    left join public.profiles s on s.id = new.seller_id
    where f.seller_id = new.seller_id;
    perform public.audit(new.seller_id, 'listing.publish', 'listing', new.id::text, jsonb_build_object('title', left(new.title, 60)));
  end if;
  return new;
end;
$$;
revoke all on function public.listings_announce() from public, anon, authenticated;
create trigger listings_announce after insert or update of status on public.listings for each row execute function public.listings_announce();

-- 閲覧数を1つ足す（本人の閲覧は数えない）
-- 閲覧数。サーバーだけが呼ぶ（同じ回線・同じ商品は回数制限の台帳で6時間に1回に絞ってから。lib/catalogue.ts）。
-- 誰でも呼べると、公開の鍵で直に叩いて数を水増しできるため。p_viewer は見た人（本人の閲覧は数えない）
create or replace function public.bump_listing_view(p_listing uuid, p_viewer uuid default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.listings set view_count = view_count + 1
  where id = p_listing and status = 'published' and seller_id is distinct from p_viewer;
$$;
revoke all on function public.bump_listing_view(uuid, uuid) from public, anon, authenticated;
grant execute on function public.bump_listing_view(uuid, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- favorites: お気に入り（♡）。本人だけ。見える出品にだけ付けられる
-- -----------------------------------------------------------------------------
create table public.favorites (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);
create index favorites_listing_idx on public.favorites (listing_id);
-- 週間ランキング（その週に付いたお気に入りを数える）
create index favorites_created_idx on public.favorites (created_at);
alter table public.favorites enable row level security;
revoke all on public.favorites from anon, authenticated;
grant select, delete on public.favorites to authenticated;
grant insert (listing_id) on public.favorites to authenticated;
create policy favorites_own_read on public.favorites for select to authenticated using (user_id = (select auth.uid()));
create policy favorites_own_insert on public.favorites for insert to authenticated
  with check (
    user_id = (select auth.uid())
    -- 下の exists は呼んだ人の RLS で読む＝見えない出品には付けられない
    and exists (select 1 from public.listings l where l.id = listing_id and l.status = 'published' and l.seller_id <> (select auth.uid()))
  );
create policy favorites_own_delete on public.favorites for delete to authenticated using (user_id = (select auth.uid()));

create or replace function public.favorites_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.listings set like_count = like_count + 1 where id = new.listing_id;
    return new;
  else
    update public.listings set like_count = greatest(like_count - 1, 0) where id = old.listing_id;
    return old;
  end if;
end;
$$;
revoke all on function public.favorites_count() from public, anon, authenticated;
create trigger favorites_count after insert or delete on public.favorites for each row execute function public.favorites_count();

-- -----------------------------------------------------------------------------
-- cart_items: カート。選んだ付け物も残す（値段は買うときにサーバーで計算し直す）
-- -----------------------------------------------------------------------------
create table public.cart_items (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  options    jsonb not null default '{}'::jsonb check (jsonb_typeof(options) = 'object' and pg_column_size(options) <= 500),
  added_at   timestamptz not null default now(),
  primary key (user_id, listing_id)
);
alter table public.cart_items enable row level security;
revoke all on public.cart_items from anon, authenticated;
grant select, delete on public.cart_items to authenticated;
grant insert (listing_id, options) on public.cart_items to authenticated;
grant update (options) on public.cart_items to authenticated;
create policy cart_own_read on public.cart_items for select to authenticated using (user_id = (select auth.uid()));
create policy cart_own_insert on public.cart_items for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.listings l where l.id = listing_id and l.status = 'published' and l.seller_id <> (select auth.uid()))
  );
create policy cart_own_update on public.cart_items for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy cart_own_delete on public.cart_items for delete to authenticated using (user_id = (select auth.uid()));

-- カートは30件まで（方針の中で同じ表を数えると無限に回るので trigger で見る。security definer にしない）
create or replace function public.cart_items_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_end_user() and (select count(*) from public.cart_items c where c.user_id = new.user_id) >= 30 then
    raise exception 'pantia:cart_full' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.cart_items_guard() from public, anon, authenticated;
create trigger cart_items_guard before insert on public.cart_items for each row execute function public.cart_items_guard();

-- -----------------------------------------------------------------------------
-- search_listings: 商品一覧の検索・並び替え・絞り込みの件数を1回で返す
--   呼んだ人の権限で動く（security invoker）ので、RLS の「見せない」はそのまま効く。
--   文字はそのまま SQL にせず、LIKE の記号（% _ \）を外してから使う（28 §A12）
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
  v_result   jsonb;
begin
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
           (s.last_seen_at > now() - interval '10 minutes') as seller_online
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
