-- =============================================================================
-- 0019 listing published_at — 運営が出品日を変える
-- -----------------------------------------------------------------------------
-- 決まり
--   ・変えるのは published_at だけ。商品ページの「出品日」と新着順の並びが変わる
--   ・フォロワーへの知らせは出し直さない（listings_announce は status の変更でしか動かない）
--   ・下書き（まだ一度も公開していない物）と削除済みは変えない（bad_state）
--   ・公開中・売り切れ・非公開・運営の非表示は変えられる
--   ・今より先（時計のずれに5分の猶予）、2000-01-01 0:00 JST より前、空は断る（bad_request）。打ち間違いを止めるため
--   ・記録は listing.published_at（題名・元の日時・新しい日時）
-- =============================================================================

create or replace function public.admin_set_listing_published_at(p_admin uuid, p_listing uuid, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_l public.listings;
begin
  perform public.assert_admin(p_admin);
  if p_at is null
     or p_at > now() + interval '5 minutes'
     or p_at < timestamptz '2000-01-01 00:00:00+09' then
    raise exception 'pantia:bad_request' using errcode = '22023';
  end if;
  select * into v_l from public.listings where id = p_listing for update;
  if not found then
    raise exception 'pantia:bad_request' using errcode = '22023';
  end if;
  if v_l.status = 'deleted' or v_l.published_at is null then
    raise exception 'pantia:bad_state';
  end if;
  update public.listings set published_at = p_at where id = p_listing;
  perform public.audit(p_admin, 'listing.published_at', 'listing', p_listing::text,
    jsonb_build_object('title', v_l.title, 'from', v_l.published_at, 'to', p_at));
end;
$$;
revoke all on function public.admin_set_listing_published_at(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_set_listing_published_at(uuid, uuid, timestamptz) to service_role;
