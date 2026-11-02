-- =============================================================================
-- 0012 message_safety — メッセージの禁止ワード・送る前の同意・運営が通報と保留の会話を見る
-- -----------------------------------------------------------------------------
-- 決まり
--   ・禁止ワードは管理画面で入れる（site_settings.banned_words）。利用者には列の権限を渡さない
--   ・入っていたら送らせない（行を作らない・相手に届かない）。当たった語は hint で返し、送った人の画面に出す
--   ・比べ方は部分一致。全角半角・大文字小文字・空白の違いは見ない（NFKC にして小文字にし、空白を消す）
--   ・初めて送る前に、運営が通報と自動の保留の物を確かめることへの同意をもらう（message_consents）。いつでも取り消せる
--   ・運営が会話を開けるのは、通報されたか、保留・非表示になったメッセージからだけ。前30件・後10件を返し、開いたことを記録に残す
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 禁止ワード
-- -----------------------------------------------------------------------------
-- 比べるための形（NFKC・小文字・空白なし）
create or replace function public.banned_word_key(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(lower(normalize(coalesce(p_text, ''), nfkc)), '[[:space:]]+', '', 'g');
$$;
revoke all on function public.banned_word_key(text) from public, anon, authenticated;
grant execute on function public.banned_word_key(text) to service_role;

-- 200語まで。1語1〜30字・前後の空白なし・制御文字なし・空白だけの語なし
create or replace function public.banned_words_ok(p_words text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(p_words), 0) <= 200 and not exists (
    select 1 from unnest(coalesce(p_words, '{}'::text[])) w
    where w is null or char_length(w) not between 1 and 30 or w <> btrim(w) or w ~ '[[:cntrl:]]'
       or public.banned_word_key(w) = ''
  );
$$;
revoke all on function public.banned_words_ok(text[]) from public, anon, authenticated;
grant execute on function public.banned_words_ok(text[]) to service_role;

alter table public.site_settings
  add column banned_words text[] not null default '{}'
    constraint site_settings_banned_words_ok check (public.banned_words_ok(banned_words));

-- 文に入っている最初の禁止ワード（無ければ null）。外の値は正規表現に入れず strpos で探す
create or replace function public.banned_word_in(p_text text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select w.word
  from public.site_settings s
  cross join lateral unnest(s.banned_words) with ordinality as w(word, i)
  where s.id
    and public.banned_word_key(w.word) <> ''
    and strpos(public.banned_word_key(p_text), public.banned_word_key(w.word)) > 0
  order by w.i
  limit 1;
$$;
revoke all on function public.banned_word_in(text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. message_consents: 運営が通報と保留の物を確かめることへの同意。本人だけが読める。書くのは関数だけ
-- -----------------------------------------------------------------------------
create table public.message_consents (
  user_id   uuid primary key references public.profiles (id) on delete cascade,
  version   smallint not null default 1 check (version >= 1),
  agreed_at timestamptz not null default now()
);
alter table public.message_consents enable row level security;
revoke all on public.message_consents from anon, authenticated;
revoke insert, update, delete, truncate on public.message_consents from service_role;
grant select on public.message_consents to authenticated;
create policy message_consents_own_read on public.message_consents for select to authenticated
  using (user_id = (select auth.uid()));

-- 同意する（チェックボックスに印を付けて送ったとき）
create or replace function public.agree_message_terms()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not exists (select 1 from public.profiles p where p.id = v_uid and p.status = 'active') then
    raise exception 'pantia:not_allowed' using errcode = '42501';
  end if;
  insert into public.message_consents (user_id, version, agreed_at) values (v_uid, 1, now())
  on conflict (user_id) do update set version = excluded.version, agreed_at = excluded.agreed_at;
  perform public.audit(v_uid, 'message_terms.agree', 'user', v_uid::text, jsonb_build_object('version', 1));
end;
$$;
revoke all on function public.agree_message_terms() from public, anon;
grant execute on function public.agree_message_terms() to authenticated;

-- 取り消す（設定の画面から。取り消すと、また同意するまで送れない）
create or replace function public.withdraw_message_terms()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'pantia:not_allowed' using errcode = '42501';
  end if;
  delete from public.message_consents where user_id = v_uid;
  if found then
    perform public.audit(v_uid, 'message_terms.withdraw', 'user', v_uid::text, '{}'::jsonb);
  end if;
end;
$$;
revoke all on function public.withdraw_message_terms() from public, anon;
grant execute on function public.withdraw_message_terms() to authenticated;

-- -----------------------------------------------------------------------------
-- 3. 送る: 同意が無ければ止める。禁止ワードが入っていれば止める（行を作らない）
-- -----------------------------------------------------------------------------
create or replace function public.send_message(p_thread uuid, p_body text, p_image_paths text[] default '{}', p_listing uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_t       public.threads;
  v_body    text := btrim(replace(coalesce(p_body, ''), E'\r', ''));
  v_paths   text[] := coalesce(p_image_paths, '{}');
  v_kind    text;
  v_status  text;
  v_other   uuid;
  v_id      uuid;
  v_preview text;
  v_link    text;
  v_word    text;
begin
  select * into v_t from public.threads where id = p_thread and (seller_id = v_uid or buyer_id = v_uid);
  if not found then
    raise exception 'pantia:unavailable';
  end if;
  if not public.is_verified(v_uid) then
    raise exception 'pantia:kyc_required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.message_consents c where c.user_id = v_uid) then
    raise exception 'pantia:message_consent_required' using errcode = '42501';
  end if;
  v_other := case when v_t.seller_id = v_uid then v_t.buyer_id else v_t.seller_id end;
  if public.blocked_between(v_t.seller_id, v_t.buyer_id)
     or not exists (select 1 from public.profiles p where p.id = v_other and p.status = 'active') then
    raise exception 'pantia:unavailable';
  end if;
  -- 出品者が受付を止めていて、取引も無いなら、購入者からは送れない
  if v_uid = v_t.buyer_id
     and not exists (select 1 from public.profiles p where p.id = v_t.seller_id and p.accept_messages)
     and not exists (select 1 from public.orders o where o.seller_id = v_t.seller_id and o.buyer_id = v_uid and o.status <> 'pending') then
    raise exception 'pantia:messages_closed';
  end if;
  if char_length(v_body) > 1000 or translate(v_body, E'\n', '') ~ '[[:cntrl:]]' or cardinality(v_paths) > 4
     or not public.paths_ok(v_paths, p_thread, 4)
     or (cardinality(v_paths) > 0 and p_listing is not null)
     or (v_body = '' and cardinality(v_paths) = 0 and p_listing is null) then
    raise exception 'pantia:bad_message' using errcode = '22023';
  end if;
  -- 商品の紹介は、この会話の出品者が自分の商品だけ
  if p_listing is not null and (v_uid <> v_t.seller_id or not exists (
    select 1 from public.listings l where l.id = p_listing and l.seller_id = v_t.seller_id and l.status in ('published', 'sold')
  )) then
    raise exception 'pantia:bad_message' using errcode = '22023';
  end if;
  v_word := public.banned_word_in(v_body);
  if v_word is not null then
    raise exception 'pantia:banned_word' using errcode = '22023', hint = v_word;
  end if;
  v_kind := case when cardinality(v_paths) > 0 then 'image' when p_listing is not null then 'item' else 'text' end;
  v_status := case when public.spam_hold(v_body) then 'held' else 'visible' end;

  insert into public.messages (thread_id, sender_id, kind, body, image_paths, listing_id, status)
  values (p_thread, v_uid, v_kind, v_body, v_paths, p_listing, v_status)
  returning id into v_id;

  if v_uid = v_t.seller_id then
    update public.threads set seller_last_read_at = now() where id = p_thread;
  else
    update public.threads set buyer_last_read_at = now() where id = p_thread;
  end if;
  if v_status = 'held' then
    perform public.audit(null, 'moderation.held', 'message', v_id::text, jsonb_build_object('sender', v_uid));
    return v_id;
  end if;

  v_preview := case v_kind when 'image' then '📷 画像' when 'item' then '🛍 商品' else '' end
               || case when v_body <> '' then case when v_kind = 'text' then '' else ' ' end || left(v_body, 60) else '' end;
  update public.threads set last_message_at = now(), last_message_preview = left(v_preview, 80) where id = p_thread;

  -- 相手へのお知らせ（未読のお知らせが既にあれば増やさない）
  v_link := '/messages/' || p_thread::text;
  if exists (
       select 1 from public.profiles p where p.id = v_other and p.notify_message
     )
     and not (case when v_other = v_t.seller_id then v_t.seller_muted else v_t.buyer_muted end)
     and not exists (
       select 1 from public.notifications n where n.user_id = v_other and n.kind = 'message' and n.link = v_link and n.read_at is null
     ) then
    perform public.notify(v_other, 'message',
      public.san((select p.public_name from public.profiles p where p.id = v_uid)) || 'からメッセージ',
      left(v_preview, 100), v_link);
  end if;
  return v_id;
end;
$$;
revoke all on function public.send_message(uuid, text, text[], uuid) from public, anon;
grant execute on function public.send_message(uuid, text, text[], uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. 管理画面: サイト設定に禁止ワードを足す。監査ログには語の数だけ残す（語を全部残すと記録の上限を超える）
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
                     'registration_open', 'maintenance', 'notice', 'mail_order', 'mail_kyc', 'mail_payout', 'mod_spam_filter',
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
-- 5. 管理画面: 通報か保留・非表示のあるメッセージから、その会話の前30件・後10件を見る
--   ほかのメッセージからは開けない（運営が自由に会話を読める作りにしない）。開いたことは記録に残す
-- -----------------------------------------------------------------------------
create or replace function public.admin_view_thread(p_admin uuid, p_message uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m   public.messages;
  v_t   public.threads;
  v_out jsonb;
begin
  perform public.assert_admin(p_admin);
  select * into v_m from public.messages m where m.id = p_message;
  if not found or not (v_m.status in ('held', 'hidden') or exists (
       select 1 from public.reports r where r.target_type = 'message' and r.target_id = p_message)) then
    raise exception 'pantia:not_flagged' using errcode = '42501';
  end if;
  select * into v_t from public.threads t where t.id = v_m.thread_id;
  with ordered as (
    select m.id, m.sender_id, m.kind, m.body, m.image_paths, m.listing_id, m.order_id, m.status, m.created_at,
           row_number() over (order by m.created_at, m.id) as rn
    from public.messages m
    where m.thread_id = v_m.thread_id
  ), center as (
    select o.rn from ordered o where o.id = p_message
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'sender_id', o.sender_id, 'kind', o.kind, 'body', o.body, 'image_paths', to_jsonb(o.image_paths),
           'listing_id', o.listing_id, 'order_id', o.order_id, 'status', o.status, 'created_at', o.created_at,
           'flagged', o.status in ('held', 'hidden') or exists (
             select 1 from public.reports r where r.target_type = 'message' and r.target_id = o.id))
         order by o.rn), '[]'::jsonb)
  into v_out
  from ordered o, center c
  where o.rn between c.rn - 30 and c.rn + 10;
  perform public.audit(p_admin, 'thread.viewed', 'message', p_message::text, jsonb_build_object('thread', v_m.thread_id));
  return jsonb_build_object('thread_id', v_t.id, 'seller_id', v_t.seller_id, 'buyer_id', v_t.buyer_id,
                            'target_id', p_message, 'messages', v_out);
end;
$$;
revoke all on function public.admin_view_thread(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_view_thread(uuid, uuid) to service_role;
