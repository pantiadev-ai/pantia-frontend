-- =============================================================================
-- 0013 proxy_skip_kyc — 代理登録した人は、本人確認を省いて確認済みにする
-- -----------------------------------------------------------------------------
--   2026-11-07 に決めた。運営が本人に頼まれて代わりに登録した人は、本人確認の書類と審査の工程を省き、
--   登録した時点で kyc_status を 'approved' にする（0010 の「本人確認は省かない」を改める）。
--   年齢は、登録のときの本人の申告（出品者は年齢・18歳以上の印）で受ける。
--
--   1. admin_proxy_register: 代理登録の印を付けるのと同時に、確認済みにし、省いたことを記録に残す（kyc.proxy_skip）
--   2. admin_proxy_submit_kyc: 本人確認を代理で出す道は使わなくなったので消す
--      （過去に出した申請と kyc_applications.submitted_by・記録の kyc.proxy_submit は残す）
--   3. これまでに代理登録した人のうち、利用中で本人確認が未提出の人を確認済みにする（記録の actor は null・backfill の印）。
--      審査中・却下（18歳未満で止めた人を含む）の人は変えない
-- =============================================================================

-- 1. 代理登録の印を付ける。auth.admin.createUser で作った直後に呼ぶ（中の確かめは 0010 と同じ）
create or replace function public.admin_proxy_register(p_admin uuid, p_user uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
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
  if not found or v_p.status <> 'active' or v_p.kyc_status <> 'unsubmitted'
     or v_p.created_at < now() - interval '10 minutes'
     or exists (select 1 from auth.users u where u.id = p_user and u.last_sign_in_at is not null)
     or exists (select 1 from public.proxy_registrations r where r.user_id = p_user) then
    raise exception 'pantia:bad_state';
  end if;
  insert into public.proxy_registrations (user_id, registered_by, note) values (p_user, p_admin, v_note);
  update public.profiles set kyc_status = 'approved' where id = p_user;
  perform public.audit(p_admin, 'user.proxy_register', 'user', p_user::text, jsonb_build_object('role', v_p.role));
  perform public.audit(p_admin, 'kyc.proxy_skip', 'user', p_user::text, '{}'::jsonb);
end;
$$;
revoke all on function public.admin_proxy_register(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_proxy_register(uuid, uuid, text) to service_role;

-- 2. 本人確認の代理提出は無くした
drop function public.admin_proxy_submit_kyc(uuid, uuid, text, text[], date);

-- 3. これまでに代理登録した人（利用中・未提出だけ）
with done as (
  update public.profiles p set kyc_status = 'approved'
  from public.proxy_registrations r
  where r.user_id = p.id and p.status = 'active' and p.kyc_status = 'unsubmitted'
  returning p.id
)
insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
select null, 'kyc.proxy_skip', 'user', d.id::text, '{"backfill": true}'::jsonb from done d;
