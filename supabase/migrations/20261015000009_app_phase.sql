-- =============================================================================
-- 0009 app_phase — 画面を作る段で見つかった、DB 側の足りない所
-- -----------------------------------------------------------------------------
--   1. 新規登録の受付停止（site_settings.registration_open = false）を DB でも止める
--      画面（server action）でも先に確かめるが、Supabase Auth の API を直に呼ばれると画面を通らない。
--      Google・X のログインで初めて来た人も、ここで止まる。
--      止まると Auth は「Database error saving new user」を返す。画面は先に確かめて、わかる文を出す。
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_nick text := btrim(regexp_replace(coalesce(v_meta ->> 'nickname', ''), '[[:cntrl:]]', '', 'g'));
  v_role text := coalesce(v_meta ->> 'role', 'buyer');
  v_age  smallint;
  v_job  text := btrim(regexp_replace(coalesce(v_meta ->> 'occupation', ''), '[[:cntrl:]]', '', 'g'));
begin
  if not coalesce((select s.registration_open from public.site_settings s where s.id), true) then
    raise exception 'pantia:registration_closed' using errcode = '42501';
  end if;
  if char_length(v_nick) not between 1 and 20 then
    v_nick := 'ユーザー';
  end if;
  if v_role not in ('seller', 'buyer') then
    v_role := 'buyer';
  end if;
  -- 年齢・職業は出品者だけ。形が違えば捨てる（登録は止めない。年齢の本当の確認は本人確認で行う）
  if v_role = 'seller' and coalesce(v_meta ->> 'age', '') ~ '^[0-9]{2}$' then
    v_age := (v_meta ->> 'age')::smallint;
    if v_age not between 18 and 99 then
      v_age := null;
    end if;
  end if;
  if v_role <> 'seller' or char_length(v_job) not between 1 and 20 then
    v_job := null;
  end if;
  insert into public.profiles (id, nickname, role, age, occupation)
  values (new.id, v_nick, v_role, v_age, v_job)
  on conflict (id) do nothing;
  if found then
    perform public.audit(new.id, 'user.register', 'user', new.id::text, jsonb_build_object('role', v_role));
  end if;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- =============================================================================
--   2. 支払い待ちの注文を、買った本人が取り消す
--      Stripe・PayPay の画面で戻るを押した人が、30分（銀行振込は72時間）待たずに買い直せるように。
--      取り消しの前に、アプリが決済会社の側を先に止める（止まらず払われていたら、取り消さずに入金を確かめる）。
--      取り消したあとに入金が届いたら mark_group_paid が返金待ちにする（cancel_reason が expired でないため）。
-- =============================================================================
create or replace function public.cancel_my_pending_group(p_group uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_n  integer;
begin
  if v_me is null then
    raise exception 'pantia:not_allowed' using errcode = '42501';
  end if;
  perform 1 from public.orders where group_id = p_group and buyer_id = v_me for update;
  update public.orders
  set status = 'cancelled', cancelled_at = now(), cancel_reason = 'buyer_cancelled'
  where group_id = p_group and buyer_id = v_me and status = 'pending';
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'pantia:bad_state';
  end if;
  perform public.audit(v_me, 'order.buyer_cancel_pending', 'order_group', p_group::text, jsonb_build_object('count', v_n));
  return v_n;
end;
$$;
revoke all on function public.cancel_my_pending_group(uuid) from public, anon;
grant execute on function public.cancel_my_pending_group(uuid) to authenticated;

-- =============================================================================
--   3. お知らせのメール（注文・本人確認・振込）
--      notify() は画面のお知らせを入れるだけ。メールはアプリが claim_mail_batch で拾って送る。
--      ・拾った行には mailed_at を付ける（同時に2つ走っても skip locked で二重に送らない）。
--      ・送らない行（設定で止めている・退会した人）にも mailed_at を付けて、二度と拾わない。
--      ・届いたかどうかは mail_outbox に残る。送れなかった分は送り直さない（画面のお知らせは残っている）。
--      ・古い行は送らない（3日より前。入れ替えの直後に昔のお知らせを一斉に送らないため）。
--      送るかどうか:
--        order  … 管理画面の「購入完了メール」(mail_order) かつ 本人の notify_order
--        kyc    … 管理画面の「KYC審査結果メール」(mail_kyc)
--        payout … 管理画面の「振込完了メール」(mail_payout)
--      本人が書き換えられるのは read_at だけ（0002 の grant）なので、mailed_at は利用者からは変えられない。
-- =============================================================================
alter table public.notifications add column mailed_at timestamptz;
create index notifications_mail_queue_idx on public.notifications (created_at)
  where mailed_at is null and kind in ('order', 'kyc', 'payout');

create or replace function public.claim_mail_batch(p_limit integer default 50)
returns table (notification_id uuid, user_id uuid, email text, kind text, title text, body text, link text)
language sql
security definer
set search_path = ''
as $$
  with s as (
    select coalesce((select st.mail_order from public.site_settings st where st.id), true) as mail_order,
           coalesce((select st.mail_kyc from public.site_settings st where st.id), true) as mail_kyc,
           coalesce((select st.mail_payout from public.site_settings st where st.id), true) as mail_payout
  ), picked as (
    select n.id
    from public.notifications n
    where n.mailed_at is null
      and n.kind in ('order', 'kyc', 'payout')
      and n.created_at > now() - interval '3 days'
    order by n.created_at
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    for update skip locked
  ), marked as (
    update public.notifications n
    set mailed_at = now()
    from picked
    where n.id = picked.id
    returning n.id, n.user_id, n.kind, n.title, n.body, n.link
  )
  select m.id, m.user_id, u.email::text, m.kind, m.title, m.body, m.link
  from marked m
  join public.profiles p on p.id = m.user_id
  join auth.users u on u.id = m.user_id
  cross join s
  where p.status <> 'withdrawn'
    and u.email is not null
    and u.email <> ''
    and case m.kind
          when 'order' then s.mail_order and p.notify_order
          when 'kyc' then s.mail_kyc
          when 'payout' then s.mail_payout
          else false
        end;
$$;
revoke all on function public.claim_mail_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_mail_batch(integer) to service_role;

-- ── 4. 出品の削除（本人） ─────────────────────────────────────────────
-- listings_read は本人にも deleted を見せないので、RLS 越しの update で deleted にすると
-- 「更新後の行が見えない」で 42501 になる。本人の削除はこの関数を通す。
-- 支払い待ちの注文が押さえている商品は消せない（消すと決済のあとで売れた扱いにできない）。
create or replace function public.delete_my_listing(p_listing uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'pantia:not_allowed' using errcode = '42501';
  end if;
  perform 1 from public.listings where id = p_listing and seller_id = v_me for update;
  if not found then
    raise exception 'pantia:not_found';
  end if;
  if exists (select 1 from public.orders o where o.listing_id = p_listing and o.status = 'pending') then
    raise exception 'pantia:reserved';
  end if;
  update public.listings
  set status = 'deleted'
  where id = p_listing
    and seller_id = v_me
    and status in ('draft', 'published', 'private', 'sold');
  if not found then
    raise exception 'pantia:bad_state';
  end if;
  perform public.audit(v_me, 'listing.delete', 'listing', p_listing::text, '{}'::jsonb);
end;
$$;
revoke all on function public.delete_my_listing(uuid) from public, anon;
grant execute on function public.delete_my_listing(uuid) to authenticated;

-- ── 5. 管理画面で見る、利用者の売上の残高 ─────────────────────────────────
-- my_balance() は本人の分だけ。管理画面は service_role で人を指定して読む（アプリで足し合わせると PostgREST の行数の上限で欠ける）。
-- ほかの admin_ の関数と同じく、呼んだ管理者を確かめる（04 の G02）。
create or replace function public.admin_user_balance(p_admin uuid, p_user uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin(p_admin);
  return (select coalesce(sum(amount), 0)::integer from public.ledger_entries where user_id = p_user);
end;
$$;
revoke all on function public.admin_user_balance(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_user_balance(uuid, uuid) to service_role;
