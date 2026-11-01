-- =============================================================================
-- 0011 transfer_paid_options — 銀行振込（運営の口座へ振り込み、運営が入金を確かめる）と、出品者が決める有料オプション
-- -----------------------------------------------------------------------------
-- 決まり
--   ・値段は今までどおり DB で出品から計算し直す。有料オプションも、出品に載っている物と料金だけを使う
--   ・振込先の口座は site_settings に置き、画面の利用者には列の権限を渡さない（サーバーが service_role で読む）
--   ・振込の注文は、振込名義の番号（英字1字＋数字5桁・重ならない）を group ごとに1つ作る
--   ・入金の確定は管理画面から admin_confirm_transfer だけ。金額が合わなければ確定しない（mark_group_paid と同じ）
--   ・振込の返金は手で行い、済んだら admin_mark_refunded_manual で印を付ける
--   ・監査ログに口座番号を残さない（変えたことだけ残す）
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 有料オプション（出品者が名前と料金を決める）
--   [{"id":"a1b2c3","name":"着用写真集","price":1500}]。10件まで、1件100〜50,000円の100円単位
-- -----------------------------------------------------------------------------
create or replace function public.paid_options_ok(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_e     jsonb;
  v_ids   text[] := '{}';
  v_id    text;
  v_name  text;
  v_price text;
begin
  if p is null or jsonb_typeof(p) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(p) > 10 then
    return false;
  end if;
  for v_e in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(v_e) <> 'object' then
      return false;
    end if;
    -- 決まった3つのキーだけ（NULL のまま比べると IF が素通りするので coalesce で潰す）
    if (select count(*) from jsonb_object_keys(v_e)) <> 3
       or coalesce(jsonb_typeof(v_e -> 'id'), '') <> 'string'
       or coalesce(jsonb_typeof(v_e -> 'name'), '') <> 'string'
       or coalesce(jsonb_typeof(v_e -> 'price'), '') <> 'number' then
      return false;
    end if;
    v_id := v_e ->> 'id';
    v_name := v_e ->> 'name';
    v_price := v_e ->> 'price';
    if v_id !~ '^[a-z0-9]{1,12}$' or v_id = any (v_ids) then
      return false;
    end if;
    if v_name <> btrim(v_name) or char_length(v_name) not between 1 and 30 or v_name ~ '[[:cntrl:]]' then
      return false;
    end if;
    if v_price !~ '^[0-9]{3,5}$' then
      return false;
    end if;
    if v_price::integer not between 100 and 50000 or v_price::integer % 100 <> 0 then
      return false;
    end if;
    v_ids := v_ids || v_id;
  end loop;
  return true;
end;
$$;
revoke all on function public.paid_options_ok(jsonb) from public;
grant execute on function public.paid_options_ok(jsonb) to anon, authenticated, service_role;

alter table public.listings
  add column paid_options jsonb not null default '[]'::jsonb
  constraint listings_paid_options_ok check (public.paid_options_ok(paid_options));
grant insert (paid_options) on public.listings to authenticated;
grant update (paid_options) on public.listings to authenticated;

-- -----------------------------------------------------------------------------
-- 2. 注文: 有料オプションの合計（subtotal に含める）と、支払い方法の「transfer」（運営の口座への振込）
-- -----------------------------------------------------------------------------
alter table public.orders add column extras_fee integer not null default 0 check (extras_fee >= 0);
grant select (extras_fee) on public.orders to authenticated;
alter table public.orders drop constraint orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method in ('card', 'paypay', 'bank', 'transfer', 'mock'));

-- -----------------------------------------------------------------------------
-- 3. 振込先（運営の口座）。社長が管理画面で入れる。受付をオンにするなら全部が要る
--   画面の利用者には列の権限を渡さない（振込の画面はサーバーが service_role で読んで出す）
-- -----------------------------------------------------------------------------
alter table public.site_settings
  add column transfer_enabled boolean not null default false,
  add column transfer_bank    text not null default '' check (char_length(transfer_bank) <= 30),
  add column transfer_branch  text not null default '' check (char_length(transfer_branch) <= 30),
  add column transfer_type    text not null default 'ordinary' check (transfer_type in ('ordinary', 'checking')),
  add column transfer_number  text not null default '' check (transfer_number = '' or transfer_number ~ '^[0-9]{7}$'),
  add column transfer_holder  text not null default '' check (char_length(transfer_holder) <= 40);
alter table public.site_settings
  add constraint site_settings_transfer_text_ok
    check ((transfer_bank || transfer_branch || transfer_holder) !~ '[[:cntrl:]]'),
  add constraint site_settings_transfer_ready
    check (not transfer_enabled or (transfer_bank <> '' and transfer_branch <> '' and transfer_number <> '' and transfer_holder <> ''));

-- -----------------------------------------------------------------------------
-- 4. bank_transfers: 振込の注文ごと（group ごと）に1行。振込名義の番号と請求額
--   購入者は自分の分だけ読める。書くのは関数だけ（service_role にも直に書かせない）
-- -----------------------------------------------------------------------------
create table public.bank_transfers (
  group_id        uuid primary key,
  code            text not null unique check (code ~ '^[A-HJ-NP-Z][0-9]{5}$'),
  buyer_id        uuid not null references public.profiles (id),
  amount          integer not null check (amount > 0),
  created_at      timestamptz not null default now(),
  confirmed_at    timestamptz,
  confirmed_by    uuid references auth.users (id) on delete set null,
  received_amount integer check (received_amount > 0)
);
create index bank_transfers_open_idx on public.bank_transfers (created_at) where confirmed_at is null;
create index bank_transfers_buyer_idx on public.bank_transfers (buyer_id, created_at desc);
alter table public.bank_transfers enable row level security;
revoke all on public.bank_transfers from anon, authenticated;
revoke insert, update, delete, truncate on public.bank_transfers from service_role;
grant select (group_id, code, buyer_id, amount, created_at, confirmed_at) on public.bank_transfers to authenticated;
create policy bank_transfers_own_read on public.bank_transfers for select to authenticated
  using (buyer_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- 5. 値段の計算: 有料オプション（extras = 選んだ id の並び）を足す
--   出品に無い id・重なり・11件以上は 22023。写しは出品に載っている順で返す
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
  v_xsel   jsonb := case when coalesce(jsonb_typeof(v_opts -> 'extras'), 'null') = 'null' then '[]'::jsonb else v_opts -> 'extras' end;
  v_extras jsonb;
  v_xfee   integer;
  v_xcount integer;
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
  -- 有料オプション（並びか → 件数 → 中身が文字か → 重なり、の順に別々に確かめる。評価の順に頼らない）
  if jsonb_typeof(v_xsel) <> 'array' then
    raise exception 'pantia:bad_options' using errcode = '22023';
  end if;
  if jsonb_array_length(v_xsel) > 10 then
    raise exception 'pantia:bad_options' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v_xsel) x where jsonb_typeof(x) <> 'string') then
    raise exception 'pantia:bad_options' using errcode = '22023';
  end if;
  if (select count(distinct x) from jsonb_array_elements_text(v_xsel) x) <> jsonb_array_length(v_xsel) then
    raise exception 'pantia:bad_options' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', t.e ->> 'id', 'name', t.e ->> 'name', 'price', (t.e ->> 'price')::integer) order by t.n), '[]'::jsonb),
         coalesce(sum((t.e ->> 'price')::integer), 0)::integer,
         count(*)::integer
    into v_extras, v_xfee, v_xcount
  from jsonb_array_elements(coalesce(p_listing.paid_options, '[]'::jsonb)) with ordinality as t(e, n)
  where (t.e ->> 'id') in (select jsonb_array_elements_text(v_xsel));
  if v_xcount <> jsonb_array_length(v_xsel) then
    raise exception 'pantia:bad_options' using errcode = '22023';
  end if;
  if v_video then v_vfee := p_video_fee; end if;
  if v_anon then v_afee := p_anonymous_fee; end if;
  v_sub := p_listing.price + v_sur + v_vfee + v_xfee;
  return jsonb_build_object(
    'worn_days', v_days, 'photo', v_photo, 'letter', v_letter, 'anonymous', v_anon, 'video', v_video,
    'base_price', p_listing.price, 'worn_surcharge', v_sur, 'video_fee', v_vfee, 'anonymous_fee', v_afee,
    'extras', v_extras, 'extras_fee', v_xfee,
    'subtotal', v_sub, 'total', v_sub + v_afee
  );
end;
$$;
revoke all on function public.listing_quote(public.listings, jsonb, integer, integer, integer) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. 買う: transfer を受ける（受付がオンのときだけ）。振込の期限は bank と同じ72時間
--   transfer なら振込名義の番号を作り、購入者に振込の案内を送る（商品名は載せない）
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
  v_code    text;
  v_try     integer;
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
  if p_method is null or p_method not in ('card', 'paypay', 'bank', 'transfer', 'mock') then
    raise exception 'pantia:bad_method' using errcode = '22023';
  end if;
  if p_method = 'transfer' and not v_set.transfer_enabled then
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
  v_expires := now() + case when p_method in ('bank', 'transfer') then interval '72 hours' else interval '30 minutes' end;

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
        options, video_fee, anonymous_fee, extras_fee, subtotal, total, fee_rate, fee, seller_net, anonymous, single_stock,
        payment_method, expires_at
      ) values (
        v_group, p_buyer, v_l.seller_id, v_l.id, v_l.title, v_l.category, v_l.image_paths[1], v_l.price,
        (v_q ->> 'worn_days')::smallint, (v_q ->> 'worn_surcharge')::integer,
        jsonb_build_object('worn_days', v_q -> 'worn_days', 'photo', v_q -> 'photo', 'letter', v_q -> 'letter',
                           'anonymous', v_q -> 'anonymous', 'video', v_q -> 'video', 'extras', v_q -> 'extras'),
        (v_q ->> 'video_fee')::integer, (v_q ->> 'anonymous_fee')::integer, (v_q ->> 'extras_fee')::integer,
        v_sub, (v_q ->> 'total')::integer,
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

  if p_method = 'transfer' then
    -- 振込名義の番号（I と O は数字と見間違えるので使わない）。重なったら作り直す
    for v_try in 1..20 loop
      v_code := substr('ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + floor(random() * 24)::integer, 1)
                || lpad(floor(random() * 100000)::integer::text, 5, '0');
      begin
        insert into public.bank_transfers (group_id, code, buyer_id, amount) values (v_group, v_code, p_buyer, v_total);
        exit;
      exception when unique_violation then
        v_code := null;
      end;
    end loop;
    if v_code is null then
      raise exception 'pantia:busy';
    end if;
    update public.orders set payment_ref = 'transfer:' || v_code where group_id = v_group;
    perform public.notify(p_buyer, 'order',
      'お振込のご案内（' || to_char(v_expires at time zone 'Asia/Tokyo', 'MM/DD HH24:MI') || ' まで）',
      '振込名義：' || v_code || '＋お名前（例：' || v_code || ' ヤマダタロウ）' || chr(10)
      || '金額：' || to_char(v_total, 'FM999,999,999') || '円' || chr(10)
      || '振込先：' || v_set.transfer_bank || ' ' || v_set.transfer_branch || ' '
      || case v_set.transfer_type when 'checking' then '当座' else '普通' end || ' ' || v_set.transfer_number || ' ' || v_set.transfer_holder
      || chr(10) || '期限までにお振込が確認できないと、注文は取り消されます。',
      '/checkout/transfer?group=' || v_group::text);
  end if;

  return jsonb_build_object('group_id', v_group, 'total', v_total, 'order_ids', to_jsonb(v_ids), 'expires_at', v_expires,
                            'transfer_code', v_code);
end;
$$;
revoke all on function public.create_checkout(uuid, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_checkout(uuid, jsonb, text, jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- 7. 入金の確定: 振込なら出品者へ「入金が確認できました。発送してください」
--   ほかは 0004 と同じ（金額違い・期限切れのあとの入金・何度呼ばれても1回分）
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
    if v_o.payment_method = 'transfer' then
      perform public.notify(v_o.seller_id, 'order', '入金が確認できました。発送してください', '注文 #' || v_o.order_no || '　' || v_o.title,
        '/orders/' || v_o.id::text);
      perform public.notify(v_o.buyer_id, 'order', 'お振込を確認しました', '注文 #' || v_o.order_no || '　' || v_o.title,
        '/orders/' || v_o.id::text);
      perform public.post_system_message(v_o.seller_id, v_o.buyer_id, 'system',
        '🏦 注文 #' || v_o.order_no || ' の入金を確認しました', v_o.id, v_o.listing_id);
    else
      perform public.notify(v_o.seller_id, 'order', '新しい注文が入りました', '注文 #' || v_o.order_no || '　' || v_o.title,
        '/orders/' || v_o.id::text);
      perform public.notify(v_o.buyer_id, 'order', 'お支払いが完了しました', '注文 #' || v_o.order_no || '　' || v_o.title,
        '/orders/' || v_o.id::text);
      perform public.post_system_message(v_o.seller_id, v_o.buyer_id, 'system',
        '💳 注文 #' || v_o.order_no || ' の決済が完了しました', v_o.id, v_o.listing_id);
    end if;
    perform public.audit(v_o.buyer_id, 'order.paid', 'order', v_o.id::text,
      jsonb_build_object('order_no', v_o.order_no, 'total', v_o.total, 'method', v_o.payment_method));
  end loop;
  return v_result;
end;
$$;
revoke all on function public.mark_group_paid(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.mark_group_paid(uuid, text, integer) to service_role;

-- -----------------------------------------------------------------------------
-- 8. 管理画面: 振込の入金を確かめる（入金額を入れる）。金額が違えば確定せず、請求額を返す
--   戻り値 {"result": paid|revived|refund_needed|amount_mismatch|already, "expected": 請求額}
--   金額違いでも例外にしない（mark_group_paid が残した監査ログを巻き戻さないため）
-- -----------------------------------------------------------------------------
create or replace function public.admin_confirm_transfer(p_admin uuid, p_group uuid, p_amount integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t   public.bank_transfers;
  v_res text;
begin
  perform public.assert_admin(p_admin);
  if p_amount is null or p_amount not between 1 and 100000000 then
    raise exception 'pantia:bad_amount' using errcode = '22023';
  end if;
  select * into v_t from public.bank_transfers where group_id = p_group for update;
  if not found then
    raise exception 'pantia:not_found';
  end if;
  if v_t.confirmed_at is not null then
    return jsonb_build_object('result', 'already', 'expected', v_t.amount);
  end if;
  v_res := public.mark_group_paid(p_group, 'transfer:' || v_t.code, p_amount);
  if v_res in ('paid', 'revived', 'refund_needed', 'already') then
    update public.bank_transfers
    set confirmed_at = now(), confirmed_by = p_admin, received_amount = p_amount
    where group_id = p_group;
  end if;
  perform public.audit(p_admin, 'transfer.confirm', 'order_group', p_group::text,
    jsonb_build_object('code', v_t.code, 'expected', v_t.amount, 'received', p_amount, 'result', v_res));
  return jsonb_build_object('result', v_res, 'expected', v_t.amount);
end;
$$;
revoke all on function public.admin_confirm_transfer(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.admin_confirm_transfer(uuid, uuid, integer) to service_role;

-- 振込の返金を手で済ませたあとの印（振込の注文で「返金が要る」ものだけ）
create or replace function public.admin_mark_refunded_manual(p_admin uuid, p_order uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := btrim(coalesce(p_note, ''));
  v_no   bigint;
  v_buyer uuid;
begin
  perform public.assert_admin(p_admin);
  if char_length(v_note) > 100 or v_note ~ '[[:cntrl:]]' then
    raise exception 'pantia:bad_request' using errcode = '22023';
  end if;
  update public.orders
  set needs_refund = false, refunded_at = now(), refund_ref = left('manual:' || v_note, 200)
  where id = p_order and payment_method = 'transfer' and needs_refund and refunded_at is null
  returning order_no, buyer_id into v_no, v_buyer;
  if not found then
    raise exception 'pantia:bad_state';
  end if;
  perform public.notify(v_buyer, 'order', 'ご返金の振込が済みました', '注文 #' || v_no, '/orders/' || p_order::text);
  perform public.audit(p_admin, 'order.refund_manual', 'order', p_order::text,
    jsonb_build_object('order_no', v_no, 'note', v_note));
end;
$$;
revoke all on function public.admin_mark_refunded_manual(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_mark_refunded_manual(uuid, uuid, text) to service_role;

-- -----------------------------------------------------------------------------
-- 9. 商品ページの「取引中」: 見える1点物に、支払い待ちの注文があるか（誰の注文かは返さない）
-- -----------------------------------------------------------------------------
create or replace function public.listing_reserved(p_listing uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.listings l
    join public.orders o on o.listing_id = l.id and o.single_stock and o.status = 'pending'
    where l.id = p_listing and l.status = 'published'
      and public.seller_is_public(l.seller_id)
      and (not l.followers_only or public.is_following(l.seller_id))
      and not public.is_blocked_with(l.seller_id)
  );
$$;
revoke all on function public.listing_reserved(uuid) from public;
grant execute on function public.listing_reserved(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 10. 管理画面: サイト設定に振込先を足す。監査ログには口座番号を残さない
-- -----------------------------------------------------------------------------
create or replace function public.admin_update_settings(p_admin uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_cur public.site_settings;
  v_log jsonb;
begin
  perform public.assert_admin(p_admin);
  if jsonb_typeof(p_patch) <> 'object' then
    raise exception 'pantia:bad_request' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('fee_rate', 'anonymous_fee', 'min_payout', 'payout_fee', 'auto_complete_days', 'video_fee', 'extend_fee_per_day',
                     'registration_open', 'maintenance', 'notice', 'mail_order', 'mail_kyc', 'mail_payout', 'mod_spam_filter',
                     'forwarding_address', 'transfer_enabled', 'transfer_bank', 'transfer_branch', 'transfer_type',
                     'transfer_number', 'transfer_holder') then
      raise exception 'pantia:bad_request' using errcode = '22023';
    end if;
  end loop;
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
    forwarding_address = coalesce(p_patch ->> 'forwarding_address', s.forwarding_address),
    transfer_enabled   = coalesce((p_patch ->> 'transfer_enabled')::boolean, s.transfer_enabled),
    transfer_bank      = coalesce(p_patch ->> 'transfer_bank', s.transfer_bank),
    transfer_branch    = coalesce(p_patch ->> 'transfer_branch', s.transfer_branch),
    transfer_type      = coalesce(p_patch ->> 'transfer_type', s.transfer_type),
    transfer_number    = coalesce(p_patch ->> 'transfer_number', s.transfer_number),
    transfer_holder    = coalesce(p_patch ->> 'transfer_holder', s.transfer_holder),
    updated_by         = p_admin
  where s.id;
  v_log := p_patch - 'transfer_number';
  if p_patch ? 'transfer_number' then
    v_log := v_log || jsonb_build_object('transfer_number', 'changed');
  end if;
  perform public.audit(p_admin, 'settings.update', 'settings', 'site', v_log);
end;
$$;
revoke all on function public.admin_update_settings(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_update_settings(uuid, jsonb) to service_role;
