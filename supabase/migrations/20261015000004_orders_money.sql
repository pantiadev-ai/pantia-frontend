-- =============================================================================
-- 0004 orders_money — 注文・お届け先・レビュー・振込口座・売上の台帳・振込申請
-- -----------------------------------------------------------------------------
-- 決まり（28 §O5: 何枚もの表にまたがる操作は DB の関数の中で1回で行う）
--   ・注文・台帳・振込は、利用者が直接書けない。書くのは security definer の関数だけ
--   ・値段は必ず DB で出品から計算し直す（画面から来た金額は使わない）
--   ・「買う」は service_role だけが呼べる create_checkout。サーバーがログイン・本人確認・回数を確かめてから呼ぶ
--   ・入金の確定（mark_group_paid）は service_role だけ。決済会社の通知を確かめてから呼ぶ。金額が合わなければ確定しない
--   ・1点物は、支払い待ち〜取引完了の注文が同時に1件だけ（一意の索引で二重売りを止める）
--   ・状態: pending 支払い待ち / paid 新規注文 / preparing 発送準備中 / shipped 発送済み / completed 取引完了 / cancelled キャンセル
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 値段の計算（出品・選んだ付け物・設定から）。だめな組み合わせは 22023 で止める
--   着用日数: 標準より長くするのは「日数延長」がある出品だけ。1日につき extend_fee_per_day。
--             標準より短くするのも「日数延長」がある出品だけ（+0円）。無い出品は標準の日数だけ
-- -----------------------------------------------------------------------------
create or replace function public.listing_quote(p_listing public.listings, p_opts jsonb, p_video_fee integer, p_extend_fee integer, p_anonymous_fee integer)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_opts   jsonb := case when jsonb_typeof(p_opts) = 'object' then p_opts else '{}'::jsonb end;
  v_days   integer;
  v_max    integer;
  v_photo  boolean := coalesce((v_opts ->> 'photo')::boolean, false);
  v_letter boolean := coalesce((v_opts ->> 'letter')::boolean, false);
  v_anon   boolean := coalesce((v_opts ->> 'anonymous')::boolean, false);
  v_video  boolean := coalesce((v_opts ->> 'video')::boolean, false);
  v_sur    integer := 0;
  v_vfee   integer := 0;
  v_afee   integer := 0;
  v_sub    integer;
begin
  if p_listing.price is null or p_listing.worn_days is null then
    raise exception 'pantia:unavailable' using errcode = '22023';
  end if;
  v_days := coalesce((v_opts ->> 'worn_days')::integer, p_listing.worn_days);
  v_max := case when p_listing.opt_extend then greatest(coalesce(p_listing.max_worn_days, p_listing.worn_days), p_listing.worn_days)
                else p_listing.worn_days end;
  if v_days < 1 or v_days > v_max or (not p_listing.opt_extend and v_days <> p_listing.worn_days) then
    raise exception 'pantia:bad_options' using errcode = '22023';
  end if;
  if v_days > p_listing.worn_days then
    v_sur := (v_days - p_listing.worn_days) * p_extend_fee;
  end if;
  if (v_photo and not p_listing.opt_photo) or (v_letter and not p_listing.opt_letter)
     or (v_anon and not p_listing.anonymous_ok) or (v_video and not p_listing.opt_video) then
    raise exception 'pantia:bad_options' using errcode = '22023';
  end if;
  if v_video then v_vfee := p_video_fee; end if;
  if v_anon then v_afee := p_anonymous_fee; end if;
  v_sub := p_listing.price + v_sur + v_vfee;
  return jsonb_build_object(
    'worn_days', v_days, 'photo', v_photo, 'letter', v_letter, 'anonymous', v_anon, 'video', v_video,
    'base_price', p_listing.price, 'worn_surcharge', v_sur, 'video_fee', v_vfee, 'anonymous_fee', v_afee,
    'subtotal', v_sub, 'total', v_sub + v_afee
  );
end;
$$;
revoke all on function public.listing_quote(public.listings, jsonb, integer, integer, integer) from public, anon, authenticated;

-- 画面の見積もり用（呼んだ人の RLS で出品を読む＝見えない出品は見積もれない）
create or replace function public.quote_listing(p_listing uuid, p_opts jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_l public.listings;
  v_s public.site_settings;
begin
  -- RLS を通して見えるかだけ確かめる（security definer なので、見えるかの判断は listings_read と同じ式で）
  select * into v_l from public.listings l
  where l.id = p_listing and l.status = 'published'
    and public.seller_is_public(l.seller_id)
    and (not l.followers_only or public.is_following(l.seller_id))
    and not public.is_blocked_with(l.seller_id);
  if not found then
    raise exception 'pantia:unavailable' using errcode = '22023';
  end if;
  select * into v_s from public.site_settings where id;
  return public.listing_quote(v_l, p_opts, v_s.video_fee, v_s.extend_fee_per_day, v_s.anonymous_fee);
end;
$$;
revoke all on function public.quote_listing(uuid, jsonb) from public;
grant execute on function public.quote_listing(uuid, jsonb) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- orders: 注文（1出品＝1行。カートでまとめて買うと group_id が同じになる）
-- -----------------------------------------------------------------------------
create table public.orders (
  id             uuid primary key default gen_random_uuid(),
  order_no       bigint generated always as identity (start with 1001) unique,
  group_id       uuid not null,
  buyer_id       uuid not null references public.profiles (id),
  seller_id      uuid not null references public.profiles (id),
  listing_id     uuid not null references public.listings (id),
  -- 買った時点の写し（あとで出品が直されても変わらない）
  title          text not null check (char_length(title) between 1 and 40),
  category       text not null,
  image_path     text,
  base_price     integer not null check (base_price > 0),
  worn_days      smallint not null,
  worn_surcharge integer not null default 0 check (worn_surcharge >= 0),
  options        jsonb not null default '{}'::jsonb,
  video_fee      integer not null default 0 check (video_fee >= 0),
  anonymous_fee  integer not null default 0 check (anonymous_fee >= 0),
  subtotal       integer not null check (subtotal > 0),
  total          integer not null check (total > 0),
  fee_rate       numeric(4, 3) not null,
  fee            integer not null check (fee >= 0),
  seller_net     integer not null check (seller_net >= 0),
  anonymous      boolean not null default false,
  single_stock   boolean not null,
  payment_method text not null check (payment_method in ('card', 'paypay', 'bank', 'mock')),
  payment_ref    text check (char_length(payment_ref) <= 200),
  status         text not null default 'pending' check (status in ('pending', 'paid', 'preparing', 'shipped', 'completed', 'cancelled')),
  carrier        text check (carrier in ('yamato', 'sagawa', 'japanpost', 'other')),
  tracking_no    text check (tracking_no ~ '^[0-9A-Za-z-]{4,30}$'),
  needs_refund   boolean not null default false,
  refund_ref     text check (char_length(refund_ref) <= 200),
  refunded_at    timestamptz,
  cancel_reason  text check (char_length(cancel_reason) <= 200),
  auto_completed boolean not null default false,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  paid_at        timestamptz,
  preparing_at   timestamptz,
  shipped_at     timestamptz,
  completed_at   timestamptz,
  cancelled_at   timestamptz,
  updated_at     timestamptz not null default now(),
  check (total = subtotal + anonymous_fee),
  check (seller_net = subtotal - fee),
  check (buyer_id <> seller_id)
);
-- 1点物の二重売りを止める
create unique index orders_single_stock_uq on public.orders (listing_id) where single_stock and status <> 'cancelled';
create index orders_buyer_idx on public.orders (buyer_id, created_at desc);
create index orders_seller_idx on public.orders (seller_id, created_at desc);
create index orders_group_idx on public.orders (group_id);
create index orders_pending_idx on public.orders (expires_at) where status = 'pending';
create index orders_shipped_idx on public.orders (shipped_at) where status = 'shipped';
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();

alter table public.orders enable row level security;
revoke all on public.orders from anon, authenticated;
-- 決済会社の番号（payment_ref・refund_ref）は画面に渡さない
grant select (id, order_no, group_id, buyer_id, seller_id, listing_id, title, category, image_path, base_price, worn_days,
              worn_surcharge, options, video_fee, anonymous_fee, subtotal, total, fee_rate, fee, seller_net, anonymous,
              single_stock, payment_method, status, carrier, tracking_no, needs_refund, refunded_at, cancel_reason,
              auto_completed, created_at, expires_at, paid_at, preparing_at, shipped_at, completed_at, cancelled_at)
  on public.orders to authenticated;
create policy orders_party_read on public.orders for select to authenticated
  using (buyer_id = (select auth.uid()) or seller_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- order_addresses: お届け先（注文ごと）。個人情報（28 §P1）
--   購入者は自分の分。出品者は「匿名配送でない・支払い済み〜発送済み」の間だけ読める。
--   匿名配送では出品者に見せない（出品者は代行センターへ送る。転送先は運営だけが見る）
--   取引が終わって90日で消す（cleanup_retention）
-- -----------------------------------------------------------------------------
create table public.order_addresses (
  order_id   uuid primary key references public.orders (id) on delete cascade,
  buyer_id   uuid not null references public.profiles (id),
  name       text not null check (char_length(name) between 1 and 30 and name !~ '[[:cntrl:]]'),
  postal     text not null check (postal ~ '^[0-9]{3}-[0-9]{4}$'),
  prefecture text not null check (char_length(prefecture) between 2 and 4),
  address1   text not null check (char_length(address1) between 1 and 100 and address1 !~ '[[:cntrl:]]'),
  address2   text not null default '' check (char_length(address2) <= 100 and address2 !~ '[[:cntrl:]]'),
  phone      text not null check (phone ~ '^0[0-9]{9,10}$'),
  created_at timestamptz not null default now()
);
alter table public.order_addresses enable row level security;
revoke all on public.order_addresses from anon, authenticated;
grant select on public.order_addresses to authenticated;
create policy order_addresses_buyer on public.order_addresses for select to authenticated using (buyer_id = (select auth.uid()));
create policy order_addresses_seller on public.order_addresses for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and o.seller_id = (select auth.uid())
      and not o.anonymous and o.status in ('paid', 'preparing', 'shipped')
  ));

-- 次回のための保存先（1人1件）
create table public.saved_addresses (
  user_id    uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 30 and name !~ '[[:cntrl:]]'),
  postal     text not null check (postal ~ '^[0-9]{3}-[0-9]{4}$'),
  prefecture text not null check (char_length(prefecture) between 2 and 4),
  address1   text not null check (char_length(address1) between 1 and 100 and address1 !~ '[[:cntrl:]]'),
  address2   text not null default '' check (char_length(address2) <= 100 and address2 !~ '[[:cntrl:]]'),
  phone      text not null check (phone ~ '^0[0-9]{9,10}$'),
  updated_at timestamptz not null default now()
);
create trigger saved_addresses_touch before update on public.saved_addresses for each row execute function public.touch_updated_at();
alter table public.saved_addresses enable row level security;
revoke all on public.saved_addresses from anon, authenticated;
grant select, delete on public.saved_addresses to authenticated;
grant insert (name, postal, prefecture, address1, address2, phone) on public.saved_addresses to authenticated;
grant update (name, postal, prefecture, address1, address2, phone) on public.saved_addresses to authenticated;
create policy saved_addresses_own on public.saved_addresses for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- reviews: 購入者 → 出品者のレビュー（取引完了の注文ごとに1件）
-- -----------------------------------------------------------------------------
create table public.reviews (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null unique references public.orders (id) on delete cascade,
  seller_id  uuid not null references public.profiles (id) on delete cascade,
  buyer_id   uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete set null,
  title      text not null,
  category   text not null,
  rating     smallint not null check (rating between 1 and 5),
  body       text not null default '' check (char_length(body) <= 500),
  status     text not null default 'visible' check (status in ('visible', 'hidden')),
  created_at timestamptz not null default now()
);
create index reviews_seller_idx on public.reviews (seller_id, created_at desc) where status = 'visible';
create index reviews_listing_idx on public.reviews (listing_id) where status = 'visible';
alter table public.reviews enable row level security;
revoke all on public.reviews from anon, authenticated;
grant select on public.reviews to anon, authenticated;
create policy reviews_read on public.reviews for select to anon, authenticated
  using (status = 'visible' or buyer_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- bank_accounts: 売上の振込先（出品者だけ。本人だけが読み書き）。個人情報（28 §P1）
-- -----------------------------------------------------------------------------
create table public.bank_accounts (
  user_id        uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  bank_name      text not null check (char_length(bank_name) between 1 and 30 and bank_name !~ '[[:cntrl:]]'),
  branch_name    text not null check (char_length(branch_name) between 1 and 30 and branch_name !~ '[[:cntrl:]]'),
  account_type   text not null check (account_type in ('ordinary', 'current')),
  account_number text not null check (account_number ~ '^[0-9]{7}$'),
  holder_kana    text not null check (char_length(holder_kana) between 1 and 30 and holder_kana ~ '^[ァ-ヶー　 ]+$'),
  updated_at     timestamptz not null default now()
);
create trigger bank_accounts_touch before update on public.bank_accounts for each row execute function public.touch_updated_at();
alter table public.bank_accounts enable row level security;
revoke all on public.bank_accounts from anon, authenticated;
grant select, delete on public.bank_accounts to authenticated;
grant insert (bank_name, branch_name, account_type, account_number, holder_kana) on public.bank_accounts to authenticated;
grant update (bank_name, branch_name, account_type, account_number, holder_kana) on public.bank_accounts to authenticated;
create policy bank_accounts_own on public.bank_accounts for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'seller' and p.status = 'active')
  );

-- -----------------------------------------------------------------------------
-- ledger_entries: 売上の台帳（残高＝合計）。書き足すだけ
-- -----------------------------------------------------------------------------
create table public.ledger_entries (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('sale', 'payout', 'payout_reversal', 'refund_clawback', 'adjustment')),
  amount     integer not null check (amount <> 0),
  order_id   uuid references public.orders (id) on delete set null,
  payout_id  uuid,
  note       text not null default '' check (char_length(note) <= 100),
  created_at timestamptz not null default now()
);
create index ledger_user_idx on public.ledger_entries (user_id, created_at desc, id desc);
create unique index ledger_sale_once on public.ledger_entries (order_id) where kind = 'sale';
alter table public.ledger_entries enable row level security;
revoke all on public.ledger_entries from anon, authenticated;
revoke update, delete, truncate on public.ledger_entries from service_role;
grant select on public.ledger_entries to authenticated;
create policy ledger_own_read on public.ledger_entries for select to authenticated using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- payouts: 振込申請。申請した時点で台帳から引く。却下なら戻す
-- -----------------------------------------------------------------------------
create table public.payouts (
  id             uuid primary key default gen_random_uuid(),
  payout_no      bigint generated always as identity (start with 101) unique,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  amount         integer not null check (amount > 0),
  fee            integer not null default 0 check (fee >= 0),
  net            integer not null check (net >= 0),
  bank_name      text not null,
  branch_name    text not null,
  account_type   text not null,
  account_number text not null,
  account_last4  text not null,
  holder_kana    text not null,
  status         text not null default 'requested' check (status in ('requested', 'paid', 'rejected')),
  reject_reason  text check (char_length(reject_reason) <= 200),
  requested_at   timestamptz not null default now(),
  decided_at     timestamptz,
  decided_by     uuid references auth.users (id) on delete set null,
  check (net = amount - fee)
);
create index payouts_user_idx on public.payouts (user_id, requested_at desc);
create index payouts_open_idx on public.payouts (requested_at) where status = 'requested';
alter table public.payouts enable row level security;
revoke all on public.payouts from anon, authenticated;
-- 口座番号の全桁は画面に渡さない（運営の振込作業は service_role で読む）
grant select (id, payout_no, user_id, amount, fee, net, bank_name, branch_name, account_type, account_last4, holder_kana,
              status, reject_reason, requested_at, decided_at)
  on public.payouts to authenticated;
create policy payouts_own_read on public.payouts for select to authenticated using (user_id = (select auth.uid()));

-- 自分の残高
create or replace function public.my_balance()
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(amount), 0)::integer from public.ledger_entries where user_id = (select auth.uid());
$$;
revoke all on function public.my_balance() from public, anon;
grant execute on function public.my_balance() to authenticated;

-- 自分の台帳（新しい順・行ごとの残高つき）
create or replace function public.my_ledger(p_limit integer default 50)
returns table (id bigint, kind text, amount integer, note text, order_id uuid, created_at timestamptz, balance bigint)
language sql
stable
set search_path = ''
as $$
  select e.id, e.kind, e.amount, e.note, e.order_id, e.created_at,
         sum(e.amount) over (order by e.created_at, e.id) as balance
  from public.ledger_entries e
  where e.user_id = (select auth.uid())
  order by e.created_at desc, e.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;
revoke all on function public.my_ledger(integer) from public, anon;
grant execute on function public.my_ledger(integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 買う: 支払い待ちの注文を作る（service_role だけ。サーバーがログイン・回数を確かめてから呼ぶ）
--   p_items: [{"listing_id": "...", "options": {...}}]（1〜10件）
--   p_address: {"name","postal","prefecture","address1","address2","phone"}
--   失敗は 'pantia:<理由>' の文で返す（サーバーが日本語にする）
-- -----------------------------------------------------------------------------
create or replace function public.create_checkout(p_buyer uuid, p_items jsonb, p_method text, p_address jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set     public.site_settings;
  v_me      public.profiles;
  v_group   uuid := gen_random_uuid();
  v_item    jsonb;
  v_l       public.listings;
  v_q       jsonb;
  v_total   integer := 0;
  v_ids     uuid[] := '{}';
  v_expires timestamptz;
  v_order   uuid;
  v_sub     integer;
  v_fee     integer;
  v_name    text := btrim(coalesce(p_address ->> 'name', ''));
  v_postal  text := btrim(coalesce(p_address ->> 'postal', ''));
  v_pref    text := btrim(coalesce(p_address ->> 'prefecture', ''));
  v_addr1   text := btrim(coalesce(p_address ->> 'address1', ''));
  v_addr2   text := btrim(coalesce(p_address ->> 'address2', ''));
  v_phone   text := regexp_replace(coalesce(p_address ->> 'phone', ''), '[^0-9]', '', 'g');
begin
  select * into v_set from public.site_settings where id;
  if v_set.maintenance then
    raise exception 'pantia:maintenance';
  end if;
  select * into v_me from public.profiles where id = p_buyer;
  if not found or v_me.status <> 'active' or v_me.role <> 'buyer' or v_me.kyc_status <> 'approved' then
    raise exception 'pantia:not_allowed' using errcode = '42501';
  end if;
  if p_method not in ('card', 'paypay', 'bank', 'mock') then
    raise exception 'pantia:bad_method' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 10 then
    raise exception 'pantia:bad_items' using errcode = '22023';
  end if;
  -- 支払い待ちを溜めて1点物を押さえ続ける使い方を止める
  if (select count(distinct o.group_id) from public.orders o where o.buyer_id = p_buyer and o.status = 'pending') >= 3 then
    raise exception 'pantia:too_many_pending';
  end if;
  if char_length(v_name) not between 1 and 30 or v_postal !~ '^[0-9]{3}-?[0-9]{4}$' or char_length(v_pref) not between 2 and 4
     or char_length(v_addr1) not between 1 and 100 or char_length(v_addr2) > 100 or v_phone !~ '^0[0-9]{9,10}$'
     or (v_name || v_pref || v_addr1 || v_addr2) ~ '[[:cntrl:]]' then
    raise exception 'pantia:bad_address' using errcode = '22023';
  end if;
  if v_postal !~ '-' then
    v_postal := substr(v_postal, 1, 3) || '-' || substr(v_postal, 4);
  end if;
  v_expires := now() + case when p_method = 'bank' then interval '72 hours' else interval '30 minutes' end;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(v_item ->> 'listing_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'pantia:bad_items' using errcode = '22023';
    end if;
    select * into v_l from public.listings where id = (v_item ->> 'listing_id')::uuid for update;
    if not found or v_l.status <> 'published' or v_l.seller_id = p_buyer
       or not public.seller_is_public(v_l.seller_id) or public.blocked_between(p_buyer, v_l.seller_id)
       or (v_l.followers_only and not exists (select 1 from public.follows f where f.follower_id = p_buyer and f.seller_id = v_l.seller_id)) then
      raise exception 'pantia:unavailable';
    end if;
    -- リクエスト専用: 出品者がメッセージで返事をしてから買える
    if v_l.request_only and not exists (
      select 1 from public.messages m join public.threads t on t.id = m.thread_id
      where t.seller_id = v_l.seller_id and t.buyer_id = p_buyer and m.sender_id = v_l.seller_id and m.status = 'visible'
    ) then
      raise exception 'pantia:request_only';
    end if;
    v_q := public.listing_quote(v_l, v_item -> 'options', v_set.video_fee, v_set.extend_fee_per_day, v_set.anonymous_fee);
    v_sub := (v_q ->> 'subtotal')::integer;
    v_fee := round(v_sub * v_set.fee_rate)::integer;
    begin
      insert into public.orders (
        group_id, buyer_id, seller_id, listing_id, title, category, image_path, base_price, worn_days, worn_surcharge,
        options, video_fee, anonymous_fee, subtotal, total, fee_rate, fee, seller_net, anonymous, single_stock,
        payment_method, expires_at
      ) values (
        v_group, p_buyer, v_l.seller_id, v_l.id, v_l.title, v_l.category, v_l.image_paths[1], v_l.price,
        (v_q ->> 'worn_days')::smallint, (v_q ->> 'worn_surcharge')::integer,
        jsonb_build_object('worn_days', v_q -> 'worn_days', 'photo', v_q -> 'photo', 'letter', v_q -> 'letter',
                           'anonymous', v_q -> 'anonymous', 'video', v_q -> 'video'),
        (v_q ->> 'video_fee')::integer, (v_q ->> 'anonymous_fee')::integer, v_sub, (v_q ->> 'total')::integer,
        v_set.fee_rate, v_fee, v_sub - v_fee, (v_q ->> 'anonymous')::boolean, v_l.stock_mode = 'single',
        p_method, v_expires
      ) returning id into v_order;
    exception when unique_violation then
      raise exception 'pantia:reserved';
    end;
    insert into public.order_addresses (order_id, buyer_id, name, postal, prefecture, address1, address2, phone)
    values (v_order, p_buyer, v_name, v_postal, v_pref, v_addr1, v_addr2, v_phone);
    v_total := v_total + (v_q ->> 'total')::integer;
    v_ids := v_ids || v_order;
  end loop;

  return jsonb_build_object('group_id', v_group, 'total', v_total, 'order_ids', to_jsonb(v_ids), 'expires_at', v_expires);
end;
$$;
revoke all on function public.create_checkout(uuid, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_checkout(uuid, jsonb, text, jsonb) to service_role;

-- 決済会社の番号（Checkout の id・PayPay の支払い番号など）を注文に結ぶ
create or replace function public.attach_payment_ref(p_group uuid, p_ref text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.orders set payment_ref = left(p_ref, 200) where group_id = p_group and status = 'pending';
$$;
revoke all on function public.attach_payment_ref(uuid, text) from public, anon, authenticated;
grant execute on function public.attach_payment_ref(uuid, text) to service_role;

-- -----------------------------------------------------------------------------
-- 入金の確定（service_role だけ）。何度呼ばれても1回分だけ効く
--   戻り値: paid / already / revived（期限切れのあとに払われ、まだ売れていなかったので生き返らせた）
--          / refund_needed（期限切れのあとに払われ、もう売れていた。返金が要る）/ amount_mismatch / not_found
-- -----------------------------------------------------------------------------
create or replace function public.mark_group_paid(p_group uuid, p_ref text, p_amount integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sum    integer;
  v_o      public.orders;
  v_result text := 'paid';
  v_free   boolean;
begin
  perform 1 from public.orders where group_id = p_group for update;
  if not found then
    return 'not_found';
  end if;
  select sum(total) into v_sum from public.orders where group_id = p_group;
  if p_amount is distinct from v_sum then
    perform public.audit(null, 'payment.amount_mismatch', 'order_group', p_group::text,
      jsonb_build_object('expected', v_sum, 'received', p_amount));
    return 'amount_mismatch';
  end if;
  if not exists (select 1 from public.orders where group_id = p_group and (status = 'pending' or (status = 'cancelled' and paid_at is null and not needs_refund and refunded_at is null))) then
    return 'already';
  end if;

  for v_o in
    select * from public.orders
    where group_id = p_group and (status = 'pending' or (status = 'cancelled' and paid_at is null and not needs_refund and refunded_at is null))
    order by order_no
  loop
    if v_o.status = 'cancelled' then
      v_free := v_o.cancel_reason = 'expired'
        and exists (select 1 from public.listings l where l.id = v_o.listing_id and l.status in ('published', 'private'))
        and (not v_o.single_stock or not exists (
              select 1 from public.orders o2
              where o2.listing_id = v_o.listing_id and o2.single_stock and o2.status <> 'cancelled' and o2.id <> v_o.id));
      if not v_free then
        update public.orders set needs_refund = true, payment_ref = coalesce(left(p_ref, 200), payment_ref) where id = v_o.id;
        perform public.audit(null, 'payment.late_refund_needed', 'order', v_o.id::text, jsonb_build_object('order_no', v_o.order_no));
        v_result := 'refund_needed';
        continue;
      end if;
      if v_result = 'paid' then
        v_result := 'revived';
      end if;
    end if;

    update public.orders
    set status = 'paid', paid_at = now(), cancelled_at = null, cancel_reason = null,
        payment_ref = coalesce(left(p_ref, 200), payment_ref)
    where id = v_o.id;
    update public.listings
    set sales_count = sales_count + 1, status = case when v_o.single_stock then 'sold' else status end
    where id = v_o.listing_id;
    update public.profiles set purchase_count = purchase_count + 1 where id = v_o.buyer_id;
    delete from public.cart_items where user_id = v_o.buyer_id and listing_id = v_o.listing_id;
    perform public.notify(v_o.seller_id, 'order', '新しい注文が入りました', '注文 #' || v_o.order_no || '　' || v_o.title,
      '/orders/' || v_o.id::text);
    perform public.notify(v_o.buyer_id, 'order', 'お支払いが完了しました', '注文 #' || v_o.order_no || '　' || v_o.title,
      '/orders/' || v_o.id::text);
    perform public.post_system_message(v_o.seller_id, v_o.buyer_id, 'system',
      '💳 注文 #' || v_o.order_no || ' の決済が完了しました', v_o.id, v_o.listing_id);
    perform public.audit(v_o.buyer_id, 'order.paid', 'order', v_o.id::text,
      jsonb_build_object('order_no', v_o.order_no, 'total', v_o.total, 'method', v_o.payment_method));
  end loop;
  return v_result;
end;
$$;
revoke all on function public.mark_group_paid(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.mark_group_paid(uuid, text, integer) to service_role;

-- 返金が済んだ印（service_role だけ。返金の API が通ったあとに呼ぶ）
create or replace function public.mark_refunded(p_order uuid, p_ref text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.orders set needs_refund = false, refunded_at = now(), refund_ref = left(p_ref, 200)
  where id = p_order and needs_refund;
$$;
revoke all on function public.mark_refunded(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_refunded(uuid, text) to service_role;

-- 取引完了の中身（台帳に売上を足す・出品者の販売数）。呼ぶ関数が状態を確かめてから使う
create or replace function public.finish_order(p_order uuid, p_auto boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
begin
  update public.orders set status = 'completed', completed_at = now(), auto_completed = p_auto
  where id = p_order and status = 'shipped'
  returning * into v_o;
  if not found then
    raise exception 'pantia:bad_state';
  end if;
  insert into public.ledger_entries (user_id, kind, amount, order_id, note)
  values (v_o.seller_id, 'sale', v_o.seller_net, v_o.id, left(v_o.title || ' 販売', 100));
  update public.profiles set sales_count = sales_count + 1 where id = v_o.seller_id;
  perform public.audit(case when p_auto then null else v_o.buyer_id end, 'order.complete', 'order', v_o.id::text,
    jsonb_build_object('order_no', v_o.order_no, 'auto', p_auto, 'seller_net', v_o.seller_net));
  perform public.notify(v_o.seller_id, 'order', '取引が完了しました',
    '注文 #' || v_o.order_no || ' の売上 ¥' || v_o.seller_net || ' が残高に入りました。', '/mypage/sales');
  if p_auto then
    perform public.notify(v_o.buyer_id, 'order', '取引が自動で完了しました',
      '注文 #' || v_o.order_no || '。レビューをお願いします。', '/orders/' || v_o.id::text);
  end if;
end;
$$;
revoke all on function public.finish_order(uuid, boolean) from public, anon, authenticated;

-- 出品者: 発送の準備に入る
create or replace function public.prepare_order(p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
begin
  if not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.status = 'active') then
    raise exception 'pantia:not_allowed' using errcode = '42501';
  end if;
  update public.orders set status = 'preparing', preparing_at = now()
  where id = p_order and seller_id = (select auth.uid()) and status = 'paid'
  returning * into v_o;
  if not found then
    raise exception 'pantia:bad_state';
  end if;
  perform public.notify(v_o.buyer_id, 'order', '発送の準備に入りました', '注文 #' || v_o.order_no || '　' || v_o.title,
    '/orders/' || v_o.id::text);
end;
$$;
revoke all on function public.prepare_order(uuid) from public, anon;
grant execute on function public.prepare_order(uuid) to authenticated;

-- 出品者: 発送した（運送会社・追跡番号）。チャットに発送の知らせを残す
create or replace function public.ship_order(p_order uuid, p_carrier text, p_tracking text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o        public.orders;
  v_tracking text := upper(btrim(coalesce(p_tracking, '')));
  v_carrier  text := case p_carrier when 'yamato' then 'ヤマト運輸' when 'sagawa' then '佐川急便'
                                    when 'japanpost' then '日本郵便' else 'その他' end;
begin
  if not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.status = 'active') then
    raise exception 'pantia:not_allowed' using errcode = '42501';
  end if;
  if p_carrier not in ('yamato', 'sagawa', 'japanpost', 'other') or v_tracking !~ '^[0-9A-Z-]{4,30}$' then
    raise exception 'pantia:bad_tracking' using errcode = '22023';
  end if;
  update public.orders set status = 'shipped', shipped_at = now(), carrier = p_carrier, tracking_no = v_tracking
  where id = p_order and seller_id = (select auth.uid()) and status in ('paid', 'preparing')
  returning * into v_o;
  if not found then
    raise exception 'pantia:bad_state';
  end if;
  perform public.post_system_message(v_o.seller_id, v_o.buyer_id, 'shipping',
    '発送完了しました📦 ' || v_carrier || ' 追跡番号：' || v_tracking
      || case when v_o.anonymous then '　匿名配送のため、出品者欄は「代行センター」と表示されます。' else '' end,
    v_o.id, v_o.listing_id);
  perform public.notify(v_o.buyer_id, 'order', '商品が発送されました', '注文 #' || v_o.order_no || '　' || v_o.title,
    '/orders/' || v_o.id::text);
end;
$$;
revoke all on function public.ship_order(uuid, text, text) from public, anon;
grant execute on function public.ship_order(uuid, text, text) to authenticated;

-- 購入者: 受け取った（取引完了）
create or replace function public.complete_order(p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.orders o
    where o.id = p_order and o.buyer_id = (select auth.uid()) and o.status = 'shipped'
  ) then
    raise exception 'pantia:bad_state';
  end if;
  perform public.finish_order(p_order, false);
end;
$$;
revoke all on function public.complete_order(uuid) from public, anon;
grant execute on function public.complete_order(uuid) to authenticated;

-- 出品者: 発送前に取り消す（出品者の都合＝全額返金。規約 9）。返金はサーバーが行い mark_refunded を呼ぶ
create or replace function public.seller_cancel_order(p_order uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
begin
  if char_length(btrim(coalesce(p_reason, ''))) not between 1 and 200 then
    raise exception 'pantia:bad_reason' using errcode = '22023';
  end if;
  update public.orders
  set status = 'cancelled', cancelled_at = now(), cancel_reason = btrim(p_reason), needs_refund = true
  where id = p_order and seller_id = (select auth.uid()) and status in ('paid', 'preparing')
  returning * into v_o;
  if not found then
    raise exception 'pantia:bad_state';
  end if;
  update public.listings set sales_count = greatest(sales_count - 1, 0),
         status = case when status = 'sold' then 'private' else status end
  where id = v_o.listing_id;
  update public.profiles set purchase_count = greatest(purchase_count - 1, 0) where id = v_o.buyer_id;
  perform public.notify(v_o.buyer_id, 'order', '注文がキャンセルされました',
    '注文 #' || v_o.order_no || ' は出品者の都合でキャンセルされました。代金は全額返金します。', '/orders/' || v_o.id::text);
  perform public.post_system_message(v_o.seller_id, v_o.buyer_id, 'system',
    '注文 #' || v_o.order_no || ' は出品者の都合でキャンセルされました（全額返金）', v_o.id, v_o.listing_id);
  perform public.audit(v_o.seller_id, 'order.seller_cancel', 'order', v_o.id::text,
    jsonb_build_object('order_no', v_o.order_no, 'reason', left(btrim(p_reason), 200)));
end;
$$;
revoke all on function public.seller_cancel_order(uuid, text) from public, anon;
grant execute on function public.seller_cancel_order(uuid, text) to authenticated;

-- 支払い期限を過ぎた注文を取り消す（cron。service_role だけ）。取り消した注文の決済番号を返す（決済会社側も取り消すため）
create or replace function public.cancel_expired_orders()
returns table (order_id uuid, group_id uuid, payment_method text, payment_ref text)
language sql
security definer
set search_path = ''
as $$
  update public.orders o
  set status = 'cancelled', cancelled_at = now(), cancel_reason = 'expired'
  where o.status = 'pending' and o.expires_at < now()
  returning o.id, o.group_id, o.payment_method, o.payment_ref;
$$;
revoke all on function public.cancel_expired_orders() from public, anon, authenticated;
grant execute on function public.cancel_expired_orders() to service_role;

-- 発送から決まった日数がたった注文を自動で完了にする（cron。service_role だけ）
create or replace function public.auto_complete_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer;
  v_id   uuid;
  v_n    integer := 0;
begin
  select auto_complete_days into v_days from public.site_settings where id;
  for v_id in
    select o.id from public.orders o
    where o.status = 'shipped' and o.shipped_at < now() - make_interval(days => v_days)
    order by o.shipped_at
    limit 500
  loop
    perform public.finish_order(v_id, true);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.auto_complete_orders() from public, anon, authenticated;
grant execute on function public.auto_complete_orders() to service_role;

-- -----------------------------------------------------------------------------
-- レビューを書く（購入者・取引完了の注文に1回）
-- -----------------------------------------------------------------------------
create or replace function public.post_review(p_order uuid, p_rating integer, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o  public.orders;
  v_id uuid;
begin
  if p_rating not between 1 and 5 or char_length(coalesce(p_body, '')) > 500 then
    raise exception 'pantia:bad_review' using errcode = '22023';
  end if;
  select * into v_o from public.orders
  where id = p_order and buyer_id = (select auth.uid()) and status = 'completed';
  if not found or not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.status = 'active') then
    raise exception 'pantia:bad_state';
  end if;
  begin
    insert into public.reviews (order_id, seller_id, buyer_id, listing_id, title, category, rating, body)
    values (v_o.id, v_o.seller_id, v_o.buyer_id, v_o.listing_id, v_o.title, v_o.category, p_rating, btrim(coalesce(p_body, '')))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'pantia:already_reviewed';
  end;
  update public.profiles set rating_sum = rating_sum + p_rating, rating_count = rating_count + 1 where id = v_o.seller_id;
  perform public.notify(v_o.seller_id, 'review', 'レビューが届きました', '★' || p_rating || '　' || v_o.title,
    '/sellers/' || v_o.seller_id::text);
  perform public.audit(v_o.buyer_id, 'review.post', 'review', v_id::text, jsonb_build_object('order_no', v_o.order_no, 'rating', p_rating));
  return v_id;
end;
$$;
revoke all on function public.post_review(uuid, integer, text) from public, anon;
grant execute on function public.post_review(uuid, integer, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 振込申請（出品者・本人確認済み・口座あり・最低額以上・残高以内・申請中は1件まで）
-- -----------------------------------------------------------------------------
create or replace function public.request_payout(p_amount integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_set     public.site_settings;
  v_bank    public.bank_accounts;
  v_balance integer;
  v_id      uuid;
begin
  if v_uid is null or not exists (
    select 1 from public.profiles p
    where p.id = v_uid and p.role = 'seller' and p.status = 'active' and p.kyc_status = 'approved'
  ) then
    raise exception 'pantia:not_allowed' using errcode = '42501';
  end if;
  -- 同じ人の申請を1本ずつ通す（残高の二重引きを止める）
  perform pg_advisory_xact_lock(hashtext('pantia.payout:' || v_uid::text));
  select * into v_set from public.site_settings where id;
  select * into v_bank from public.bank_accounts where user_id = v_uid;
  if not found then
    raise exception 'pantia:no_bank';
  end if;
  if exists (select 1 from public.payouts where user_id = v_uid and status = 'requested') then
    raise exception 'pantia:payout_open';
  end if;
  select coalesce(sum(amount), 0) into v_balance from public.ledger_entries where user_id = v_uid;
  if p_amount is null or p_amount < v_set.min_payout or p_amount <= v_set.payout_fee then
    raise exception 'pantia:below_min';
  end if;
  if p_amount > v_balance then
    raise exception 'pantia:over_balance';
  end if;
  insert into public.payouts (user_id, amount, fee, net, bank_name, branch_name, account_type, account_number, account_last4, holder_kana)
  values (v_uid, p_amount, v_set.payout_fee, p_amount - v_set.payout_fee, v_bank.bank_name, v_bank.branch_name,
          v_bank.account_type, v_bank.account_number, right(v_bank.account_number, 4), v_bank.holder_kana)
  returning id into v_id;
  insert into public.ledger_entries (user_id, kind, amount, payout_id, note)
  values (v_uid, 'payout', -p_amount, v_id, left('振込申請（' || v_bank.bank_name || '）', 100));
  perform public.audit(v_uid, 'payout.request', 'payout', v_id::text, jsonb_build_object('amount', p_amount));
  return v_id;
end;
$$;
revoke all on function public.request_payout(integer) from public, anon;
grant execute on function public.request_payout(integer) to authenticated;
