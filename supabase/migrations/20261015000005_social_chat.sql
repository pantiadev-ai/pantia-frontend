-- =============================================================================
-- 0005 social_chat — メッセージ（チャット）・つぶやき・いいね・コメント
-- -----------------------------------------------------------------------------
-- 決まり
--   ・メッセージは「出品者 × 購入者」の1組に1本のスレッド。書くのは関数だけ（send_message など）
--   ・送れるのは有効で本人確認済みの人だけ。ブロックし合っていたら送れない
--   ・スパムフィルター（site_settings.mod_spam_filter）が ON なら、外部への誘導らしい文は「保留」。
--     保留は送った本人にだけ見え、運営が管理画面で承認すると相手に届く
--   ・つぶやきは出品者（本人確認済み）だけ。140字・画像4枚まで・自分の出品を1つ添付できる
--   ・メッセージの画像は非公開の箱（chat-images）。画面にはサーバーが期限つき URL を作って渡す
-- =============================================================================

-- -----------------------------------------------------------------------------
-- スパムらしいか（外の URL・メールアドレス・電話番号・SNS や LINE への誘導）
-- -----------------------------------------------------------------------------
create or replace function public.looks_spammy(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_text, '') ~* (
    'https?://|www\.|[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z.]{2,}|＠'
    || '|(^|[^a-z])line([^a-z]|$)|(^|[^ァ-ヺー])ライン|ＬＩＮＥ|ｌｉｎｅ|カカオ|kakao|telegram|テレグラム|instagram|インスタ|twitter|ツイッター|discord|ディスコ'
    || '|0[5789]0-?[0-9]{4}-?[0-9]{4}|０[５７８９]０'
  );
$$;
revoke all on function public.looks_spammy(text) from public;
grant execute on function public.looks_spammy(text) to anon, authenticated, service_role;

-- スパムフィルターが ON で、スパムらしい文か（設定の列は利用者に見せないので security definer）
create or replace function public.spam_hold(p_text text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.mod_spam_filter from public.site_settings s where s.id), true) and public.looks_spammy(p_text);
$$;
revoke all on function public.spam_hold(text) from public, anon;
grant execute on function public.spam_hold(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- threads: 出品者 × 購入者 の会話
-- -----------------------------------------------------------------------------
create table public.threads (
  id                   uuid primary key default gen_random_uuid(),
  seller_id            uuid not null references public.profiles (id) on delete cascade,
  buyer_id             uuid not null references public.profiles (id) on delete cascade,
  last_message_at      timestamptz not null default now(),
  last_message_preview text not null default '' check (char_length(last_message_preview) <= 80),
  seller_last_read_at  timestamptz,
  buyer_last_read_at   timestamptz,
  seller_muted         boolean not null default false,
  buyer_muted          boolean not null default false,
  created_at           timestamptz not null default now(),
  unique (seller_id, buyer_id),
  check (seller_id <> buyer_id)
);
create index threads_seller_idx on public.threads (seller_id, last_message_at desc);
create index threads_buyer_idx on public.threads (buyer_id, last_message_at desc);
alter table public.threads enable row level security;
revoke all on public.threads from anon, authenticated;
grant select on public.threads to authenticated;
create policy threads_party_read on public.threads for select to authenticated
  using (seller_id = (select auth.uid()) or buyer_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- messages: 1通ずつ。system（決済完了など）と shipping（発送のお知らせ）は関数が書く
-- -----------------------------------------------------------------------------
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references public.threads (id) on delete cascade,
  sender_id   uuid references public.profiles (id) on delete set null,
  kind        text not null check (kind in ('text', 'image', 'item', 'system', 'shipping')),
  body        text not null default '' check (char_length(body) <= 1000 and translate(body, E'\n', '') !~ '[[:cntrl:]]'),
  image_paths text[] not null default '{}' check (public.paths_ok(image_paths, thread_id, 4)),
  listing_id  uuid references public.listings (id) on delete set null,
  order_id    uuid references public.orders (id) on delete set null,
  hearted     boolean not null default false,
  status      text not null default 'visible' check (status in ('visible', 'held', 'hidden')),
  created_at  timestamptz not null default now()
);
create index messages_thread_idx on public.messages (thread_id, created_at desc);
create index messages_held_idx on public.messages (created_at) where status = 'held';
alter table public.messages enable row level security;
revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
create policy messages_party_read on public.messages for select to authenticated
  using (
    exists (select 1 from public.threads t
            where t.id = thread_id and (t.seller_id = (select auth.uid()) or t.buyer_id = (select auth.uid())))
    and (status = 'visible' or (status = 'held' and sender_id = (select auth.uid())))
  );

-- 中で使う: スレッドが無ければ作って id を返す（権限の確認は呼ぶ側の関数で済ませておくこと）
create or replace function public.ensure_thread(p_seller uuid, p_buyer uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.threads (seller_id, buyer_id) values (p_seller, p_buyer)
  on conflict (seller_id, buyer_id) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.threads where seller_id = p_seller and buyer_id = p_buyer;
  end if;
  return v_id;
end;
$$;
revoke all on function public.ensure_thread(uuid, uuid) from public, anon, authenticated;

-- 中で使う: 決済完了・発送などのお知らせをスレッドに残す（0004 の注文の関数から呼ぶ）
create or replace function public.post_system_message(p_seller uuid, p_buyer uuid, p_kind text, p_body text, p_order uuid, p_listing uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread uuid := public.ensure_thread(p_seller, p_buyer);
begin
  insert into public.messages (thread_id, sender_id, kind, body, order_id, listing_id)
  values (v_thread, case when p_kind = 'shipping' then p_seller end, p_kind, left(p_body, 1000), p_order, p_listing);
  update public.threads set last_message_at = now(), last_message_preview = left(p_body, 80) where id = v_thread;
end;
$$;
revoke all on function public.post_system_message(uuid, uuid, text, text, uuid, uuid) from public, anon, authenticated;

-- 会話を始める（または既にある会話の id を返す）
--   購入者 → 公開中の出品者（メッセージ受付 ON、または取引がある）
--   出品者 → 取引か会話がすでにある購入者だけ
create or replace function public.open_thread(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_me   public.profiles;
  v_them public.profiles;
  v_id   uuid;
  v_deal boolean;
begin
  select * into v_me from public.profiles where id = v_uid;
  if not found or v_me.status <> 'active' or v_me.kyc_status <> 'approved' then
    raise exception 'pantia:kyc_required' using errcode = '42501';
  end if;
  select * into v_them from public.profiles where id = p_other;
  if not found or v_them.status <> 'active' or v_them.role = v_me.role or public.blocked_between(v_uid, p_other) then
    raise exception 'pantia:unavailable';
  end if;
  if v_me.role = 'buyer' then
    select id into v_id from public.threads where seller_id = p_other and buyer_id = v_uid;
    if v_id is not null then
      return v_id;
    end if;
    v_deal := exists (select 1 from public.orders o where o.seller_id = p_other and o.buyer_id = v_uid and o.status <> 'pending');
    if not public.seller_is_public(p_other) or (not v_them.accept_messages and not v_deal) then
      raise exception 'pantia:messages_closed';
    end if;
    return public.ensure_thread(p_other, v_uid);
  end if;
  select id into v_id from public.threads where seller_id = v_uid and buyer_id = p_other;
  if v_id is not null then
    return v_id;
  end if;
  if not exists (select 1 from public.orders o where o.seller_id = v_uid and o.buyer_id = p_other and o.status <> 'pending') then
    raise exception 'pantia:unavailable';
  end if;
  return public.ensure_thread(v_uid, p_other);
end;
$$;
revoke all on function public.open_thread(uuid) from public, anon;
grant execute on function public.open_thread(uuid) to authenticated;

-- 送る（文・画像・出品の添付）。画像は先にサーバーが chat-images/<thread_id>/<uuid>.webp に置いておく
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
begin
  select * into v_t from public.threads where id = p_thread and (seller_id = v_uid or buyer_id = v_uid);
  if not found then
    raise exception 'pantia:unavailable';
  end if;
  if not public.is_verified(v_uid) then
    raise exception 'pantia:kyc_required' using errcode = '42501';
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

-- 既読にする（自分の側の既読時刻と、この会話のお知らせ）
create or replace function public.mark_thread_read(p_thread uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  update public.threads
  set seller_last_read_at = case when seller_id = v_uid then now() else seller_last_read_at end,
      buyer_last_read_at  = case when buyer_id = v_uid then now() else buyer_last_read_at end
  where id = p_thread and (seller_id = v_uid or buyer_id = v_uid);
  update public.notifications set read_at = now()
  where user_id = v_uid and kind = 'message' and link = '/messages/' || p_thread::text and read_at is null;
end;
$$;
revoke all on function public.mark_thread_read(uuid) from public, anon;
grant execute on function public.mark_thread_read(uuid) to authenticated;

-- この会話の通知を止める／戻す
create or replace function public.set_thread_muted(p_thread uuid, p_muted boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.threads
  set seller_muted = case when seller_id = (select auth.uid()) then coalesce(p_muted, false) else seller_muted end,
      buyer_muted  = case when buyer_id = (select auth.uid()) then coalesce(p_muted, false) else buyer_muted end
  where id = p_thread and (seller_id = (select auth.uid()) or buyer_id = (select auth.uid()));
$$;
revoke all on function public.set_thread_muted(uuid, boolean) from public, anon;
grant execute on function public.set_thread_muted(uuid, boolean) to authenticated;

-- 相手のメッセージに ♥ を付ける／外す。戻り値は付いたあとの状態
create or replace function public.toggle_message_heart(p_message uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_new boolean;
begin
  update public.messages m set hearted = not m.hearted
  from public.threads t
  where m.id = p_message and t.id = m.thread_id and (t.seller_id = v_uid or t.buyer_id = v_uid)
    and m.sender_id is distinct from v_uid and m.status = 'visible' and m.kind in ('text', 'image', 'item', 'shipping')
  returning m.hearted into v_new;
  if not found then
    raise exception 'pantia:unavailable';
  end if;
  return v_new;
end;
$$;
revoke all on function public.toggle_message_heart(uuid) from public, anon;
grant execute on function public.toggle_message_heart(uuid) to authenticated;

-- 会話の一覧（相手・最後の文・未読数）。RLS のまま読む
create or replace function public.my_threads()
returns table (
  thread_id uuid, other_id uuid, other_name text, other_avatar text, other_role text, other_last_seen timestamptz,
  other_verified boolean, last_message_at timestamptz, preview text, unread integer, muted boolean, other_read_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select t.id,
         o.id,
         coalesce(o.public_name, '退会したユーザー'),
         o.avatar_path,
         o.role,
         o.last_seen_at,
         coalesce(o.kyc_status = 'approved', false),
         t.last_message_at,
         t.last_message_preview,
         (select count(*)::integer from public.messages m
          where m.thread_id = t.id and m.status = 'visible' and m.sender_id is distinct from (select auth.uid())
            and m.created_at > coalesce(case when t.seller_id = (select auth.uid()) then t.seller_last_read_at else t.buyer_last_read_at end, '-infinity'::timestamptz)),
         case when t.seller_id = (select auth.uid()) then t.seller_muted else t.buyer_muted end,
         case when t.seller_id = (select auth.uid()) then t.buyer_last_read_at else t.seller_last_read_at end
  from public.threads t
  left join public.profiles o on o.id = case when t.seller_id = (select auth.uid()) then t.buyer_id else t.seller_id end
  where t.seller_id = (select auth.uid()) or t.buyer_id = (select auth.uid())
  order by t.last_message_at desc
  limit 200;
$$;
revoke all on function public.my_threads() from public, anon;
grant execute on function public.my_threads() to authenticated;

-- ヘッダーの未読バッジ用
create or replace function public.my_unread_messages()
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(unread), 0)::integer from public.my_threads();
$$;
revoke all on function public.my_unread_messages() from public, anon;
grant execute on function public.my_unread_messages() to authenticated;

-- -----------------------------------------------------------------------------
-- posts: つぶやき（出品者だけ）
-- -----------------------------------------------------------------------------
create table public.posts (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body          text not null check (char_length(body) <= 140 and btrim(body) <> '' and translate(body, E'\n', '') !~ '[[:cntrl:]]'),
  image_paths   text[] not null default '{}' check (public.paths_ok(image_paths, author_id, 4)),
  listing_id    uuid references public.listings (id) on delete set null,
  category      text,
  tags          text[] not null default '{}',
  pinned        boolean not null default false,
  like_count    integer not null default 0 check (like_count >= 0),
  comment_count integer not null default 0 check (comment_count >= 0),
  status        text not null default 'visible' check (status in ('visible', 'held', 'hidden')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  edited_at     timestamptz
);
create unique index posts_one_pin on public.posts (author_id) where pinned;
create index posts_feed_idx on public.posts (created_at desc) where status = 'visible';
create index posts_author_idx on public.posts (author_id, created_at desc);
create index posts_tags_idx on public.posts using gin (tags);
create index posts_held_idx on public.posts (created_at) where status = 'held';
create trigger posts_touch before update on public.posts for each row execute function public.touch_updated_at();

alter table public.posts enable row level security;
revoke all on public.posts from anon, authenticated;
grant select on public.posts to anon, authenticated;
grant insert (body, image_paths, listing_id) on public.posts to authenticated;
grant update (body, image_paths, listing_id) on public.posts to authenticated;
grant delete on public.posts to authenticated;
create policy posts_read on public.posts for select to anon, authenticated
  using (
    author_id = (select auth.uid())
    or (status = 'visible' and public.seller_is_public(author_id) and not public.is_blocked_with(author_id))
  );
create policy posts_insert_own on public.posts for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.is_verified((select auth.uid()))
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'seller')
    and (listing_id is null or exists (
      select 1 from public.listings l where l.id = listing_id and l.seller_id = (select auth.uid()) and l.status in ('published', 'private', 'sold')))
  );
create policy posts_update_own on public.posts for update to authenticated
  using (author_id = (select auth.uid()) and status <> 'hidden')
  with check (
    author_id = (select auth.uid())
    and (listing_id is null or exists (
      select 1 from public.listings l where l.id = listing_id and l.seller_id = (select auth.uid()) and l.status in ('published', 'private', 'sold')))
  );
create policy posts_delete_own on public.posts for delete to authenticated using (author_id = (select auth.uid()));

-- タグとカテゴリを本文・添付から決める。利用者からの書き込みでは、数・ピン・状態を触らせない
-- （is_end_user を使うので security definer にしない）
create or replace function public.posts_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.tags := coalesce((
    select array_agg(tag) from (
      select distinct lower(m[1]) as tag
      from regexp_matches(new.body, '[#＃]([^[:space:]#＃　、。！？!?,.]{1,30})', 'g') as m
      limit 10
    ) s
  ), '{}');
  if new.listing_id is null then
    new.category := null;
  else
    select l.category into new.category from public.listings l where l.id = new.listing_id;
  end if;
  if not public.is_end_user() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.like_count := 0;
    new.comment_count := 0;
    new.pinned := false;
    new.edited_at := null;
    new.status := case when public.spam_hold(new.body) then 'held' else 'visible' end;
  else
    new.author_id := old.author_id;
    new.like_count := old.like_count;
    new.comment_count := old.comment_count;
    new.pinned := old.pinned;
    new.created_at := old.created_at;
    if new.body is distinct from old.body or new.image_paths is distinct from old.image_paths or new.listing_id is distinct from old.listing_id then
      new.edited_at := now();
    end if;
    new.status := case
      when old.status = 'hidden' then 'hidden'
      when new.body is distinct from old.body and public.spam_hold(new.body) then 'held'
      else old.status end;
  end if;
  return new;
end;
$$;
revoke all on function public.posts_guard() from public;
create trigger posts_guard before insert or update on public.posts for each row execute function public.posts_guard();

-- 公開されたつぶやきを、フォロワー（新着つぶやきの通知 ON）に知らせる。保留から承認されたときも
create or replace function public.posts_announce()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'visible' and (tg_op = 'INSERT' or old.status = 'held') then
    insert into public.notifications (user_id, kind, title, body, link)
    select f.follower_id, 'post',
           left(public.san((select p.public_name from public.profiles p where p.id = new.author_id)) || 'が新しくつぶやきました', 100),
           left(new.body, 100), '/timeline'
    from public.follows f
    join public.profiles u on u.id = f.follower_id
    where f.seller_id = new.author_id and u.notify_new_post and u.status = 'active';
  elsif tg_op = 'INSERT' and new.status = 'held' then
    perform public.audit(null, 'moderation.held', 'post', new.id::text, jsonb_build_object('author', new.author_id));
  end if;
  return null;
end;
$$;
revoke all on function public.posts_announce() from public, anon, authenticated;
create trigger posts_announce after insert or update of status on public.posts for each row execute function public.posts_announce();

-- 自分のつぶやきをピン留めする（1人1件。ほかのピンは外れる）
create or replace function public.pin_post(p_post uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not exists (select 1 from public.posts where id = p_post and author_id = v_uid and status = 'visible') then
    raise exception 'pantia:unavailable';
  end if;
  if coalesce(p_pinned, false) then
    update public.posts set pinned = false where author_id = v_uid and pinned and id <> p_post;
  end if;
  update public.posts set pinned = coalesce(p_pinned, false) where id = p_post;
end;
$$;
revoke all on function public.pin_post(uuid, boolean) from public, anon;
grant execute on function public.pin_post(uuid, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- post_likes: つぶやきへのいいね（ログインしていれば誰でも）
-- -----------------------------------------------------------------------------
create table public.post_likes (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  post_id    uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index post_likes_post_idx on public.post_likes (post_id);
alter table public.post_likes enable row level security;
revoke all on public.post_likes from anon, authenticated;
grant select, delete on public.post_likes to authenticated;
grant insert (post_id) on public.post_likes to authenticated;
create policy post_likes_own_read on public.post_likes for select to authenticated using (user_id = (select auth.uid()));
create policy post_likes_own_insert on public.post_likes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.status = 'active')
    and exists (select 1 from public.posts p where p.id = post_id and p.status = 'visible')
  );
create policy post_likes_own_delete on public.post_likes for delete to authenticated using (user_id = (select auth.uid()));

create or replace function public.post_likes_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
  else
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;
revoke all on function public.post_likes_count() from public, anon, authenticated;
create trigger post_likes_count after insert or delete on public.post_likes for each row execute function public.post_likes_count();

-- -----------------------------------------------------------------------------
-- post_comments: つぶやきへのコメント（本人確認済みの人だけ）。つぶやいた本人は消せる
-- -----------------------------------------------------------------------------
create table public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  author_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) <= 200 and btrim(body) <> '' and translate(body, E'\n', '') !~ '[[:cntrl:]]'),
  status     text not null default 'visible' check (status in ('visible', 'held', 'hidden')),
  created_at timestamptz not null default now()
);
create index post_comments_post_idx on public.post_comments (post_id, created_at);
create index post_comments_held_idx on public.post_comments (created_at) where status = 'held';
alter table public.post_comments enable row level security;
revoke all on public.post_comments from anon, authenticated;
grant select on public.post_comments to anon, authenticated;
grant insert (post_id, body) on public.post_comments to authenticated;
grant delete on public.post_comments to authenticated;
create policy post_comments_read on public.post_comments for select to anon, authenticated
  using (
    (status = 'visible' or author_id = (select auth.uid()))
    and exists (select 1 from public.posts p where p.id = post_id)
    and not public.is_blocked_with(author_id)
  );
create policy post_comments_insert on public.post_comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.is_verified((select auth.uid()))
    and exists (select 1 from public.posts p where p.id = post_id and p.status = 'visible' and not public.is_blocked_with(p.author_id))
  );
create policy post_comments_delete on public.post_comments for delete to authenticated
  using (
    author_id = (select auth.uid())
    or exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid()))
  );

-- 利用者からの書き込みは、状態をスパムフィルターで決める（is_end_user を使うので security definer にしない）
create or replace function public.post_comments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_end_user() then
    new.status := case when public.spam_hold(new.body) then 'held' else 'visible' end;
    new.created_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.post_comments_guard() from public;
create trigger post_comments_guard before insert on public.post_comments for each row execute function public.post_comments_guard();

-- コメント数は「公開中」のものだけ数える（保留・非表示は数えない）。保留から承認されたら、つぶやいた人に知らせる
create or replace function public.post_comments_after()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
  v_notify boolean := false;
  v_c      public.post_comments;
begin
  if tg_op = 'DELETE' then
    if old.status = 'visible' then
      update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
    end if;
    return null;
  end if;
  v_c := new;
  if tg_op = 'INSERT' then
    if new.status = 'held' then
      perform public.audit(null, 'moderation.held', 'comment', new.id::text, jsonb_build_object('author', new.author_id));
      return null;
    end if;
    if new.status <> 'visible' then
      return null;
    end if;
    v_notify := true;
  elsif new.status = 'visible' and old.status <> 'visible' then
    v_notify := old.status = 'held';
  elsif old.status = 'visible' and new.status <> 'visible' then
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = new.post_id;
    return null;
  else
    return null;
  end if;
  update public.posts set comment_count = comment_count + 1 where id = v_c.post_id returning author_id into v_author;
  if v_notify and v_author is not null and v_author <> v_c.author_id then
    perform public.notify(v_author, 'comment',
      left(public.san((select p.public_name from public.profiles p where p.id = v_c.author_id)) || 'がコメントしました', 100),
      left(v_c.body, 100), '/tweets/' || v_c.post_id::text);
  end if;
  return null;
end;
$$;
revoke all on function public.post_comments_after() from public, anon, authenticated;
create trigger post_comments_after after insert or delete or update of status on public.post_comments for each row execute function public.post_comments_after();

-- -----------------------------------------------------------------------------
-- トレンドタグ（直近7日の公開つぶやきのタグを数える）
-- -----------------------------------------------------------------------------
create or replace function public.trend_tags(p_days integer default 7, p_limit integer default 10)
returns table (tag text, n bigint)
language sql
stable
set search_path = ''
as $$
  select t.tag, count(*) as n
  from public.posts p, unnest(p.tags) as t(tag)
  where p.status = 'visible' and p.created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 30))
  group by t.tag
  order by n desc, t.tag
  limit least(greatest(coalesce(p_limit, 10), 1), 30);
$$;
revoke all on function public.trend_tags(integer, integer) from public;
grant execute on function public.trend_tags(integer, integer) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Realtime: メッセージ・会話・お知らせの変化を画面に届ける（RLS が効いたまま届く）
-- -----------------------------------------------------------------------------
do $$
declare
  v_t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_t in array array['messages', 'threads', 'notifications'] loop
      if not exists (
        select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_t);
      end if;
    end loop;
  end if;
end;
$$;
