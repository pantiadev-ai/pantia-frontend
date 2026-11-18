-- =============================================================================
-- 0016 manual sold — 管理者が付けて戻せる「売り切れ」
-- -----------------------------------------------------------------------------
-- 決まり
--   ・付けられるのは公開・非公開の出品だけ。外から見ると、ふつうの売り切れと同じ（listings.status = 'sold'）
--   ・本当の売上ではないので sales_count には数えない
--   ・印（元の状態・理由・付けた人）は listing_manual_sold に置く。読めるのは service_role（管理画面）だけで、書けるのは関数だけ
--   ・在庫1点で入金待ちの注文がある物には付けない（入金されると本当の売り切れになるため）
--   ・戻すと元の状態に戻る。元が公開でも、売手がいま公開できない（停止中・本人確認が切れた等）なら非公開に戻す
--   ・入金済みの注文がある物（本当に売れた物）は戻せない
--   ・status が sold から別の物に変わったら、印は trigger で消す（運営の非表示・出品者の削除・戻す、のどれでも）
--   ・admin_set_listing_status（0006）は変えない。sold を受けない決まりのまま
--   ・付けるときは、遅れて入金されうる注文（入金待ち・期限切れで未入金の取り消し）の行を、出品より先にロックする。
--     mark_group_paid（0011）は出品をロックせずに状態を読むので、押さえないと「売り切れの確定前に読んだ遅れた入金」が
--     注文を生き返らせ、手動の売り切れに入金済みの注文が付く。順番は mark_group_paid と同じ「注文が先、出品があと」
--   ・在庫が複数の物は入金済みの注文があっても付けられる。その注文を売手・運営が取り消しても（seller_cancel_order・
--     admin_cancel_order）、印があれば sold のままにする。2つの関数はその1点だけ変えて作り直す（ほかは 0004・0006 のまま）
-- =============================================================================

create table public.listing_manual_sold (
  listing_id  uuid primary key references public.listings (id) on delete cascade,
  prev_status text not null check (prev_status in ('published', 'private')),
  reason      text not null default '' check (char_length(reason) <= 200),
  marked_by   uuid not null references public.profiles (id),
  marked_at   timestamptz not null default now()
);
alter table public.listing_manual_sold enable row level security;
revoke all on public.listing_manual_sold from anon, authenticated;
revoke insert, update, delete, truncate on public.listing_manual_sold from service_role;

-- 売り切れの印を付ける（管理者だけ）
create or replace function public.admin_mark_sold(p_admin uuid, p_listing uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_l public.listings;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  perform public.assert_admin(p_admin);
  if char_length(v_reason) > 200 then
    raise exception 'pantia:bad_request' using errcode = '22023';
  end if;
  -- 遅れた入金と同時に走っても注文が生き返らないよう、生き返りうる注文の行を先に押さえる（条件は mark_group_paid と同じ）
  perform 1 from public.orders o
  where o.listing_id = p_listing
    and (o.status = 'pending'
         or (o.status = 'cancelled' and o.paid_at is null and not o.needs_refund and o.refunded_at is null))
  for update;
  select * into v_l from public.listings where id = p_listing for update;
  if not found or v_l.status not in ('published', 'private') then
    raise exception 'pantia:bad_state';
  end if;
  if exists (select 1 from public.orders o
             where o.listing_id = p_listing and o.single_stock and o.status = 'pending') then
    raise exception 'pantia:reserved';
  end if;
  insert into public.listing_manual_sold (listing_id, prev_status, reason, marked_by)
  values (p_listing, v_l.status, v_reason, p_admin);
  update public.listings set status = 'sold' where id = p_listing;
  perform public.notify(v_l.seller_id, 'system', '運営が売り切れにしました',
    left(v_l.title || coalesce('：' || nullif(v_reason, ''), ''), 300), '/mypage/items');
  perform public.audit(p_admin, 'listing.manual_sold', 'listing', p_listing::text,
    jsonb_build_object('title', v_l.title, 'reason', v_reason, 'prev_status', v_l.status));
end;
$$;
revoke all on function public.admin_mark_sold(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_mark_sold(uuid, uuid, text) to service_role;

-- 売り切れの印を外す（管理者だけ）。戻り値は戻した先の状態（published / private）
create or replace function public.admin_unmark_sold(p_admin uuid, p_listing uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_l public.listings;
  v_m public.listing_manual_sold;
  v_to text;
begin
  perform public.assert_admin(p_admin);
  select * into v_l from public.listings where id = p_listing for update;
  if not found or v_l.status <> 'sold' then
    raise exception 'pantia:bad_state';
  end if;
  select * into v_m from public.listing_manual_sold where listing_id = p_listing for update;
  if not found then
    raise exception 'pantia:bad_state';
  end if;
  if exists (select 1 from public.orders o
             where o.listing_id = p_listing and o.single_stock
               and o.status in ('paid', 'preparing', 'shipped', 'completed')) then
    raise exception 'pantia:bad_state';
  end if;
  v_to := v_m.prev_status;
  if v_to = 'published' and not public.seller_is_public(v_l.seller_id) then
    v_to := 'private';
  end if;
  update public.listings set status = v_to where id = p_listing;
  perform public.audit(p_admin, 'listing.manual_unsold', 'listing', p_listing::text,
    jsonb_build_object('title', v_l.title, 'to', v_to));
  return v_to;
end;
$$;
revoke all on function public.admin_unmark_sold(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_unmark_sold(uuid, uuid) to service_role;

-- status が sold から別の物に変わったら、印を消す。表の書き込みは service_role から外してあるので definer
create or replace function public.listings_manual_sold_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.listing_manual_sold where listing_id = new.id;
  return null;
end;
$$;
revoke all on function public.listings_manual_sold_cleanup() from public, anon, authenticated;
create trigger listings_manual_sold_cleanup after update of status on public.listings
  for each row when (old.status = 'sold' and new.status is distinct from 'sold')
  execute function public.listings_manual_sold_cleanup();

-- 出品者: 発送前に取り消す（0004 のまま。手動の売り切れの印がある物は sold のままにする所だけ変えた）
create or replace function public.seller_cancel_order(p_order uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
begin
  if char_length(btrim(coalesce(p_reason, ''))) not between 1 and 200 then
    raise exception 'pantia:bad_reason' using errcode = '22023';
  end if;
  update public.orders
  set status = 'cancelled', cancelled_at = now(), cancel_reason = btrim(p_reason), needs_refund = true
  where id = p_order and seller_id = (select auth.uid()) and status in ('paid', 'preparing')
  returning * into v_o;
  if not found then
    raise exception 'pantia:bad_state';
  end if;
  update public.listings set sales_count = greatest(sales_count - 1, 0),
         status = case when status = 'sold'
                        and not exists (select 1 from public.listing_manual_sold m where m.listing_id = v_o.listing_id)
                       then 'private' else status end
  where id = v_o.listing_id;
  update public.profiles set purchase_count = greatest(purchase_count - 1, 0) where id = v_o.buyer_id;
  perform public.notify(v_o.buyer_id, 'order', '注文がキャンセルされました',
    '注文 #' || v_o.order_no || ' は出品者の都合でキャンセルされました。代金は全額返金します。', '/orders/' || v_o.id::text);
  perform public.post_system_message(v_o.seller_id, v_o.buyer_id, 'system',
    '注文 #' || v_o.order_no || ' は出品者の都合でキャンセルされました（全額返金）', v_o.id, v_o.listing_id);
  perform public.audit(v_o.seller_id, 'order.seller_cancel', 'order', v_o.id::text,
    jsonb_build_object('order_no', v_o.order_no, 'reason', left(btrim(p_reason), 200)));
end;
$$;
revoke all on function public.seller_cancel_order(uuid, text) from public, anon;
grant execute on function public.seller_cancel_order(uuid, text) to authenticated;

-- 管理画面: 注文の取り消し（0006 のまま。手動の売り切れの印がある物は sold のままにする所だけ変えた）
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
           status = case when status = 'sold'
                          and not exists (select 1 from public.listing_manual_sold m where m.listing_id = v_o.listing_id)
                         then 'private' else status end
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
