-- =============================================================================
-- 0023 admin thread view — 運営が利用者同士の会話を、理由を残して見る（改修リスト 行8）
-- -----------------------------------------------------------------------------
-- 決まり
--   ・利用者の詳細から、その人の会話の一覧（相手・どちら側か・最後の時刻・開けるか）を見られる。中身は返さない。一覧は記録しない
--   ・中身を見るには、会話ごとに理由（1〜200字）を書いて「開く」。開いてから30分のあいだ、その管理者だけが読める
--   ・見せるのは、送った人が新しい同意（版2）をした後のメッセージだけ。送り手のない知らせは出さない。新しい200件を古い順に
--   ・片方でも版2の同意が無い会話は開けない。同意を取り消した人のメッセージは、それ以後は見せない
--   ・同意の版は2に上がる。版1の人は、次に送る前に同意し直す。版2の人が同意し直しても、同意の時刻は動かさない
--   ・同意の関数は、画面が見せた文の版を受け取る（今の画面は2）。引数なし（この前の画面）は版1として残す。知らない版は断る
--   ・開くこと（理由つき）と読むことは、毎回、操作ログに残す（thread.opened・thread.read）。今の thread.viewed（0012）とは分ける
--   ・券の表（thread_view_grants）は関数からしか読み書きできない（service_role も直接は触れない）
--   ・0021・0022 とは別の物を触るので、どの順に当ててもよい
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 同意の版を2にする（版2 = 運営が理由を記録したうえで、同意のあとのメッセージを確かめることがある）
-- -----------------------------------------------------------------------------
alter table public.message_consents alter column version set default 2;

drop function if exists public.agree_message_terms();
create or replace function public.agree_message_terms(p_version integer default 1)
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
  -- 画面が見せた文の版を受け取る。引数なし＝0023 の前の画面（版1の文）。古い文への同意を版2として残さない
  if p_version is null or p_version not in (1, 2) then
    raise exception 'pantia:bad_request' using errcode = '22023';
  end if;
  -- 版は下げない。版が上がったときだけ同意の時刻を今にする（版2の人が同意し直しても時刻は動かさない）
  insert into public.message_consents as c (user_id, version, agreed_at) values (v_uid, p_version, now())
  on conflict (user_id) do update
    set version = greatest(c.version, excluded.version),
        agreed_at = case when excluded.version > c.version then excluded.agreed_at else c.agreed_at end;
  perform public.audit(v_uid, 'message_terms.agree', 'user', v_uid::text, jsonb_build_object('version', p_version));
end;
$$;
revoke all on function public.agree_message_terms(integer) from public, anon;
grant execute on function public.agree_message_terms(integer) to authenticated;

-- 送る: 版2の同意が無ければ止める（0012 の send_message から、同意の確かめの1行だけを変えた）
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
  if not exists (select 1 from public.message_consents c where c.user_id = v_uid and c.version >= 2) then
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
-- 2. 券の表: 誰が・どの会話を・なぜ・いつ開いたか。関数からしか読み書きしない
-- -----------------------------------------------------------------------------
create table public.thread_view_grants (
  id        uuid primary key default gen_random_uuid(),
  admin_id  uuid not null references auth.users (id) on delete cascade,
  thread_id uuid not null references public.threads (id) on delete cascade,
  reason    text not null check (char_length(reason) between 1 and 200),
  opened_at timestamptz not null default now()
);
create index thread_view_grants_lookup_idx on public.thread_view_grants (admin_id, thread_id, opened_at desc);
create index thread_view_grants_thread_idx on public.thread_view_grants (thread_id);
alter table public.thread_view_grants enable row level security;
revoke all on public.thread_view_grants from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. 一覧: その人の会話（新しい順に100件まで）。相手・どちら側か・最後の時刻・開けるか。中身は返さない。記録しない
-- -----------------------------------------------------------------------------
create or replace function public.admin_list_user_threads(p_admin uuid, p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  perform public.assert_admin(p_admin);
  select coalesce(jsonb_agg(jsonb_build_object(
           'thread_id', x.id,
           'partner_id', x.partner_id,
           'side', x.side,
           'last_message_at', x.last_message_at,
           'viewable', x.viewable)
         order by x.last_message_at desc, x.id), '[]'::jsonb)
  into v_out
  from (
    select t.id, t.last_message_at,
           case when t.seller_id = p_user then t.buyer_id else t.seller_id end as partner_id,
           case when t.seller_id = p_user then 'seller' else 'buyer' end as side,
           (exists (select 1 from public.message_consents c where c.user_id = t.seller_id and c.version >= 2)
            and exists (select 1 from public.message_consents c where c.user_id = t.buyer_id and c.version >= 2)) as viewable
    from public.threads t
    where t.seller_id = p_user or t.buyer_id = p_user
    order by t.last_message_at desc, t.id
    limit 100
  ) x;
  return v_out;
end;
$$;
revoke all on function public.admin_list_user_threads(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_list_user_threads(uuid, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 4. 開く: 理由（前後の空白を除いて1〜200字・制御文字なし。改行とタブは空白にする）を書く。両者に版2の同意が要る
-- -----------------------------------------------------------------------------
create or replace function public.admin_open_thread(p_admin uuid, p_thread uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t      public.threads;
  v_reason text := btrim(regexp_replace(coalesce(p_reason, ''), E'[\\r\\n\\t]+', ' ', 'g'), E' 　');
  v_id     uuid;
begin
  perform public.assert_admin(p_admin);
  if v_reason = '' or char_length(v_reason) > 200 or v_reason ~ '[[:cntrl:]]' then
    raise exception 'pantia:bad_reason' using errcode = '22023';
  end if;
  select * into v_t from public.threads t where t.id = p_thread;
  if not found then
    raise exception 'pantia:not_found' using errcode = '22023';
  end if;
  if not (exists (select 1 from public.message_consents c where c.user_id = v_t.seller_id and c.version >= 2)
          and exists (select 1 from public.message_consents c where c.user_id = v_t.buyer_id and c.version >= 2)) then
    raise exception 'pantia:consent_missing' using errcode = '42501';
  end if;
  insert into public.thread_view_grants (admin_id, thread_id, reason) values (p_admin, p_thread, v_reason)
  returning id into v_id;
  perform public.audit(p_admin, 'thread.opened', 'thread', p_thread::text,
                       jsonb_build_object('reason', v_reason, 'grant', v_id));
  return v_id;
end;
$$;
revoke all on function public.admin_open_thread(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_open_thread(uuid, uuid, text) to service_role;

-- -----------------------------------------------------------------------------
-- 5. 読む: 30分以内に自分で開いた会話だけ。送った人の版2の同意の後のメッセージを、新しい200件まで古い順に
--   会話が無いときも「開いていない」と同じ答えにする（会話があるかどうかを漏らさない）
-- -----------------------------------------------------------------------------
create or replace function public.admin_view_any_thread(p_admin uuid, p_thread uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g   public.thread_view_grants;
  v_t   public.threads;
  v_out jsonb;
begin
  perform public.assert_admin(p_admin);
  select * into v_g from public.thread_view_grants g
  where g.admin_id = p_admin and g.thread_id = p_thread and g.opened_at >= now() - interval '30 minutes'
  order by g.opened_at desc, g.id
  limit 1;
  if not found then
    raise exception 'pantia:view_grant_required' using errcode = '42501';
  end if;
  select * into v_t from public.threads t where t.id = p_thread;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'sender_id', x.sender_id, 'kind', x.kind, 'body', x.body,
           'image_paths', to_jsonb(x.image_paths), 'listing_id', x.listing_id,
           'status', x.status, 'created_at', x.created_at)
         order by x.created_at, x.id), '[]'::jsonb)
  into v_out
  from (
    select m.id, m.sender_id, m.kind, m.body, m.image_paths, m.listing_id, m.status, m.created_at
    from public.messages m
    join public.message_consents c on c.user_id = m.sender_id and c.version >= 2 and m.created_at >= c.agreed_at
    where m.thread_id = p_thread
    order by m.created_at desc, m.id desc
    limit 200
  ) x;
  perform public.audit(p_admin, 'thread.read', 'thread', p_thread::text, jsonb_build_object('grant', v_g.id));
  return jsonb_build_object('thread_id', v_t.id, 'seller_id', v_t.seller_id, 'buyer_id', v_t.buyer_id,
                            'reason', v_g.reason, 'opened_at', v_g.opened_at, 'messages', v_out);
end;
$$;
revoke all on function public.admin_view_any_thread(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_view_any_thread(uuid, uuid) to service_role;
