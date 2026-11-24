-- =============================================================================
-- 0020 character create — キャラを最初から作る（管理画面の「キャラを新しく作る」）
-- -----------------------------------------------------------------------------
-- 決まり
--   ・管理画面で名前とメールを入れると、売手のアカウントを作り（auth.admin.createUser）、すぐこの関数で印を付ける
--   ・作れるのは代理登録（0013）と同じ「作ってすぐの売手」だけ。未提出・作ってから10分以内・一度もログインしていない・
--     代理登録でも印でもない。古いアカウントや本物の売手を、この道でキャラにはしない
--   ・印は character_accounts に created_via = 'create' で入れる。これまでの「キャラにする」（0017）は 'mark'
--   ・本人確認は済みにする（キャラは運営そのもの）。省いた記録 kyc.character_skip を残す（0017 と同じ名前）
--   ・代理登録の台帳（proxy_registrations）には入れない。代理登録の人は 0017 のとおりキャラにできない
--   ・パスワードは運営がリンクを開いて決める（代理登録と同じ作り）。リンクを作った回数と時刻だけを残し、リンクそのものは残さない
--   ・リンクを作れるのは、この道で作り、まだパスワードを決めていない、止めていないキャラだけ
--   ・パスワードを決めたら password_set_at を入れる（1回だけ。記録の actor は本人）
--   ・表は今までどおり service_role が読むだけ。書けるのは関数だけ
-- =============================================================================

alter table public.character_accounts
  add column created_via text not null default 'mark' check (created_via in ('mark', 'create')),
  add column password_set_at timestamptz,
  add column link_issued_at timestamptz,
  add column link_issue_count integer not null default 0 check (link_issue_count >= 0);

-- キャラを最初から作る（管理者だけ）。auth.admin.createUser で売手を作った直後に呼ぶ
create or replace function public.admin_create_character(p_admin uuid, p_user uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p    public.profiles;
  v_note text := btrim(regexp_replace(coalesce(p_note, ''), '[[:cntrl:]]', ' ', 'g'));
begin
  perform public.assert_admin(p_admin);
  if p_user is null or p_user = p_admin or char_length(v_note) > 200
     or exists (select 1 from public.admin_users a where a.user_id = p_user) then
    raise exception 'pantia:bad_request' using errcode = '22023';
  end if;
  select * into v_p from public.profiles where id = p_user for update;
  -- 作ってすぐの売手だけ（0013 の代理登録と同じ条件）
  if not found or v_p.role <> 'seller' or v_p.status <> 'active' or v_p.kyc_status <> 'unsubmitted'
     or v_p.created_at < now() - interval '10 minutes'
     or exists (select 1 from auth.users u where u.id = p_user and u.last_sign_in_at is not null)
     or exists (select 1 from public.proxy_registrations r where r.user_id = p_user)
     or exists (select 1 from public.character_accounts c where c.user_id = p_user) then
    raise exception 'pantia:bad_state';
  end if;
  insert into public.character_accounts (user_id, note, marked_by, created_via) values (p_user, v_note, p_admin, 'create');
  update public.profiles set kyc_status = 'approved' where id = p_user;
  perform public.audit(p_admin, 'kyc.character_skip', 'user', p_user::text, jsonb_build_object('from', v_p.kyc_status));
  perform public.audit(p_admin, 'user.character_create', 'user', p_user::text, jsonb_build_object('note', v_note));
end;
$$;
revoke all on function public.admin_create_character(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_create_character(uuid, uuid, text) to service_role;

-- パスワードを決めるリンクを作った記録（管理者だけ）。戻り値は何回目か。リンクそのものは受け取らない
create or replace function public.admin_character_link_issued(p_admin uuid, p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  perform public.assert_admin(p_admin);
  update public.character_accounts c
  set link_issued_at = now(), link_issue_count = c.link_issue_count + 1
  where c.user_id = p_user and c.created_via = 'create' and c.password_set_at is null
    and exists (select 1 from public.profiles p where p.id = c.user_id and p.status = 'active')
  returning c.link_issue_count into v_n;
  if not found then
    raise exception 'pantia:bad_state';
  end if;
  perform public.audit(p_admin, 'user.character_link', 'user', p_user::text, jsonb_build_object('count', v_n));
  return v_n;
end;
$$;
revoke all on function public.admin_character_link_issued(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_character_link_issued(uuid, uuid) to service_role;

-- パスワードを決めた印（本人がパスワードを決めたとき、サーバーから呼ぶ）。印が付いたら true、何もしなければ false
create or replace function public.character_mark_password_set(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.character_accounts set password_set_at = now()
  where user_id = p_user and password_set_at is null;
  if not found then
    return false;
  end if;
  perform public.audit(p_user, 'user.character_password', 'user', p_user::text, '{}'::jsonb);
  return true;
end;
$$;
revoke all on function public.character_mark_password_set(uuid) from public, anon, authenticated;
grant execute on function public.character_mark_password_set(uuid) to service_role;
