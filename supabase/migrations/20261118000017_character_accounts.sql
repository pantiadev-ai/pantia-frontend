-- =============================================================================
-- 0017 character accounts — キャラ（運営で入れた売手）の印と、管理画面からキャラの名前で出す出品
-- -----------------------------------------------------------------------------
-- 決まり
--   ・キャラは、運営のメールでふつうに登録した「売手」のアカウント。管理者が印を付ける
--   ・印（メモ・付けた人）は character_accounts に置く。読めるのは service_role（管理画面）だけで、書けるのは関数だけ
--   ・印を付けたら本人確認を済みにする（キャラは運営そのもので、書類を出す相手がいない）。省いた記録 kyc.character_skip を残す
--   ・管理者は、印のあるキャラの名前で出品を作れる（下書きか公開）。編集・非公開・削除は、キャラでログインしてふつうの売手の道で行う
--   ・出品の中身は saveListing と同じ26列だけを受ける。名義・状態・数・公開日は関数が決める
--   ・写真はキャラのフォルダの物だけ（listings の paths_ok の制約がそのまま効く）
--   ・印を外しても、本人確認と出していた出品はそのまま
--   ・代理登録（0010・0013）とは別の表。「渡したら本人の物」の決まりは変えない
--   ・公開の画面にキャラかどうかを出さない（表は利用者から読めない）
-- =============================================================================

create table public.character_accounts (
  user_id   uuid primary key references public.profiles (id) on delete cascade,
  note      text not null default '' check (char_length(note) <= 200),
  marked_by uuid not null references public.profiles (id),
  marked_at timestamptz not null default now()
);
alter table public.character_accounts enable row level security;
revoke all on public.character_accounts from anon, authenticated;
revoke insert, update, delete, truncate on public.character_accounts from service_role;

-- キャラの印を付ける（管理者だけ）
create or replace function public.admin_mark_character(p_admin uuid, p_user uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.profiles;
  v_note text := btrim(regexp_replace(coalesce(p_note, ''), '[[:cntrl:]]', ' ', 'g'));
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
  if exists (select 1 from public.character_accounts c where c.user_id = p_user) then
    raise exception 'pantia:bad_state';
  end if;
  insert into public.character_accounts (user_id, note, marked_by) values (p_user, v_note, p_admin);
  if v_p.kyc_status <> 'approved' then
    update public.profiles set kyc_status = 'approved' where id = p_user;
    perform public.audit(p_admin, 'kyc.character_skip', 'user', p_user::text,
      jsonb_build_object('from', v_p.kyc_status));
  end if;
  perform public.audit(p_admin, 'user.character_mark', 'user', p_user::text, jsonb_build_object('note', v_note));
end;
$$;
revoke all on function public.admin_mark_character(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_mark_character(uuid, uuid, text) to service_role;

-- キャラの印を外す（管理者だけ）。本人確認と出品は触らない
create or replace function public.admin_unmark_character(p_admin uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin(p_admin);
  delete from public.character_accounts where user_id = p_user;
  if not found then
    raise exception 'pantia:bad_state';
  end if;
  perform public.audit(p_admin, 'user.character_unmark', 'user', p_user::text, '{}'::jsonb);
end;
$$;
revoke all on function public.admin_unmark_character(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_unmark_character(uuid, uuid) to service_role;

-- キャラの名前で出品を作る（管理者だけ）。戻り値は出品の id
--   p_row は saveListing の row と同じ26列。列を1つずつ選んで入れる（受け取った jsonb をそのまま入れない）
--   definer の中なので listings_guard は公開日を入れるだけ。数は列の既定（0）のまま
create or replace function public.admin_create_character_listing(p_admin uuid, p_seller uuid, p_row jsonb, p_publish boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_publish boolean := coalesce(p_publish, false);
  v_id uuid;
begin
  perform public.assert_admin(p_admin);
  if p_row is null or jsonb_typeof(p_row) <> 'object' then
    raise exception 'pantia:bad_request' using errcode = '22023';
  end if;
  -- 印を外す操作と同時に走っても、印のあるうちにだけ作る
  perform 1 from public.character_accounts c where c.user_id = p_seller for share;
  if not found then
    raise exception 'pantia:bad_state';
  end if;
  if v_publish and not public.seller_is_public(p_seller) then
    raise exception 'pantia:bad_state';
  end if;

  insert into public.listings (
    seller_id, status,
    title, description, category, worn_days, material, color, size, price, stock_mode,
    opt_photo, opt_letter, opt_ziplock, opt_card, opt_video, opt_extend, max_worn_days, request_only,
    same_day, anonymous_ok, pre_message_ok, followers_only, cool_shipping, ship_estimate, ng_note,
    paid_options, image_paths
  )
  select
    p_seller, case when v_publish then 'published' else 'draft' end,
    r.title, r.description, r.category, r.worn_days, r.material, r.color, r.size, r.price, r.stock_mode,
    r.opt_photo, r.opt_letter, r.opt_ziplock, r.opt_card, r.opt_video, r.opt_extend, r.max_worn_days, r.request_only,
    r.same_day, r.anonymous_ok, r.pre_message_ok, r.followers_only, r.cool_shipping, r.ship_estimate, r.ng_note,
    r.paid_options, r.image_paths
  from jsonb_populate_record(null::public.listings, p_row) r
  returning id into v_id;

  perform public.audit(p_admin, 'listing.character_create', 'listing', v_id::text,
    jsonb_build_object('seller_id', p_seller, 'title', left(coalesce(p_row ->> 'title', ''), 60),
                       'status', case when v_publish then 'published' else 'draft' end));
  return v_id;
end;
$$;
revoke all on function public.admin_create_character_listing(uuid, uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.admin_create_character_listing(uuid, uuid, jsonb, boolean) to service_role;
