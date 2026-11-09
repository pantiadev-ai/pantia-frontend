-- =============================================================================
-- 0014 profile photos / admin edit — プロフィール写真（最大6枚）と、管理者によるプロフィールの編集
-- -----------------------------------------------------------------------------
-- 決まり
--   ・プロフィール写真は「本人の id/<uuid>.webp」だけ・重複なし・最大6枚（他人の画像を指させない。28 §A8-2）
--     画面で出すのは出品者だけ。列の権限は avatar_path・cover_path と同じに渡す
--   ・退会したら、写真も置き場から消す対象に入れ、列は空にする
--   ・管理者がプロフィールを直すのは admin_update_profile だけ（service_role。サーバーが管理者を確かめてから呼ぶ）
--     理由は1〜500字で必須。自分自身・退会済みの人は直せない。出品者でなければ、呼び名・自己紹介・アイコンだけを書く
--     戻り値は、外れて使われなくなった画像のパス（サーバーが置き場から消す）
-- =============================================================================

alter table public.profiles add column photo_paths text[] not null default '{}';
alter table public.profiles add constraint profiles_photo_paths_ok check (public.paths_ok(photo_paths, id, 6));

grant select (photo_paths) on public.profiles to anon, authenticated;
grant update (photo_paths) on public.profiles to authenticated;

-- -----------------------------------------------------------------------------
-- 退会（0006 の作り直し。写真を消す対象に足し、列を空にする。ほかは同じ）
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

  v_avatars := array_remove(array[v_p.avatar_path, v_p.cover_path], null) || coalesce(v_p.photo_paths, '{}');
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
  set status = 'withdrawn', nickname = '退会したユーザー', bio = '', avatar_path = null, cover_path = null, photo_paths = '{}',
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

-- -----------------------------------------------------------------------------
-- 管理者によるプロフィールの編集。値の形（字数・範囲・選べる値）は列の check が止める
-- -----------------------------------------------------------------------------
create or replace function public.admin_update_profile(
  p_admin uuid, p_user uuid, p_nickname text, p_bio text, p_avatar_path text, p_cover_path text, p_photo_paths text[],
  p_age integer, p_occupation text, p_height_cm integer, p_body_type text, p_ship_estimate text,
  p_supported_options text[], p_ng_note text, p_accept_messages boolean, p_reason text)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason  text := btrim(coalesce(p_reason, ''));
  v_photos  text[] := coalesce(p_photo_paths, '{}');
  v_old     public.profiles;
  v_new     public.profiles;
  v_keep    text[];
  v_purge   text[];
  v_changed text[];
begin
  perform public.assert_admin(p_admin);
  if p_user is null or p_user = p_admin or char_length(v_reason) not between 1 and 500
     or not public.paths_ok(array_remove(array[p_avatar_path], null), p_user, 1)
     or not public.paths_ok(array_remove(array[p_cover_path], null), p_user, 1)
     or not public.paths_ok(v_photos, p_user, 6) then
    raise exception 'pantia:bad_request' using errcode = '22023';
  end if;
  select * into v_old from public.profiles where id = p_user for update;
  if not found or v_old.status = 'withdrawn' then
    raise exception 'pantia:bad_state';
  end if;

  if v_old.role = 'seller' then
    update public.profiles
    set nickname = p_nickname, bio = coalesce(p_bio, ''), avatar_path = p_avatar_path, cover_path = p_cover_path,
        photo_paths = v_photos, age = p_age, occupation = p_occupation, height_cm = p_height_cm, body_type = p_body_type,
        ship_estimate = p_ship_estimate, supported_options = coalesce(p_supported_options, '{}'),
        ng_note = coalesce(p_ng_note, ''), accept_messages = coalesce(p_accept_messages, true)
    where id = p_user
    returning * into v_new;
  else
    update public.profiles
    set nickname = p_nickname, bio = coalesce(p_bio, ''), avatar_path = p_avatar_path
    where id = p_user
    returning * into v_new;
  end if;

  v_keep := array_remove(array[v_new.avatar_path, v_new.cover_path], null) || v_new.photo_paths;
  select coalesce(array_agg(x), '{}') into v_purge
  from unnest(array_remove(array[v_old.avatar_path, v_old.cover_path], null) || v_old.photo_paths) x
  where not (x = any (v_keep));

  v_changed := array_remove(array[
    case when v_new.nickname is distinct from v_old.nickname then 'nickname' end,
    case when v_new.bio is distinct from v_old.bio then 'bio' end,
    case when v_new.avatar_path is distinct from v_old.avatar_path then 'avatar' end,
    case when v_new.cover_path is distinct from v_old.cover_path then 'cover' end,
    case when v_new.photo_paths is distinct from v_old.photo_paths then 'photos' end,
    case when v_new.age is distinct from v_old.age then 'age' end,
    case when v_new.occupation is distinct from v_old.occupation then 'occupation' end,
    case when v_new.height_cm is distinct from v_old.height_cm then 'height' end,
    case when v_new.body_type is distinct from v_old.body_type then 'body_type' end,
    case when v_new.ship_estimate is distinct from v_old.ship_estimate then 'ship_estimate' end,
    case when v_new.supported_options is distinct from v_old.supported_options then 'supported_options' end,
    case when v_new.ng_note is distinct from v_old.ng_note then 'ng_note' end,
    case when v_new.accept_messages is distinct from v_old.accept_messages then 'accept_messages' end
  ], null);

  perform public.audit(p_admin, 'user.profile_edit', 'user', p_user::text,
    jsonb_build_object('reason', left(v_reason, 500), 'changed', to_jsonb(v_changed)));
  return v_purge;
end;
$$;
revoke all on function public.admin_update_profile(uuid, uuid, text, text, text, text, text[], integer, text, integer, text, text, text[], text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.admin_update_profile(uuid, uuid, text, text, text, text, text[], integer, text, integer, text, text, text[], text, boolean, text)
  to service_role;

-- -----------------------------------------------------------------------------
-- seller_listing_option_flags: 出品者の公開中の出品で選ばれている対応オプションの印を、まとめて1行で返す
--   出品者のページの「対応オプション」に、プロフィールの物と一緒に出す。件数に関わらず全部の出品を見る
--   （新しい順に200件だけ読むと、古い出品の印が落ちた）
--   呼んだ人の権限で動く（security invoker）ので、見られない出品（フォロワー限定・ブロック）の印は数えない
--   request_only（リクエストを受けた人だけが買える）は購入の制限で、対応オプションではないので返さない
-- -----------------------------------------------------------------------------
create or replace function public.seller_listing_option_flags(p_seller uuid)
returns table (
  opt_photo    boolean,
  opt_extend   boolean,
  same_day     boolean,
  anonymous_ok boolean,
  opt_letter   boolean,
  opt_video    boolean,
  opt_ziplock  boolean,
  opt_card     boolean
)
language sql
stable
set search_path = ''
as $$
  select
    coalesce(bool_or(l.opt_photo), false),
    coalesce(bool_or(l.opt_extend), false),
    coalesce(bool_or(l.same_day), false),
    coalesce(bool_or(l.anonymous_ok), false),
    coalesce(bool_or(l.opt_letter), false),
    coalesce(bool_or(l.opt_video), false),
    coalesce(bool_or(l.opt_ziplock), false),
    coalesce(bool_or(l.opt_card), false)
  from public.listings l
  where l.seller_id = p_seller
    and l.status = 'published';
$$;
revoke all on function public.seller_listing_option_flags(uuid) from public;
grant execute on function public.seller_listing_option_flags(uuid) to anon, authenticated;
