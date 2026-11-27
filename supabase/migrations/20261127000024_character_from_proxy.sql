-- =============================================================================
-- 0024 character from proxy — 代理登録で作った人も、理由のメモを残してキャラにできる
-- -----------------------------------------------------------------------------
-- 2026-11-27 に決めた。0017 の「代理登録の人には付けない」を改める
--   ・代理登録（0010・0013）の人にも、管理者が「キャラにする」を使える。運営が自分で切り替えるため
--   ・代理登録の人をキャラにするときは、理由のメモが必須（空・空白だけは pantia:bad_reason）
--   ・それ以外の条件は 0017 と同じ。売手・利用中・本人確認が未提出か済み・管理者でも自分でもない・印がまだ無い
--   ・本人に渡し済み（handed_over_at あり）でも DB では止めない。本人から頼まれた代理登録の人に使わないことは、画面の確認の文で伝える
--   ・代理登録の行（proxy_registrations）は触らない。「キャラを外す」（admin_unmark_character）も印だけを消す
--   ・記録 user.character_mark の detail を {note, from_proxy} にする（ふつうの売手は from_proxy = false）
--   ・「キャラを新しく作る」（0020 の admin_create_character）は変えない。作ってすぐの売手だけで、代理登録の人は通さない
-- =============================================================================

create or replace function public.admin_mark_character(p_admin uuid, p_user uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p     public.profiles;
  v_note  text := btrim(regexp_replace(coalesce(p_note, ''), '[[:cntrl:]]', ' ', 'g'));
  v_proxy boolean;
begin
  perform public.assert_admin(p_admin);
  if p_user is null or p_user = p_admin or char_length(v_note) > 200
     or exists (select 1 from public.admin_users a where a.user_id = p_user) then
    raise exception 'pantia:bad_request' using errcode = '22023';
  end if;
  select * into v_p from public.profiles where id = p_user for update;
  if not found or v_p.role <> 'seller' or v_p.status <> 'active' then
    raise exception 'pantia:bad_state';
  end if;
  -- 本人確認を出した人（審査中・却下）は断る。印を付けると書類なしで「確認済み」になる
  if v_p.kyc_status not in ('unsubmitted', 'approved') then
    raise exception 'pantia:bad_state';
  end if;
  if exists (select 1 from public.character_accounts c where c.user_id = p_user) then
    raise exception 'pantia:bad_state';
  end if;
  -- 代理登録の人は、キャラにする理由を残す（全角の空白だけのメモも空とみなす）
  v_proxy := exists (select 1 from public.proxy_registrations x where x.user_id = p_user);
  if v_proxy and regexp_replace(v_note, '[[:space:]　]+', '', 'g') = '' then
    raise exception 'pantia:bad_reason' using errcode = '22023';
  end if;
  insert into public.character_accounts (user_id, note, marked_by) values (p_user, v_note, p_admin);
  if v_p.kyc_status <> 'approved' then
    update public.profiles set kyc_status = 'approved' where id = p_user;
    perform public.audit(p_admin, 'kyc.character_skip', 'user', p_user::text,
      jsonb_build_object('from', v_p.kyc_status));
  end if;
  perform public.audit(p_admin, 'user.character_mark', 'user', p_user::text,
    jsonb_build_object('note', v_note, 'from_proxy', v_proxy));
end;
$$;
revoke all on function public.admin_mark_character(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_mark_character(uuid, uuid, text) to service_role;
