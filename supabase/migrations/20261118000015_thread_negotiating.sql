-- =============================================================================
-- 0015 thread negotiating — 会話の「交渉中」の札
-- -----------------------------------------------------------------------------
-- 決まり
--   ・札は会話（threads）1つに1つ。付け外しできるのは、その会話の売手だけ
--   ・付け外しは set_thread_negotiating だけ。threads の update の権限は今までどおり渡さない
--   ・付け外しで last_message_at（会話の並び）と未読の数は変わらない
--   ・2人とも my_threads() の negotiating で札を見る
-- =============================================================================

alter table public.threads add column negotiating boolean not null default false;

-- 交渉中の札を付ける／外す（売手だけ）。戻り値は付け外しのあとの値
create or replace function public.set_thread_negotiating(p_thread uuid, p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new boolean;
begin
  if p_on is null then
    raise exception 'pantia:bad_request' using errcode = '22023';
  end if;
  update public.threads set negotiating = p_on
  where id = p_thread and seller_id = (select auth.uid())
  returning negotiating into v_new;
  if not found then
    raise exception 'pantia:forbidden' using errcode = '42501';
  end if;
  return v_new;
end;
$$;
revoke all on function public.set_thread_negotiating(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_thread_negotiating(uuid, boolean) to authenticated;

-- 会話の一覧に negotiating を足す（戻りの形が変わるので作り直す。中身は 0005 のまま）
drop function public.my_threads();
create function public.my_threads()
returns table (
  thread_id uuid, other_id uuid, other_name text, other_avatar text, other_role text, other_last_seen timestamptz,
  other_verified boolean, last_message_at timestamptz, preview text, unread integer, muted boolean, other_read_at timestamptz,
  negotiating boolean
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
         case when t.seller_id = (select auth.uid()) then t.buyer_last_read_at else t.seller_last_read_at end,
         t.negotiating
  from public.threads t
  left join public.profiles o on o.id = case when t.seller_id = (select auth.uid()) then t.buyer_id else t.seller_id end
  where t.seller_id = (select auth.uid()) or t.buyer_id = (select auth.uid())
  order by t.last_message_at desc
  limit 200;
$$;
revoke all on function public.my_threads() from public, anon;
grant execute on function public.my_threads() to authenticated;
