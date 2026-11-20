-- =============================================================================
-- 0018 admin mail / bank / orders — メールの文面の上書き・キャラの口座を見る・新しい注文の件数と一覧
-- -----------------------------------------------------------------------------
-- 決まり
--   ・メールの文面は、アプリの目録（lib/mail-templates.ts）の既定に、件名と書き出しだけ上書きできる。
--     表に行が無ければ既定のまま。両方を空にすると行を消して既定に戻す
--   ・件名は1行（制御文字なし）で100字まで、書き出しは改行だけ許して2000字まで。key の中身は目録の側で確かめる
--   ・文面の表は service_role（送り出しと管理画面）が読むだけ。書けるのは関数だけ。記録に文面そのものは入れない
--   ・口座を管理画面で見られるのはキャラ（character_accounts）だけ。見たら記録する。記録に口座番号は入れない
--   ・新しい注文の件数は「振込の入金待ち（期限内）」と「キャラの入金済み・発送準備中」。
--     一覧は振込の入金待ち（期限内）と、全部の売手の入金済み・発送準備中。見るだけなので記録しない
-- =============================================================================

create table public.mail_templates (
  key        text primary key check (key ~ '^[a-z][a-z0-9_.]{0,39}$'),
  subject    text null check (subject is null or (char_length(subject) between 1 and 100 and subject !~ '[[:cntrl:]]')),
  body       text null check (body is null or (char_length(body) between 1 and 2000 and body !~ '[\x01-\x09\x0b-\x1f\x7f]')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
alter table public.mail_templates enable row level security;
revoke all on public.mail_templates from anon, authenticated;
revoke insert, update, delete, truncate on public.mail_templates from service_role;
grant select on public.mail_templates to service_role;

-- 文面を上書きする・既定に戻す（管理者だけ）
create or replace function public.admin_set_mail_template(p_admin uuid, p_key text, p_subject text, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject text := nullif(btrim(coalesce(p_subject, ''), E' \t\r\n　'), '');
  v_body    text := nullif(btrim(replace(coalesce(p_body, ''), E'\r\n', E'\n'), E' \t\r\n　'), '');
  v_reset   boolean;
begin
  perform public.assert_admin(p_admin);
  if p_key is null or p_key !~ '^[a-z][a-z0-9_.]{0,39}$'
     or (v_subject is not null and (char_length(v_subject) > 100 or v_subject ~ '[[:cntrl:]]'))
     or (v_body is not null and (char_length(v_body) > 2000 or v_body ~ '[\x01-\x09\x0b-\x1f\x7f]')) then
    raise exception 'pantia:bad_request' using errcode = '22023';
  end if;
  v_reset := v_subject is null and v_body is null;
  if v_reset then
    delete from public.mail_templates where key = p_key;
  else
    insert into public.mail_templates (key, subject, body, updated_at, updated_by)
    values (p_key, v_subject, v_body, now(), p_admin)
    on conflict (key) do update
      set subject = excluded.subject, body = excluded.body, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  end if;
  perform public.audit(p_admin, 'mail_template.update', 'mail_template', p_key, jsonb_build_object('reset', v_reset));
end;
$$;
revoke all on function public.admin_set_mail_template(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_set_mail_template(uuid, text, text, text) to service_role;

-- キャラの口座を見る（管理者だけ。キャラでない人は断る。見たら記録する）
create or replace function public.admin_character_bank(p_admin uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b     public.bank_accounts;
  v_found boolean;
begin
  perform public.assert_admin(p_admin);
  if not exists (select 1 from public.character_accounts c where c.user_id = p_user) then
    raise exception 'pantia:bad_state';
  end if;
  select * into v_b from public.bank_accounts where user_id = p_user;
  v_found := found;
  perform public.audit(p_admin, 'bank_account.view', 'user', p_user::text, jsonb_build_object('found', v_found));
  if not v_found then
    return null;
  end if;
  return jsonb_build_object(
    'bank_name', v_b.bank_name, 'branch_name', v_b.branch_name, 'account_type', v_b.account_type,
    'account_number', v_b.account_number, 'holder_kana', v_b.holder_kana, 'updated_at', v_b.updated_at);
end;
$$;
revoke all on function public.admin_character_bank(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_character_bank(uuid, uuid) to service_role;

-- 新しい注文の件数と一覧（管理者だけ。記録しない）
create or replace function public.admin_new_orders(p_admin uuid, p_limit int)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_count bigint;
  v_items jsonb;
begin
  perform public.assert_admin(p_admin);
  select count(*) into v_count
  from public.orders o
  where (o.payment_method = 'transfer' and o.status = 'pending' and o.expires_at > now())
     or (o.status in ('paid', 'preparing')
         and exists (select 1 from public.character_accounts c where c.user_id = o.seller_id));
  select coalesce(jsonb_agg(x.j order by x.created_at desc, x.order_no desc), '[]'::jsonb) into v_items
  from (
    select o.created_at, o.order_no, jsonb_build_object(
      'id', o.id, 'order_no', o.order_no, 'title', o.title, 'total', o.total, 'status', o.status,
      'payment_method', o.payment_method, 'created_at', o.created_at, 'seller_id', o.seller_id,
      'seller_name', p.nickname,
      'is_character', exists (select 1 from public.character_accounts c where c.user_id = o.seller_id)) as j
    from public.orders o
    left join public.profiles p on p.id = o.seller_id
    where (o.payment_method = 'transfer' and o.status = 'pending' and o.expires_at > now())
       or o.status in ('paid', 'preparing')
    order by o.created_at desc, o.order_no desc
    limit v_limit
  ) x;
  return jsonb_build_object('count', v_count, 'items', v_items);
end;
$$;
revoke all on function public.admin_new_orders(uuid, int) from public, anon, authenticated;
grant execute on function public.admin_new_orders(uuid, int) to service_role;
