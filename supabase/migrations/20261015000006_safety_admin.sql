-- =============================================================================
-- 0006 safety_admin — 通報・本人確認（KYC）・役割の変更・退会・利用停止・管理画面・集計・掃除
-- -----------------------------------------------------------------------------
-- 決まり
--   ・管理画面の操作は、すべて service_role だけが呼べる関数。最初の引数 p_admin を admin_users で確かめ、
--     監査ログ（audit_logs）に残す（28 §Q1）。サーバーは requireAdmin のあとで呼ぶ
--   ・本人確認の書類は非公開の箱（kyc-documents）。判定が済んだらサーバーが消して kyc_mark_purged を呼ぶ（28 §P3）
--   ・18歳未満と分かったら、申請を却下して利用を止める（規約 2）
--   ・退会は消さずに「退会済み」にして、公開の情報を空にする（取引の記録は残す）
-- =============================================================================

-- 管理者か（違えば 42501）
create or replace function public.assert_admin(p_admin uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_admin is null or not exists (select 1 from public.admin_users a where a.user_id = p_admin) then
    raise exception 'pantia:not_admin' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.assert_admin(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- user_sanctions: 警告・停止・解除・退会の記録
-- -----------------------------------------------------------------------------
create table public.user_sanctions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('warning', 'suspend', 'unsuspend', 'withdraw')),
  reason     text not null default '' check (char_length(reason) <= 500),
  admin_id   uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index user_sanctions_user_idx on public.user_sanctions (user_id, created_at desc);
alter table public.user_sanctions enable row level security;
revoke all on public.user_sanctions from anon, authenticated;
revoke update, delete, truncate on public.user_sanctions from service_role;

-- -----------------------------------------------------------------------------
-- reports: 通報
-- -----------------------------------------------------------------------------
create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  report_no       bigint generated always as identity (start with 1) unique,
  reporter_id     uuid references public.profiles (id) on delete set null,
  target_type     text not null check (target_type in ('user', 'listing', 'post', 'comment', 'message')),
  target_id       uuid not null,
  target_owner    uuid references public.profiles (id) on delete set null,
  reason          text not null check (reason in ('spam', 'inappropriate', 'impersonation', 'fraud', 'underage', 'harassment', 'image', 'other')),
  detail          text not null default '' check (char_length(detail) <= 500 and translate(detail, E'\n', '') !~ '[[:cntrl:]]'),
  status          text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  resolution_note text check (char_length(resolution_note) <= 500),
  handled_by      uuid references auth.users (id) on delete set null,
  handled_at      timestamptz,
  created_at      timestamptz not null default now()
);
create unique index reports_once on public.reports (reporter_id, target_type, target_id) where status in ('open', 'reviewing');
create index reports_open_idx on public.reports (created_at desc) where status in ('open', 'reviewing');
create index reports_target_idx on public.reports (target_type, target_id);
alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;

-- 通報する（見えている物だけ。自分自身は通報できない）。戻り値は通報番号
create or replace function public.file_report(p_type text, p_target uuid, p_reason text, p_detail text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_owner uuid;
  v_no    bigint;
begin
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.status = 'active') then
    raise exception 'pantia:not_allowed' using errcode = '42501';
  end if;
  if p_reason not in ('spam', 'inappropriate', 'impersonation', 'fraud', 'underage', 'harassment', 'image', 'other')
     or char_length(coalesce(p_detail, '')) > 500
     or (p_reason = 'other' and btrim(coalesce(p_detail, '')) = '') then
    raise exception 'pantia:bad_report' using errcode = '22023';
  end if;
  v_owner := case p_type
    when 'user' then (select p.id from public.profiles p where p.id = p_target and p.status <> 'withdrawn')
    when 'listing' then (select l.seller_id from public.listings l where l.id = p_target and l.status in ('published', 'sold', 'private'))
    when 'post' then (select po.author_id from public.posts po where po.id = p_target and po.status = 'visible')
    when 'comment' then (select c.author_id from public.post_comments c where c.id = p_target and c.status = 'visible')
    when 'message' then (
      select m.sender_id from public.messages m join public.threads t on t.id = m.thread_id
      where m.id = p_target and m.status = 'visible' and (t.seller_id = v_uid or t.buyer_id = v_uid))
    else null end;
  if v_owner is null or v_owner = v_uid then
    raise exception 'pantia:unavailable';
  end if;
  begin
    insert into public.reports (reporter_id, target_type, target_id, target_owner, reason, detail)
    values (v_uid, p_type, p_target, v_owner, p_reason, btrim(replace(coalesce(p_detail, ''), E'\r', '')))
    returning report_no into v_no;
  exception when unique_violation then
    raise exception 'pantia:already_reported';
  end;
  perform public.audit(v_uid, 'report.file', p_type, p_target::text, jsonb_build_object('report_no', v_no, 'reason', p_reason));
  return v_no;
end;
$$;
revoke all on function public.file_report(text, uuid, text, text) from public, anon;
grant execute on function public.file_report(text, uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- kyc_applications: 本人確認の申請
--   provider: manual（書類を運営が目で見る）／ trustdock（TRUSTDOCK の結果を webhook で受ける）
-- -----------------------------------------------------------------------------
create table public.kyc_applications (
  id                  uuid primary key default gen_random_uuid(),
  app_no              bigint generated always as identity (start with 1) unique,
  user_id             uuid not null references public.profiles (id) on delete cascade,
  provider            text not null check (provider in ('manual', 'trustdock')),
  doc_type            text not null check (doc_type in ('license', 'mynumber', 'passport')),
  document_paths      text[] not null default '{}' check (public.paths_ok(document_paths, user_id, 3)),
  birth_date          date check (birth_date between date '1900-01-01' and date '2100-01-01'),
  status              text not null default 'pending' check (status in ('pending', 'reviewing', 'approved', 'rejected')),
  reject_reason       text check (char_length(reject_reason) <= 200),
  resubmit_allowed    boolean not null default true,
  provider_ref        text check (char_length(provider_ref) <= 200),
  created_at          timestamptz not null default now(),
  decided_at          timestamptz,
  decided_by          uuid references auth.users (id) on delete set null,
  documents_purged_at timestamptz
);
create unique index kyc_one_open on public.kyc_applications (user_id) where status in ('pending', 'reviewing');
create index kyc_user_idx on public.kyc_applications (user_id, created_at desc);
create index kyc_open_idx on public.kyc_applications (created_at) where status in ('pending', 'reviewing');
create unique index kyc_provider_ref_uq on public.kyc_applications (provider_ref) where provider_ref is not null;
alter table public.kyc_applications enable row level security;
revoke all on public.kyc_applications from anon, authenticated;
grant select (id, app_no, user_id, provider, doc_type, status, reject_reason, resubmit_allowed, created_at, decided_at)
  on public.kyc_applications to authenticated;
create policy kyc_own_read on public.kyc_applications for select to authenticated using (user_id = (select auth.uid()));

-- 中で使う: 利用を止める（記録・監査つき）
create or replace function public.suspend_internal(p_user uuid, p_actor uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set status = 'suspended' where id = p_user and status = 'active';
  if found then
    insert into public.user_sanctions (user_id, kind, reason, admin_id) values (p_user, 'suspend', left(coalesce(p_reason, ''), 500), p_actor);
    perform public.audit(p_actor, 'user.suspend', 'user', p_user::text, jsonb_build_object('reason', left(coalesce(p_reason, ''), 200)));
  end if;
end;
$$;
revoke all on function public.suspend_internal(uuid, uuid, text) from public, anon, authenticated;

-- 申請する（service_role だけ。書類はサーバーが先に kyc-documents/<user_id>/<uuid>.webp に置く）
--   戻り値: {"app_id", "status": "pending" | "rejected_underage", "purge_paths": [...]}
create or replace function public.submit_kyc(p_user uuid, p_provider text, p_doc_type text, p_paths text[], p_birth_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p    public.profiles;
  v_last public.kyc_applications;
  v_id   uuid;
  v_age  integer;
begin
  select * into v_p from public.profiles where id = p_user for update;
  if not found or v_p.status <> 'active' then
    raise exception 'pantia:not_allowed' using errcode = '42501';
  end if;
  if v_p.kyc_status not in ('unsubmitted', 'rejected') then
    raise exception 'pantia:kyc_in_progress';
  end if;
  select * into v_last from public.kyc_applications where user_id = p_user order by created_at desc limit 1;
  if found and v_last.status = 'rejected' and not v_last.resubmit_allowed then
    raise exception 'pantia:kyc_resubmit_closed';
  end if;
  if p_provider not in ('manual', 'trustdock') or p_doc_type not in ('license', 'mynumber', 'passport')
     or p_birth_date is null or p_birth_date > current_date or p_birth_date < date '1900-01-01'
     or (p_provider = 'manual' and coalesce(cardinality(p_paths), 0) not between 1 and 3)
     or not public.paths_ok(coalesce(p_paths, '{}'), p_user, 3) then
    raise exception 'pantia:bad_kyc' using errcode = '22023';
  end if;
  v_age := extract(year from age((now() at time zone 'Asia/Tokyo')::date, p_birth_date))::integer;

  if v_age < 18 then
    insert into public.kyc_applications (user_id, provider, doc_type, document_paths, birth_date, status, reject_reason,
                                         resubmit_allowed, decided_at)
    values (p_user, p_provider, p_doc_type, coalesce(p_paths, '{}'), p_birth_date, 'rejected', '18歳未満の方はご利用いただけません',
            false, now())
    returning id into v_id;
    update public.profiles set kyc_status = 'rejected' where id = p_user;
    perform public.suspend_internal(p_user, null, 'KYC: 18歳未満');
    perform public.audit(null, 'kyc.underage', 'kyc', v_id::text, jsonb_build_object('user', p_user));
    return jsonb_build_object('app_id', v_id, 'status', 'rejected_underage', 'purge_paths', to_jsonb(coalesce(p_paths, '{}')));
  end if;

  insert into public.kyc_applications (user_id, provider, doc_type, document_paths, birth_date)
  values (p_user, p_provider, p_doc_type, coalesce(p_paths, '{}'), p_birth_date)
  returning id into v_id;
  update public.profiles set kyc_status = 'pending' where id = p_user;
  perform public.audit(p_user, 'kyc.submit', 'kyc', v_id::text, jsonb_build_object('doc_type', p_doc_type, 'provider', p_provider));
  return jsonb_build_object('app_id', v_id, 'status', 'pending', 'purge_paths', '[]'::jsonb);
end;
$$;
revoke all on function public.submit_kyc(uuid, text, text, text[], date) from public, anon, authenticated;
grant execute on function public.submit_kyc(uuid, text, text, text[], date) to service_role;

-- TRUSTDOCK の受付番号を結ぶ（service_role）
create or replace function public.kyc_set_provider_ref(p_app uuid, p_ref text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.kyc_applications set provider_ref = left(p_ref, 200) where id = p_app and status in ('pending', 'reviewing');
$$;
revoke all on function public.kyc_set_provider_ref(uuid, text) from public, anon, authenticated;
grant execute on function public.kyc_set_provider_ref(uuid, text) to service_role;

-- 中で使う: 判定を反映する。戻り値: {"user_id", "status", "purge_paths"}
create or replace function public.kyc_apply_decision(p_app uuid, p_actor uuid, p_approve boolean, p_reason text,
                                                    p_underage boolean, p_allow_resubmit boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.kyc_applications;
begin
  select * into v_a from public.kyc_applications where id = p_app for update;
  if not found or v_a.status not in ('pending', 'reviewing') then
    raise exception 'pantia:bad_state';
  end if;
  if p_approve and coalesce(p_underage, false) then
    raise exception 'pantia:bad_kyc' using errcode = '22023';
  end if;
  if not p_approve and char_length(btrim(coalesce(p_reason, ''))) not between 1 and 200 then
    raise exception 'pantia:bad_reason' using errcode = '22023';
  end if;
  if p_approve then
    update public.kyc_applications set status = 'approved', decided_at = now(), decided_by = p_actor, reject_reason = null where id = p_app;
    update public.profiles set kyc_status = 'approved' where id = v_a.user_id;
    perform public.notify(v_a.user_id, 'kyc', '本人確認が完了しました', 'すべての機能をご利用いただけます。', '/mypage');
  else
    update public.kyc_applications
    set status = 'rejected', decided_at = now(), decided_by = p_actor, reject_reason = btrim(p_reason),
        resubmit_allowed = coalesce(p_allow_resubmit, true) and not coalesce(p_underage, false)
    where id = p_app;
    update public.profiles set kyc_status = 'rejected' where id = v_a.user_id;
    if coalesce(p_underage, false) then
      perform public.suspend_internal(v_a.user_id, p_actor, 'KYC: 18歳未満');
    else
      perform public.notify(v_a.user_id, 'kyc', '本人確認を承認できませんでした', left(btrim(p_reason), 300), '/kyc');
    end if;
  end if;
  perform public.audit(p_actor, case when p_approve then 'kyc.approve' else 'kyc.reject' end, 'kyc', p_app::text,
    jsonb_build_object('user', v_a.user_id, 'app_no', v_a.app_no, 'underage', coalesce(p_underage, false)));
  return jsonb_build_object('user_id', v_a.user_id, 'status', case when p_approve then 'approved' else 'rejected' end,
                            'purge_paths', to_jsonb(v_a.document_paths));
end;
$$;
revoke all on function public.kyc_apply_decision(uuid, uuid, boolean, text, boolean, boolean) from public, anon, authenticated;

-- TRUSTDOCK の結果（service_role。webhook の署名を確かめたあと）
create or replace function public.kyc_provider_result(p_ref text, p_approve boolean, p_reason text, p_underage boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.kyc_applications where provider_ref = p_ref and status in ('pending', 'reviewing');
  if v_id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  return public.kyc_apply_decision(v_id, null, p_approve, coalesce(nullif(btrim(coalesce(p_reason, '')), ''), '書類を確認できませんでした'),
                                    p_underage, true);
end;
$$;
revoke all on function public.kyc_provider_result(text, boolean, text, boolean) from public, anon, authenticated;
grant execute on function public.kyc_provider_result(text, boolean, text, boolean) to service_role;

-- 書類を消した印（service_role）
create or replace function public.kyc_mark_purged(p_app uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.kyc_applications set document_paths = '{}', documents_purged_at = now()
  where id = p_app and status in ('approved', 'rejected');
$$;
revoke all on function public.kyc_mark_purged(uuid) from public, anon, authenticated;
grant execute on function public.kyc_mark_purged(uuid) to service_role;

create or replace function public.admin_kyc_start_review(p_admin uuid, p_app uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin(p_admin);
  update public.kyc_applications set status = 'reviewing' where id = p_app and status = 'pending';
  perform public.audit(p_admin, 'kyc.view_documents', 'kyc', p_app::text, '{}'::jsonb);
end;
$$;
revoke all on function public.admin_kyc_start_review(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_kyc_start_review(uuid, uuid) to service_role;

create or replace function public.admin_kyc_decide(p_admin uuid, p_app uuid, p_approve boolean, p_reason text,
                                                  p_underage boolean default false, p_allow_resubmit boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin(p_admin);
  return public.kyc_apply_decision(p_app, p_admin, p_approve, p_reason, p_underage, p_allow_resubmit);
end;
$$;
revoke all on function public.admin_kyc_decide(uuid, uuid, boolean, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.admin_kyc_decide(uuid, uuid, boolean, text, boolean, boolean) to service_role;

-- 却下した申請の「再申請を受け付ける」
create or replace function public.admin_kyc_allow_resubmit(p_admin uuid, p_app uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  perform public.assert_admin(p_admin);
  update public.kyc_applications set resubmit_allowed = true
  where id = p_app and status = 'rejected' and not resubmit_allowed
  returning user_id into v_user;
  if v_user is null then
    raise exception 'pantia:bad_state';
  end if;
  perform public.notify(v_user, 'kyc', '本人確認の再申請ができるようになりました', '本人確認の画面から書類を提出してください。', '/kyc');
  perform public.audit(p_admin, 'kyc.allow_resubmit', 'kyc', p_app::text, jsonb_build_object('user', v_user));
end;
$$;
revoke all on function public.admin_kyc_allow_resubmit(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_kyc_allow_resubmit(uuid, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- role_change_requests: 出品者 ⇄ 購入者 の変更申請（審査あり。規約 3）
-- -----------------------------------------------------------------------------
create table public.role_change_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  from_role     text not null check (from_role in ('seller', 'buyer')),
  to_role       text not null check (to_role in ('seller', 'buyer')),
  reason        text not null default '' check (char_length(reason) <= 200 and translate(reason, E'\n', '') !~ '[[:cntrl:]]'),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reject_reason text check (char_length(reject_reason) <= 200),
  decided_at    timestamptz,
  decided_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  check (from_role <> to_role)
);
create unique index role_change_one_open on public.role_change_requests (user_id) where status = 'pending';
alter table public.role_change_requests enable row level security;
revoke all on public.role_change_requests from anon, authenticated;
grant select on public.role_change_requests to authenticated;
create policy role_change_own_read on public.role_change_requests for select to authenticated using (user_id = (select auth.uid()));

-- 出品者をやめるときの条件（取引中の注文・申請中の振込・残高が無い）
create or replace function public.seller_can_leave(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.orders o where o.seller_id = p_user and o.status in ('pending', 'paid', 'preparing', 'shipped')) then 'open_orders'
    when exists (select 1 from public.payouts p where p.user_id = p_user and p.status = 'requested') then 'payout_open'
    when coalesce((select sum(e.amount) from public.ledger_entries e where e.user_id = p_user), 0) <> 0 then 'balance_left'
    else null end;
$$;
revoke all on function public.seller_can_leave(uuid) from public, anon, authenticated;

create or replace function public.request_role_change(p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_p    public.profiles;
  v_why  text;
  v_id   uuid;
begin
  select * into v_p from public.profiles where id = v_uid;
  if not found or v_p.status <> 'active' then
    raise exception 'pantia:not_allowed' using errcode = '42501';
  end if;
  if char_length(coalesce(p_reason, '')) > 200 then
    raise exception 'pantia:bad_reason' using errcode = '22023';
  end if;
  if v_p.role = 'seller' then
    v_why := public.seller_can_leave(v_uid);
    if v_why is not null then
      raise exception 'pantia:%', v_why;
    end if;
  elsif exists (select 1 from public.orders o where o.buyer_id = v_uid and o.status in ('pending', 'paid', 'preparing', 'shipped')) then
    raise exception 'pantia:open_orders';
  end if;
  begin
    insert into public.role_change_requests (user_id, from_role, to_role, reason)
    values (v_uid, v_p.role, case when v_p.role = 'seller' then 'buyer' else 'seller' end, btrim(replace(coalesce(p_reason, ''), E'\r', '')))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'pantia:already_requested';
  end;
  perform public.audit(v_uid, 'user.role_request', 'user', v_uid::text, jsonb_build_object('to', case when v_p.role = 'seller' then 'buyer' else 'seller' end));
  return v_id;
end;
$$;
revoke all on function public.request_role_change(text) from public, anon;
grant execute on function public.request_role_change(text) to authenticated;

create or replace function public.admin_role_change_decide(p_admin uuid, p_req uuid, p_approve boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r   public.role_change_requests;
  v_why text;
begin
  perform public.assert_admin(p_admin);
  select * into v_r from public.role_change_requests where id = p_req and status = 'pending' for update;
  if not found then
    raise exception 'pantia:bad_state';
  end if;
  if p_approve then
    if not exists (select 1 from public.profiles p where p.id = v_r.user_id and p.role = v_r.from_role and p.status = 'active') then
      raise exception 'pantia:bad_state';
    end if;
    if v_r.from_role = 'seller' then
      v_why := public.seller_can_leave(v_r.user_id);
      if v_why is not null then
        raise exception 'pantia:%', v_why;
      end if;
      update public.listings set status = 'private' where seller_id = v_r.user_id and status = 'published';
      update public.posts set pinned = false where author_id = v_r.user_id and pinned;
    elsif exists (select 1 from public.orders o where o.buyer_id = v_r.user_id and o.status in ('pending', 'paid', 'preparing', 'shipped')) then
      raise exception 'pantia:open_orders';
    end if;
    update public.profiles
    set role = v_r.to_role,
        age = case when v_r.to_role = 'buyer' then null else age end,
        occupation = case when v_r.to_role = 'buyer' then null else occupation end
    where id = v_r.user_id;
    update public.role_change_requests set status = 'approved', decided_at = now(), decided_by = p_admin where id = p_req;
    perform public.notify(v_r.user_id, 'system', 'ロールの変更が承認されました',
      case when v_r.to_role = 'seller' then '出品者としてご利用いただけます。プロフィールを整えて出品しましょう。'
           else '購入者としてご利用いただけます。' end, '/mypage');
  else
    if char_length(btrim(coalesce(p_reason, ''))) not between 1 and 200 then
      raise exception 'pantia:bad_reason' using errcode = '22023';
    end if;
    update public.role_change_requests set status = 'rejected', reject_reason = btrim(p_reason), decided_at = now(), decided_by = p_admin
    where id = p_req;
    perform public.notify(v_r.user_id, 'system', 'ロールの変更申請を承認できませんでした', left(btrim(p_reason), 300), '/mypage');
  end if;
  perform public.audit(p_admin, case when p_approve then 'user.role_approve' else 'user.role_reject' end, 'user', v_r.user_id::text,
    jsonb_build_object('to', v_r.to_role));
end;
$$;
revoke all on function public.admin_role_change_decide(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_role_change_decide(uuid, uuid, boolean, text) to service_role;

-- -----------------------------------------------------------------------------
-- 退会（消さずに「退会済み」にする）。戻り値: {"purge_paths": {"avatars": [...], "listing-images": [...], "post-images": [...], "kyc-documents": [...]}}
--   サーバーは戻り値の画像・書類を消し、Auth の利用者を止める（ban）。審査中の本人確認は却下にして書類も消す
-- -----------------------------------------------------------------------------
create or replace function public.withdraw_internal(p_user uuid, p_actor uuid, p_reason text, p_force boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p       public.profiles;
  v_avatars text[];
  v_listing text[];
  v_post    text[];
  v_kyc     text[];
begin
  select * into v_p from public.profiles where id = p_user for update;
  if not found or v_p.status = 'withdrawn' then
    raise exception 'pantia:bad_state';
  end if;
  if exists (select 1 from public.orders o where (o.seller_id = p_user or o.buyer_id = p_user) and o.status in ('pending', 'paid', 'preparing', 'shipped')) then
    raise exception 'pantia:open_orders';
  end if;
  if exists (select 1 from public.payouts p where p.user_id = p_user and p.status = 'requested') then
    raise exception 'pantia:payout_open';
  end if;
  if not p_force and coalesce((select sum(e.amount) from public.ledger_entries e where e.user_id = p_user), 0) <> 0 then
    raise exception 'pantia:balance_left';
  end if;

  v_avatars := array_remove(array[v_p.avatar_path, v_p.cover_path], null);
  select coalesce(array_agg(x), '{}') into v_listing
  from public.listings l, unnest(l.image_paths) x where l.seller_id = p_user and l.sales_count = 0;
  select coalesce(array_agg(x), '{}') into v_post
  from public.posts po, unnest(po.image_paths) x where po.author_id = p_user;
  select coalesce(array_agg(x), '{}') into v_kyc
  from public.kyc_applications k, unnest(k.document_paths) x where k.user_id = p_user;
  update public.kyc_applications
  set status = 'rejected', reject_reason = '退会', resubmit_allowed = false, decided_at = now(), decided_by = p_actor
  where user_id = p_user and status in ('pending', 'reviewing');
  update public.kyc_applications set document_paths = '{}', documents_purged_at = coalesce(documents_purged_at, now())
  where user_id = p_user and (cardinality(document_paths) > 0 or documents_purged_at is null);

  update public.listings set status = 'deleted' where seller_id = p_user and status <> 'deleted';
  update public.listings set image_paths = '{}' where seller_id = p_user and sales_count = 0;
  delete from public.posts where author_id = p_user;
  delete from public.post_comments where author_id = p_user;
  delete from public.post_likes where user_id = p_user;
  delete from public.follows where follower_id = p_user or seller_id = p_user;
  delete from public.favorites where user_id = p_user;
  delete from public.cart_items where user_id = p_user;
  delete from public.saved_addresses where user_id = p_user;
  delete from public.bank_accounts where user_id = p_user;
  delete from public.blocks where blocker_id = p_user or blocked_id = p_user;
  delete from public.notifications where user_id = p_user;
  update public.profiles
  set status = 'withdrawn', nickname = '退会したユーザー', bio = '', avatar_path = null, cover_path = null,
      occupation = null, age = null, height_cm = null, body_type = null, supported_options = '{}', ng_note = '',
      accept_messages = false, notify_order = false, notify_message = false, notify_follow = false, notify_news = false,
      notify_new_post = false, notify_new_listing = false
  where id = p_user;
  insert into public.user_sanctions (user_id, kind, reason, admin_id) values (p_user, 'withdraw', left(coalesce(p_reason, ''), 500), p_actor);
  perform public.audit(coalesce(p_actor, p_user), 'user.withdraw', 'user', p_user::text,
    jsonb_build_object('by_admin', p_actor is not null, 'reason', left(coalesce(p_reason, ''), 200)));
  return jsonb_build_object('purge_paths', jsonb_build_object(
    'avatars', to_jsonb(v_avatars), 'listing-images', to_jsonb(v_listing), 'post-images', to_jsonb(v_post),
    'kyc-documents', to_jsonb(v_kyc)));
end;
$$;
revoke all on function public.withdraw_internal(uuid, uuid, text, boolean) from public, anon, authenticated;

-- 本人の退会（service_role。サーバーが本人のログインを確かめてから呼ぶ）
create or replace function public.withdraw_account(p_user uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.admin_users a where a.user_id = p_user) then
    raise exception 'pantia:not_allowed' using errcode = '42501';
  end if;
  return public.withdraw_internal(p_user, null, p_reason, false);
end;
$$;
revoke all on function public.withdraw_account(uuid, text) from public, anon, authenticated;
grant execute on function public.withdraw_account(uuid, text) to service_role;

-- -----------------------------------------------------------------------------
-- 管理画面: 利用者
-- -----------------------------------------------------------------------------
create or replace function public.admin_set_user_status(p_admin uuid, p_user uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin(p_admin);
  if p_user = p_admin or p_status not in ('active', 'suspended') or char_length(coalesce(p_reason, '')) > 500 then
    raise exception 'pantia:bad_request' using errcode = '22023';
  end if;
  if p_status = 'suspended' then
    if not exists (select 1 from public.profiles where id = p_user and status = 'active') then
      raise exception 'pantia:bad_state';
    end if;
    perform public.suspend_internal(p_user, p_admin, p_reason);
  else
    update public.profiles set status = 'active' where id = p_user and status = 'suspended';
    if not found then
      raise exception 'pantia:bad_state';
    end if;
    insert into public.user_sanctions (user_id, kind, reason, admin_id) values (p_user, 'unsuspend', left(coalesce(p_reason, ''), 500), p_admin);
    perform public.audit(p_admin, 'user.unsuspend', 'user', p_user::text, '{}'::jsonb);
    perform public.notify(p_user, 'system', 'アカウントの利用停止を解除しました', '', '/mypage');
  end if;
end;
$$;
revoke all on function public.admin_set_user_status(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_set_user_status(uuid, uuid, text, text) to service_role;

create or replace function public.admin_warn_user(p_admin uuid, p_user uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin(p_admin);
  if char_length(btrim(coalesce(p_reason, ''))) not between 1 and 300
     or not exists (select 1 from public.profiles where id = p_user and status = 'active') then
    raise exception 'pantia:bad_request' using errcode = '22023';
  end if;
  insert into public.user_sanctions (user_id, kind, reason, admin_id) values (p_user, 'warning', btrim(p_reason), p_admin);
  perform public.notify(p_user, 'system', '運営からの警告', btrim(p_reason), '/terms');
  perform public.audit(p_admin, 'user.warn', 'user', p_user::text, jsonb_build_object('reason', left(btrim(p_reason), 200)));
end;
$$;
revoke all on function public.admin_warn_user(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_warn_user(uuid, uuid, text) to service_role;

-- 停止中の利用者を退会扱いにする（残高が残っていても行う。台帳は残る）
create or replace function public.admin_withdraw_user(p_admin uuid, p_user uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin(p_admin);
  if p_user = p_admin or not exists (select 1 from public.profiles where id = p_user and status = 'suspended') then
    raise exception 'pantia:bad_state';
  end if;
  return public.withdraw_internal(p_user, p_admin, p_reason, true);
end;
$$;
revoke all on function public.admin_withdraw_user(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_withdraw_user(uuid, uuid, text) to service_role;

-- -----------------------------------------------------------------------------
-- 管理画面: 出品
--   hidden = 運営が止めた（出品者は直せない）。published に戻すのは、内容がそろい出品者が公開中のときだけ
-- -----------------------------------------------------------------------------
create or replace function public.admin_set_listing_status(p_admin uuid, p_listing uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_l public.listings;
begin
  perform public.assert_admin(p_admin);
  if p_status not in ('published', 'private', 'hidden', 'deleted') then
    raise exception 'pantia:bad_request' using errcode = '22023';
  end if;
  select * into v_l from public.listings where id = p_listing for update;
  if not found or v_l.status in ('deleted', 'draft') or (v_l.status = 'sold' and p_status <> 'hidden' and p_status <> 'deleted') then
    raise exception 'pantia:bad_state';
  end if;
  if p_status = 'published' and not public.seller_is_public(v_l.seller_id) then
    raise exception 'pantia:bad_state';
  end if;
  update public.listings set status = p_status where id = p_listing;
  if p_status in ('hidden', 'deleted') then
    perform public.notify(v_l.seller_id, 'system', '出品が運営により非表示になりました',
      left(v_l.title || coalesce('：' || nullif(btrim(coalesce(p_reason, '')), ''), ''), 300), '/mypage/items');
  end if;
  perform public.audit(p_admin, 'listing.' || p_status, 'listing', p_listing::text,
    jsonb_build_object('title', v_l.title, 'reason', left(coalesce(p_reason, ''), 200)));
end;
$$;
revoke all on function public.admin_set_listing_status(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_set_listing_status(uuid, uuid, text, text) to service_role;

-- -----------------------------------------------------------------------------
-- 管理画面: 注文の取り消し（完了前まで）。支払い済みなら返金が要る印を付け、決済の情報を返す
-- -----------------------------------------------------------------------------
create or replace function public.admin_cancel_order(p_admin uuid, p_order uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o    public.orders;
  v_paid boolean;
begin
  perform public.assert_admin(p_admin);
  if char_length(btrim(coalesce(p_reason, ''))) not between 1 and 200 then
    raise exception 'pantia:bad_reason' using errcode = '22023';
  end if;
  select * into v_o from public.orders where id = p_order for update;
  if not found or v_o.status not in ('pending', 'paid', 'preparing', 'shipped') then
    raise exception 'pantia:bad_state';
  end if;
  v_paid := v_o.status <> 'pending';
  update public.orders
  set status = 'cancelled', cancelled_at = now(), cancel_reason = btrim(p_reason), needs_refund = v_paid
  where id = p_order;
  if v_paid then
    update public.listings set sales_count = greatest(sales_count - 1, 0),
           status = case when status = 'sold' then 'private' else status end
    where id = v_o.listing_id;
    update public.profiles set purchase_count = greatest(purchase_count - 1, 0) where id = v_o.buyer_id;
    perform public.notify(v_o.seller_id, 'order', '注文が運営によりキャンセルされました', '注文 #' || v_o.order_no || '　' || btrim(p_reason),
      '/orders/' || v_o.id::text);
    perform public.post_system_message(v_o.seller_id, v_o.buyer_id, 'system',
      '注文 #' || v_o.order_no || ' は運営によりキャンセルされました（全額返金）', v_o.id, v_o.listing_id);
  end if;
  perform public.notify(v_o.buyer_id, 'order', '注文がキャンセルされました',
    '注文 #' || v_o.order_no || case when v_paid then '。代金は全額返金します。' else '' end, '/orders/' || v_o.id::text);
  perform public.audit(p_admin, 'order.cancel', 'order', p_order::text,
    jsonb_build_object('order_no', v_o.order_no, 'reason', left(btrim(p_reason), 200), 'refund', v_paid));
  return jsonb_build_object('order_no', v_o.order_no, 'needs_refund', v_paid, 'payment_method', v_o.payment_method,
                            'payment_ref', v_o.payment_ref, 'total', v_o.total);
end;
$$;
revoke all on function public.admin_cancel_order(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_cancel_order(uuid, uuid, text) to service_role;

-- -----------------------------------------------------------------------------
-- 管理画面: 振込
-- -----------------------------------------------------------------------------
create or replace function public.admin_payout_pay(p_admin uuid, p_payout uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.payouts;
begin
  perform public.assert_admin(p_admin);
  update public.payouts set status = 'paid', decided_at = now(), decided_by = p_admin
  where id = p_payout and status = 'requested'
  returning * into v_p;
  if not found then
    raise exception 'pantia:bad_state';
  end if;
  perform public.notify(v_p.user_id, 'payout', '振込が完了しました', '¥' || v_p.net || '（' || v_p.bank_name || '）', '/mypage/sales');
  perform public.audit(p_admin, 'payout.pay', 'payout', p_payout::text, jsonb_build_object('payout_no', v_p.payout_no, 'amount', v_p.amount));
  return jsonb_build_object('user_id', v_p.user_id, 'amount', v_p.amount, 'net', v_p.net, 'bank_name', v_p.bank_name);
end;
$$;
revoke all on function public.admin_payout_pay(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_payout_pay(uuid, uuid) to service_role;

create or replace function public.admin_payout_reject(p_admin uuid, p_payout uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.payouts;
begin
  perform public.assert_admin(p_admin);
  if char_length(btrim(coalesce(p_reason, ''))) not between 1 and 200 then
    raise exception 'pantia:bad_reason' using errcode = '22023';
  end if;
  update public.payouts set status = 'rejected', reject_reason = btrim(p_reason), decided_at = now(), decided_by = p_admin
  where id = p_payout and status = 'requested'
  returning * into v_p;
  if not found then
    raise exception 'pantia:bad_state';
  end if;
  insert into public.ledger_entries (user_id, kind, amount, payout_id, note)
  values (v_p.user_id, 'payout_reversal', v_p.amount, v_p.id, '振込申請の取り消し');
  perform public.notify(v_p.user_id, 'payout', '振込申請を承認できませんでした', left(btrim(p_reason), 300) || '（残高に戻しました）', '/mypage/sales');
  perform public.audit(p_admin, 'payout.reject', 'payout', p_payout::text,
    jsonb_build_object('payout_no', v_p.payout_no, 'amount', v_p.amount, 'reason', left(btrim(p_reason), 200)));
end;
$$;
revoke all on function public.admin_payout_reject(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_payout_reject(uuid, uuid, text) to service_role;

-- 台帳の手動の調整（返金のあとの差し引きなど）
create or replace function public.admin_ledger_adjust(p_admin uuid, p_user uuid, p_amount integer, p_note text, p_order uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin(p_admin);
  if p_amount is null or p_amount = 0 or abs(p_amount) > 1000000 or char_length(btrim(coalesce(p_note, ''))) not between 1 and 100
     or not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'pantia:bad_request' using errcode = '22023';
  end if;
  insert into public.ledger_entries (user_id, kind, amount, order_id, note)
  values (p_user, case when p_order is not null and p_amount < 0 then 'refund_clawback' else 'adjustment' end, p_amount, p_order, btrim(p_note));
  perform public.audit(p_admin, 'ledger.adjust', 'user', p_user::text, jsonb_build_object('amount', p_amount, 'note', btrim(p_note)));
end;
$$;
revoke all on function public.admin_ledger_adjust(uuid, uuid, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_ledger_adjust(uuid, uuid, integer, text, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 管理画面: 通報・モデレーション
-- -----------------------------------------------------------------------------
create or replace function public.admin_report_update(p_admin uuid, p_report uuid, p_status text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_no bigint;
begin
  perform public.assert_admin(p_admin);
  if p_status not in ('open', 'reviewing', 'resolved', 'dismissed') or char_length(coalesce(p_note, '')) > 500 then
    raise exception 'pantia:bad_request' using errcode = '22023';
  end if;
  update public.reports
  set status = p_status, resolution_note = nullif(btrim(coalesce(p_note, '')), ''), handled_by = p_admin, handled_at = now()
  where id = p_report
  returning report_no into v_no;
  if v_no is null then
    raise exception 'pantia:bad_state';
  end if;
  perform public.audit(p_admin, 'report.' || p_status, 'report', p_report::text, jsonb_build_object('report_no', v_no));
end;
$$;
revoke all on function public.admin_report_update(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_report_update(uuid, uuid, text, text) to service_role;

-- 保留の承認・非表示（message / post / comment / review）
create or replace function public.admin_moderate(p_admin uuid, p_type text, p_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_new    text := case p_action when 'approve' then 'visible' when 'hide' then 'hidden' else null end;
  v_m      public.messages;
  v_r      public.reviews;
  v_t      public.threads;
  v_other  uuid;
  v_link   text;
begin
  perform public.assert_admin(p_admin);
  if v_new is null or p_type not in ('message', 'post', 'comment', 'review') then
    raise exception 'pantia:bad_request' using errcode = '22023';
  end if;
  if p_type = 'message' then
    select * into v_m from public.messages where id = p_id for update;
    if not found or v_m.kind in ('system', 'shipping') or v_m.status = v_new then
      raise exception 'pantia:bad_state';
    end if;
    update public.messages set status = v_new where id = p_id;
    if v_new = 'visible' then
      update public.threads set last_message_at = now(),
             last_message_preview = left(case v_m.kind when 'image' then '📷 画像 ' when 'item' then '🛍 商品 ' else '' end || v_m.body, 80)
      where id = v_m.thread_id
      returning * into v_t;
      -- 承認で相手に届いたので、相手に知らせる（send_message と同じ決まり: 通知 ON・ミュートでない・未読のお知らせが無い）
      v_other := case when v_m.sender_id = v_t.seller_id then v_t.buyer_id else v_t.seller_id end;
      v_link := '/messages/' || v_t.id::text;
      if exists (select 1 from public.profiles p where p.id = v_other and p.notify_message and p.status = 'active')
         and not (case when v_other = v_t.seller_id then v_t.seller_muted else v_t.buyer_muted end)
         and not exists (select 1 from public.notifications n
                         where n.user_id = v_other and n.kind = 'message' and n.link = v_link and n.read_at is null) then
        perform public.notify(v_other, 'message',
          public.san((select p.public_name from public.profiles p where p.id = v_m.sender_id)) || 'からメッセージ',
          left(v_t.last_message_preview, 100), v_link);
      end if;
    else
      -- 隠した文が会話一覧の「最後の文」に残らないよう、公開中の最新の文で置き直す
      update public.threads t
      set last_message_preview = coalesce((
            select left(case m.kind when 'image' then '📷 画像 ' when 'item' then '🛍 商品 ' else '' end || m.body, 80)
            from public.messages m
            where m.thread_id = t.id and m.status = 'visible'
            order by m.created_at desc, m.id desc
            limit 1), '')
      where t.id = v_m.thread_id;
    end if;
  elsif p_type = 'post' then
    select status into v_status from public.posts where id = p_id for update;
    if v_status is null or v_status = v_new then
      raise exception 'pantia:bad_state';
    end if;
    update public.posts set status = v_new, pinned = case when v_new = 'hidden' then false else pinned end where id = p_id;
  elsif p_type = 'comment' then
    select status into v_status from public.post_comments where id = p_id for update;
    if v_status is null or v_status = v_new then
      raise exception 'pantia:bad_state';
    end if;
    update public.post_comments set status = v_new where id = p_id;
  else
    select * into v_r from public.reviews where id = p_id for update;
    if not found or v_r.status = v_new then
      raise exception 'pantia:bad_state';
    end if;
    update public.reviews set status = v_new where id = p_id;
    update public.profiles
    set rating_sum = greatest(rating_sum + case when v_new = 'hidden' then -v_r.rating else v_r.rating end, 0),
        rating_count = greatest(rating_count + case when v_new = 'hidden' then -1 else 1 end, 0)
    where id = v_r.seller_id;
  end if;
  perform public.audit(p_admin, 'moderation.' || p_action, p_type, p_id::text, '{}'::jsonb);
end;
$$;
revoke all on function public.admin_moderate(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_moderate(uuid, text, uuid, text) to service_role;

-- -----------------------------------------------------------------------------
-- 管理画面: サイト設定（決まった項目だけ。知らない項目が来たら止める）
--   fee_rate は 0.150 のような小数で受ける（画面の % はサーバーで変換）
-- -----------------------------------------------------------------------------
create or replace function public.admin_update_settings(p_admin uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  perform public.assert_admin(p_admin);
  if jsonb_typeof(p_patch) <> 'object' then
    raise exception 'pantia:bad_request' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('fee_rate', 'anonymous_fee', 'min_payout', 'payout_fee', 'auto_complete_days', 'video_fee', 'extend_fee_per_day',
                     'registration_open', 'maintenance', 'notice', 'mail_order', 'mail_kyc', 'mail_payout', 'mod_spam_filter',
                     'forwarding_address') then
      raise exception 'pantia:bad_request' using errcode = '22023';
    end if;
  end loop;
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
    updated_by         = p_admin
  where s.id;
  perform public.audit(p_admin, 'settings.update', 'settings', 'site', p_patch);
end;
$$;
revoke all on function public.admin_update_settings(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_update_settings(uuid, jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- 集計: 管理画面のダッシュボード（日本時間の月で区切る）
-- -----------------------------------------------------------------------------
create or replace function public.admin_dashboard(p_admin uuid, p_months integer default 6)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz     text := 'Asia/Tokyo';
  v_month  timestamptz := date_trunc('month', now() at time zone v_tz) at time zone v_tz;
  v_prev   timestamptz := (date_trunc('month', now() at time zone v_tz) - interval '1 month') at time zone v_tz;
  v_months integer := least(greatest(coalesce(p_months, 6), 1), 24);
  v_out    jsonb;
begin
  perform public.assert_admin(p_admin);
  with paid as (
    select o.* from public.orders o where o.paid_at is not null and o.status <> 'cancelled'
  )
  select jsonb_build_object(
    'sales_month',       (select coalesce(sum(total), 0) from paid where paid_at >= v_month),
    'sales_prev',        (select coalesce(sum(total), 0) from paid where paid_at >= v_prev and paid_at < v_month),
    'fee_month',         (select coalesce(sum(fee + anonymous_fee), 0) from paid where paid_at >= v_month),
    'trades_month',      (select count(*) from paid where paid_at >= v_month),
    'trades_prev',       (select count(*) from paid where paid_at >= v_prev and paid_at < v_month),
    'trades_total',      (select count(*) from paid),
    'users_total',       (select count(*) from public.profiles where status <> 'withdrawn'),
    'users_month',       (select count(*) from public.profiles where created_at >= v_month),
    'sellers_month',     (select count(*) from public.profiles where created_at >= v_month and role = 'seller'),
    'buyers_month',      (select count(*) from public.profiles where created_at >= v_month and role = 'buyer'),
    'rating_avg',        (select round(avg(rating)::numeric, 2) from public.reviews where status = 'visible'),
    'reviews_total',     (select count(*) from public.reviews where status = 'visible'),
    'kyc_open',          (select count(*) from public.kyc_applications where status in ('pending', 'reviewing')),
    'reports_open',      (select count(*) from public.reports where status in ('open', 'reviewing')),
    'role_requests_open',(select count(*) from public.role_change_requests where status = 'pending'),
    'held_open',         (select (select count(*) from public.messages where status = 'held')
                               + (select count(*) from public.posts where status = 'held')
                               + (select count(*) from public.post_comments where status = 'held')),
    'refunds_open',      (select count(*) from public.orders where needs_refund),
    'payouts_open_sum',  (select coalesce(sum(amount), 0) from public.payouts where status = 'requested'),
    'payouts_open_n',    (select count(*) from public.payouts where status = 'requested'),
    'payouts_paid_sum',  (select coalesce(sum(amount), 0) from public.payouts where status = 'paid' and decided_at >= v_month),
    'payouts_paid_n',    (select count(*) from public.payouts where status = 'paid' and decided_at >= v_month),
    'monthly', (
      select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'sales', coalesce(s.amount, 0)) order by m), '[]'::jsonb)
      from generate_series(date_trunc('month', now() at time zone v_tz) - make_interval(months => v_months - 1),
                           date_trunc('month', now() at time zone v_tz), interval '1 month') m
      left join (
        select date_trunc('month', paid_at at time zone v_tz) as mm, sum(total) as amount from paid group by 1
      ) s on s.mm = m
    ),
    'categories', (
      select coalesce(jsonb_agg(jsonb_build_object('category', category, 'n', n, 'amount', amount) order by n desc), '[]'::jsonb)
      from (select category, count(*) as n, sum(total) as amount from paid where paid_at >= v_month group by category) c
    ),
    'new_users_week', (
      select coalesce(jsonb_agg(jsonb_build_object('day', to_char(d, 'YYYY-MM-DD'), 'n', coalesce(u.n, 0)) order by d), '[]'::jsonb)
      from generate_series((now() at time zone v_tz)::date - 6, (now() at time zone v_tz)::date, interval '1 day') d
      left join (
        select (created_at at time zone v_tz)::date as dd, count(*) as n from public.profiles
        where created_at >= now() - interval '8 days' group by 1
      ) u on u.dd = d::date
    ),
    'moderation_month', jsonb_build_object(
      'held',      (select count(*) from public.audit_logs where action = 'moderation.held' and created_at >= v_month),
      'approved',  (select count(*) from public.audit_logs where action = 'moderation.approve' and created_at >= v_month),
      'hidden',    (select count(*) from public.audit_logs where action in ('moderation.hide', 'listing.hidden', 'listing.deleted') and created_at >= v_month),
      'suspended', (select count(*) from public.audit_logs where action = 'user.suspend' and created_at >= v_month)
    )
  ) into v_out;
  return v_out;
end;
$$;
revoke all on function public.admin_dashboard(uuid, integer) from public, anon, authenticated;
grant execute on function public.admin_dashboard(uuid, integer) to service_role;

-- -----------------------------------------------------------------------------
-- 集計: 出品者のダッシュボード（本人）
--   売上は支払いが済んだ注文の小計（キャンセルを除く）。手数料後は seller_net
-- -----------------------------------------------------------------------------
create or replace function public.seller_stats(p_period text default 'month')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_tz    text := 'Asia/Tokyo';
  v_month timestamptz := date_trunc('month', now() at time zone v_tz) at time zone v_tz;
  v_prev  timestamptz := (date_trunc('month', now() at time zone v_tz) - interval '1 month') at time zone v_tz;
  v_unit  text := case when p_period in ('week', 'month', 'year') then p_period else 'month' end;
  v_out   jsonb;
begin
  if v_uid is null or not exists (select 1 from public.profiles where id = v_uid and role = 'seller') then
    raise exception 'pantia:not_allowed' using errcode = '42501';
  end if;
  with mine as (
    select o.* from public.orders o where o.seller_id = v_uid and o.paid_at is not null and o.status <> 'cancelled'
  )
  select jsonb_build_object(
    'sales_month',     (select coalesce(sum(subtotal), 0) from mine where paid_at >= v_month),
    'net_month',       (select coalesce(sum(seller_net), 0) from mine where paid_at >= v_month),
    'sales_prev',      (select coalesce(sum(subtotal), 0) from mine where paid_at >= v_prev and paid_at < v_month),
    'count_month',     (select count(*) from mine where paid_at >= v_month),
    'count_prev',      (select count(*) from mine where paid_at >= v_prev and paid_at < v_month),
    'sales_total',     (select coalesce(sum(subtotal), 0) from mine),
    'count_total',     (select count(*) from mine),
    'published',       (select count(*) from public.listings where seller_id = v_uid and status = 'published'),
    'published_same_day', (select count(*) from public.listings where seller_id = v_uid and status = 'published' and same_day),
    'listings_total',  (select count(*) from public.listings where seller_id = v_uid and status <> 'deleted'),
    'open_orders',     (select count(*) from public.orders where seller_id = v_uid and status in ('paid', 'preparing')),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object('label', lbl, 'sales', coalesce(s.amount, 0)) order by b), '[]'::jsonb)
      from (
        select b, case v_unit when 'week' then to_char(b, 'MM/DD') when 'month' then to_char(b, 'YYYY-MM') else to_char(b, 'YYYY') end as lbl
        from generate_series(
          case v_unit when 'week' then (now() at time zone v_tz)::date - 6
                      when 'month' then date_trunc('month', now() at time zone v_tz) - interval '6 months'
                      else date_trunc('year', now() at time zone v_tz) - interval '2 years' end,
          case v_unit when 'week' then (now() at time zone v_tz)::date::timestamp
                      when 'month' then date_trunc('month', now() at time zone v_tz)
                      else date_trunc('year', now() at time zone v_tz) end,
          case v_unit when 'week' then interval '1 day' when 'month' then interval '1 month' else interval '1 year' end
        ) b
      ) g
      left join (
        select date_trunc(case v_unit when 'week' then 'day' else v_unit end, paid_at at time zone v_tz) as bb, sum(subtotal) as amount
        from mine group by 1
      ) s on s.bb = g.b
    )
  ) into v_out;
  return v_out;
end;
$$;
revoke all on function public.seller_stats(text) from public, anon;
grant execute on function public.seller_stats(text) to authenticated;

-- -----------------------------------------------------------------------------
-- ランキング（直近7日の売れた数。公開中の出品者・出品だけ）
-- -----------------------------------------------------------------------------
create or replace function public.weekly_ranking(p_kind text default 'sellers', p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_since timestamptz := now() - interval '7 days';
begin
  if p_kind = 'listings' then
    return (
      select coalesce(jsonb_agg(r order by r.score desc, r.like_count desc), '[]'::jsonb)
      from (
        -- 点数はこの7日の分だけ（売れた数×3＋付いたお気に入り）。同点はこれまでのお気に入りの数で並べる
        select l.id, l.title, l.price, l.category, l.image_paths[1] as image_path, l.like_count, l.seller_id,
               s.public_name as seller_name, l.status,
               coalesce(wo.n, 0) * 3 + coalesce(wf.n, 0) as score
        from public.listings l
        join public.profiles s on s.id = l.seller_id
        left join (
          select o.listing_id, count(*) as n from public.orders o
          where o.paid_at >= v_since and o.status <> 'cancelled' and o.listing_id is not null
          group by o.listing_id
        ) wo on wo.listing_id = l.id
        left join (
          select f.listing_id, count(*) as n from public.favorites f where f.created_at >= v_since group by f.listing_id
        ) wf on wf.listing_id = l.id
        where l.status in ('published', 'sold') and not l.followers_only and public.seller_is_public(l.seller_id)
          and not public.is_blocked_with(l.seller_id)
        order by score desc, l.like_count desc
        limit v_limit
      ) r
    );
  end if;
  return (
    select coalesce(jsonb_agg(r order by r.n desc, r.rating desc), '[]'::jsonb)
    from (
      select p.id, p.public_name, p.avatar_path, p.age, p.occupation, p.sales_count, p.follower_count, p.last_seen_at,
             case when p.rating_count > 0 then round(p.rating_sum::numeric / p.rating_count, 1) else 0 end as rating,
             p.rating_count,
             (select count(*) from public.orders o where o.seller_id = p.id and o.paid_at >= v_since and o.status <> 'cancelled') as n
      from public.profiles p
      where p.role = 'seller' and p.status = 'active' and p.kyc_status = 'approved' and not public.is_blocked_with(p.id)
      order by n desc, rating desc, p.sales_count desc
      limit v_limit
    ) r
  );
end;
$$;
revoke all on function public.weekly_ranking(text, integer) from public;
grant execute on function public.weekly_ranking(text, integer) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 掃除（cron。service_role だけ）。保存期間（28 §P3・SECURITY.md）
--   お届け先: 取引の終了から90日 / 読んだお知らせ: 90日 / 回数計: 期限切れ / 送信記録: 180日
--   決済の受信記録: 400日 / 監査ログ: 2年 / カート: 90日
--   戻り値の kyc_purge は、判定から7日たっても消えていない書類（サーバーが消して kyc_mark_purged を呼ぶ）
-- -----------------------------------------------------------------------------
create or replace function public.cleanup_retention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_addr  integer;
  v_notif integer;
  v_rate  integer;
  v_mail  integer;
  v_pay   integer;
  v_audit integer;
  v_cart  integer;
begin
  delete from public.order_addresses a using public.orders o
  where o.id = a.order_id and o.status in ('completed', 'cancelled')
    and coalesce(o.completed_at, o.cancelled_at) < now() - interval '90 days' and not o.needs_refund;
  get diagnostics v_addr = row_count;
  delete from public.notifications where (read_at is not null and created_at < now() - interval '90 days') or created_at < now() - interval '1 year';
  get diagnostics v_notif = row_count;
  delete from public.rate_limit_hits where expires_at < now() - interval '1 day';
  get diagnostics v_rate = row_count;
  delete from public.mail_outbox where created_at < now() - interval '180 days';
  get diagnostics v_mail = row_count;
  delete from public.payment_events where received_at < now() - interval '400 days';
  get diagnostics v_pay = row_count;
  delete from public.audit_logs where created_at < now() - interval '2 years';
  get diagnostics v_audit = row_count;
  delete from public.cart_items where added_at < now() - interval '90 days';
  get diagnostics v_cart = row_count;
  return jsonb_build_object(
    'order_addresses', v_addr, 'notifications', v_notif, 'rate_limit_hits', v_rate, 'mail_outbox', v_mail,
    'payment_events', v_pay, 'audit_logs', v_audit, 'cart_items', v_cart,
    'kyc_purge', (
      select coalesce(jsonb_agg(jsonb_build_object('app_id', k.id, 'paths', to_jsonb(k.document_paths))), '[]'::jsonb)
      from (
        select id, document_paths from public.kyc_applications
        where status in ('approved', 'rejected') and documents_purged_at is null and decided_at < now() - interval '7 days'
        order by decided_at limit 100
      ) k
    )
  );
end;
$$;
revoke all on function public.cleanup_retention() from public, anon, authenticated;
grant execute on function public.cleanup_retention() to service_role;
