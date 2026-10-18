-- =============================================================================
-- 0002 core — 利用者・管理者・設定・通知・記録の土台
-- -----------------------------------------------------------------------------
-- 決まり（28 §A）
--   ・表は全部 RLS を有効にし、anon / authenticated の権限はいったん全部外してから、要る分だけ戻す
--   ・役割・本人確認・停止・管理者の印は、利用者が書けない（列の権限で外す。変えるのは security definer の関数だけ）
--   ・security definer の関数は search_path = '' にし、public / anon への実行権を外す
--   ・利用者が書いた user_metadata は、登録の瞬間に「呼び名」「出品者か購入者か」を拾うだけ。権限の判断には使わない
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- 共通: updated_at を今の時刻にする
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.touch_updated_at() from public, anon, authenticated;

-- 呼んだのが画面の利用者（anon / authenticated）か。security definer の関数の中や service_role では false
--   注意: これを使う trigger は security definer にしない（definer の中では current_user が持ち主になり、常に false になる）
create or replace function public.is_end_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user in ('anon', 'authenticated');
$$;
revoke all on function public.is_end_user() from public;
grant execute on function public.is_end_user() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- profiles: 利用者のプロフィール。メール・生年月日・本名・住所はここに置かない
--   ・購入者の呼び名は、ほかの人には「K***さん」の形でしか見せない（見本の決まり）。
--     そのため誰でも読める列は public_name（出品者は呼び名そのまま、購入者は伏せ字）で、
--     nickname と通知の設定は列の権限を渡さない。本人は my_profile() で読む。
--   ・コードは select('*') を使わず、列を並べて読むこと（権限の無い列があると全体が拒否される）
-- -----------------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  nickname          text not null check (char_length(nickname) between 1 and 20 and nickname !~ '[[:cntrl:]]'),
  role              text not null default 'buyer' check (role in ('seller', 'buyer')),
  public_name       text generated always as (
                      case when role = 'seller' then nickname else left(nickname, 1) || '***さん' end
                    ) stored,
  bio               text not null default '' check (char_length(bio) <= 1000),
  -- 画像は「自分の id/<uuid>.webp」だけ（他人の画像を指させない。28 §A8-2）
  avatar_path       text check (avatar_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.webp$')),
  cover_path        text check (cover_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.webp$')),
  age               smallint check (age between 18 and 99),
  occupation        text check (char_length(occupation) <= 20 and occupation !~ '[[:cntrl:]]'),
  height_cm         smallint check (height_cm between 120 and 200),
  body_type         text check (body_type in ('slim', 'normal', 'glamour', 'chubby')),
  ship_estimate     text check (ship_estimate in ('same_next', 'd1_2', 'd2_3', 'd3_5')),
  supported_options text[] not null default '{}'
                    check (cardinality(supported_options) <= 7
                           and supported_options <@ array['photo', 'days', 'same_day', 'anonymous', 'letter', 'request', 'bundle']::text[]),
  ng_note           text not null default '' check (char_length(ng_note) <= 200),
  accept_messages   boolean not null default true,
  notify_order      boolean not null default true,
  notify_message    boolean not null default true,
  notify_follow     boolean not null default false,
  notify_news       boolean not null default false,
  notify_new_post   boolean not null default true,
  notify_new_listing boolean not null default true,
  -- ここから下は利用者が書けない（列の権限を渡さない。変えるのは security definer の関数だけ）
  last_seen_at      timestamptz,
  kyc_status        text not null default 'unsubmitted' check (kyc_status in ('unsubmitted', 'pending', 'approved', 'rejected')),
  status            text not null default 'active' check (status in ('active', 'suspended', 'withdrawn')),
  follower_count    integer not null default 0 check (follower_count >= 0),
  following_count   integer not null default 0 check (following_count >= 0),
  sales_count       integer not null default 0 check (sales_count >= 0),
  purchase_count    integer not null default 0 check (purchase_count >= 0),
  rating_sum        integer not null default 0 check (rating_sum >= 0),
  rating_count      integer not null default 0 check (rating_count >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role, created_at desc) where status = 'active';
create index profiles_nickname_trgm on public.profiles using gin (nickname extensions.gin_trgm_ops);
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select (id, public_name, role, bio, avatar_path, cover_path, age, occupation, height_cm, body_type,
              ship_estimate, supported_options, ng_note, accept_messages, last_seen_at, kyc_status, status,
              follower_count, following_count, sales_count, rating_sum, rating_count, created_at)
  on public.profiles to anon, authenticated;
grant update (nickname, bio, avatar_path, cover_path, age, occupation, height_cm, body_type, ship_estimate,
              supported_options, ng_note, accept_messages, notify_order, notify_message, notify_follow, notify_news,
              notify_new_post, notify_new_listing)
  on public.profiles to authenticated;

create policy profiles_read on public.profiles
  for select to anon, authenticated
  using (status = 'active' or id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and status = 'active')
  with check (id = (select auth.uid()));

-- 本人の全部の列（呼び名・通知の設定を含む）
create or replace function public.my_profile()
returns setof public.profiles
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.profiles where id = (select auth.uid());
$$;
revoke all on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

-- 「オンライン中」の表示用。3分に1回までしか書かない
create or replace function public.touch_last_seen()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set last_seen_at = now()
  where id = (select auth.uid()) and status = 'active'
    and (last_seen_at is null or last_seen_at < now() - interval '3 minutes');
$$;
revoke all on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;

-- -----------------------------------------------------------------------------
-- admin_users: 管理者の名簿。画面からは誰も読めない・書けない（入れるのは SQL で手作業。README 参照）
-- -----------------------------------------------------------------------------
create table public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  note       text check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;
revoke insert, update, delete, truncate on public.admin_users from service_role;

-- -----------------------------------------------------------------------------
-- viewer_context: ログイン中の本人の状態（lib/auth.ts の getViewer が呼ぶ）
-- -----------------------------------------------------------------------------
create or replace function public.viewer_context()
returns table (nickname text, role text, kyc_status text, status text, is_admin boolean, avatar_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.nickname, p.role, p.kyc_status, p.status,
         exists (select 1 from public.admin_users a where a.user_id = p.id),
         p.avatar_path
  from public.profiles p
  where p.id = (select auth.uid());
$$;
revoke all on function public.viewer_context() from public, anon;
grant execute on function public.viewer_context() to authenticated;

-- 有効で本人確認が済んだ人か（RLS の中で使う）
create or replace function public.is_verified(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_uid and p.status = 'active' and p.kyc_status = 'approved'
  );
$$;
revoke all on function public.is_verified(uuid) from public, anon;
grant execute on function public.is_verified(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 登録したら profiles を1行作る。user_metadata は利用者が好きに書けるので、形を確かめてから使う
-- -----------------------------------------------------------------------------
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
drop trigger if exists pantia_on_auth_user_created on auth.users;
create trigger pantia_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- site_settings: 手数料などの設定（1行だけ）。書くのは管理画面（service_role）だけ
--   匿名配送の転送先（代行センターの住所）は、画面の利用者には列の権限を渡さない（出品者へはサーバーが必要なときだけ渡す）
-- -----------------------------------------------------------------------------
create table public.site_settings (
  id                 boolean primary key default true check (id),
  fee_rate           numeric(4, 3) not null default 0.150 check (fee_rate >= 0 and fee_rate < 0.5),
  anonymous_fee      integer not null default 300 check (anonymous_fee between 0 and 5000),
  min_payout         integer not null default 3000 check (min_payout between 1 and 1000000),
  payout_fee         integer not null default 0 check (payout_fee between 0 and 1000),
  auto_complete_days integer not null default 7 check (auto_complete_days between 1 and 30),
  video_fee          integer not null default 800 check (video_fee between 0 and 10000),
  extend_fee_per_day integer not null default 500 check (extend_fee_per_day between 0 and 10000),
  registration_open  boolean not null default true,
  maintenance        boolean not null default false,
  notice             text not null default '' check (char_length(notice) <= 500),
  mail_order         boolean not null default true,
  mail_kyc           boolean not null default true,
  mail_payout        boolean not null default true,
  mod_spam_filter    boolean not null default true,
  forwarding_address text not null default '' check (char_length(forwarding_address) <= 300),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users (id) on delete set null
);
insert into public.site_settings default values;
create trigger site_settings_touch before update on public.site_settings for each row execute function public.touch_updated_at();
alter table public.site_settings enable row level security;
revoke all on public.site_settings from anon, authenticated;
grant select (id, fee_rate, anonymous_fee, min_payout, payout_fee, auto_complete_days, video_fee, extend_fee_per_day,
              registration_open, maintenance, notice)
  on public.site_settings to anon, authenticated;
create policy site_settings_read on public.site_settings for select to anon, authenticated using (true);
revoke insert, delete, truncate on public.site_settings from service_role;

-- -----------------------------------------------------------------------------
-- audit_logs: 誰が何をしたか（28 §Q1・Q2）。書き足すだけ。直す・消すは service_role にもさせない
--   消すのは保存期間を過ぎた分だけ（cleanup_retention の中で）
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references auth.users (id) on delete set null,
  action      text not null check (char_length(action) between 1 and 60),
  target_type text check (char_length(target_type) <= 30),
  target_id   text check (char_length(target_id) <= 80),
  detail      jsonb not null default '{}'::jsonb check (pg_column_size(detail) <= 8000),
  created_at  timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_target_idx on public.audit_logs (target_type, target_id);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from anon, authenticated;
revoke update, delete, truncate on public.audit_logs from service_role;

create or replace function public.audit(p_actor uuid, p_action text, p_target_type text, p_target_id text, p_detail jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (p_actor, p_action, p_target_type, p_target_id, coalesce(p_detail, '{}'::jsonb));
$$;
revoke all on function public.audit(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.audit(uuid, text, text, text, jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- notifications: お知らせ。本人だけが読める。書くのは notify() だけ
-- -----------------------------------------------------------------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  -- 'like' は今は作らない（仮: 見本の通知設定に無く、いいねのたびに届くと多すぎる）。あとで足せるように種類だけ残す
  kind       text not null check (kind in ('message', 'order', 'review', 'follow', 'like', 'comment', 'kyc', 'payout', 'report', 'listing', 'post', 'system')),
  title      text not null check (char_length(title) between 1 and 100),
  body       text not null default '' check (char_length(body) <= 300),
  -- サイトの中のパスだけ（外の URL に飛ばさない）
  link       text check (link ~ '^/[A-Za-z0-9/_?=&.-]*$' and link !~ '^//'),
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_own_read on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_own_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_own_delete on public.notifications for delete to authenticated using (user_id = (select auth.uid()));

create or replace function public.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, kind, title, body, link)
  values (p_user, p_kind, left(p_title, 100), left(coalesce(p_body, ''), 300), p_link);
$$;
revoke all on function public.notify(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.notify(uuid, text, text, text, text) to service_role;

-- お知らせの題の呼び名に「さん」を付ける。購入者の public_name（K***さん）など、もう「さん」で終わる物には重ねない
create or replace function public.san(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_name, '') = '' then ''
    when right(p_name, 2) = 'さん' then p_name
    else p_name || 'さん'
  end;
$$;
revoke all on function public.san(text) from public, anon, authenticated;
grant execute on function public.san(text) to service_role;

-- -----------------------------------------------------------------------------
-- mail_outbox: 送ったメール（仮の動きのときは送らずにここへ残すだけ）。service_role だけ
-- -----------------------------------------------------------------------------
create table public.mail_outbox (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users (id) on delete set null,
  to_address text not null check (char_length(to_address) <= 254),
  kind       text not null check (char_length(kind) <= 40),
  subject    text not null check (char_length(subject) <= 200),
  body       text not null check (char_length(body) <= 10000),
  mode       text not null check (mode in ('mock', 'live')),
  sent       boolean not null default false,
  error      text check (char_length(error) <= 500),
  created_at timestamptz not null default now()
);
create index mail_outbox_created_idx on public.mail_outbox (created_at desc);
alter table public.mail_outbox enable row level security;
revoke all on public.mail_outbox from anon, authenticated;
revoke update, delete, truncate on public.mail_outbox from service_role;

-- -----------------------------------------------------------------------------
-- cron_runs: 定時処理が最後まで走った時刻（/api/cron/health が返す。28 §F）
-- -----------------------------------------------------------------------------
create table public.cron_runs (
  name             text primary key check (name ~ '^[a-z-]{1,40}$'),
  last_started_at  timestamptz,
  last_finished_at timestamptz,
  last_ok          boolean,
  last_error       text check (char_length(last_error) <= 500),
  detail           jsonb not null default '{}'::jsonb check (pg_column_size(detail) <= 4000)
);
alter table public.cron_runs enable row level security;
revoke all on public.cron_runs from anon, authenticated;
revoke delete, truncate on public.cron_runs from service_role;

-- -----------------------------------------------------------------------------
-- payment_events: 決済・本人確認の webhook を2回受けても1回だけ処理する（同じ event_id は弾く）
-- -----------------------------------------------------------------------------
create table public.payment_events (
  provider    text not null check (provider in ('stripe', 'paypay', 'trustdock', 'mock')),
  event_id    text not null check (char_length(event_id) between 1 and 200),
  kind        text check (char_length(kind) <= 80),
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);
alter table public.payment_events enable row level security;
revoke all on public.payment_events from anon, authenticated;
revoke update, delete, truncate on public.payment_events from service_role;
