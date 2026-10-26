-- =============================================================================
-- 0010 proxy_registration — 運営の代理登録（登録を運営が手伝う）
-- -----------------------------------------------------------------------------
--   本人に頼まれて、運営が代わりにアカウントを作る。年齢の確認（本人確認）は省かない。
--   アカウントそのもの（auth.users・profiles）はふつうの登録と同じ。サイトの見た目でも区別しない。
--
--   1. proxy_registrations: 運営が代わりに作ったアカウントの台帳（だれが・いつ作り、本人に渡したか）
--   2. パスワードを決めるリンク: 運営が管理画面で作り、LINE などで本人に送る（メールの仕組みを通さない）。
--      本人がパスワードを決めたら「渡した」の印が付き、そのあとは運営からリンクを作れない
--      （渡したあとのアカウントは本人の物。運営が入り直せる道を残さない）。
--   3. 本人確認の代理提出: 本人から受け取った書類と生年月日を、運営が管理画面から出す。
--      中身は submit_kyc と同じ（18歳未満なら止めて書類を消す）。出した運営を kyc_applications.submitted_by に残す。
--      審査はふつうどおり。
--
--   表に書くのは下の関数だけ（service_role でも表には直接書けない）。関数は service_role だけが呼べる。
--   p_admin にはアプリが確かめた管理者の id だけを入れ、ここでも assert_admin で確かめ直す（04 の G02）。
-- =============================================================================

create table public.proxy_registrations (
  user_id              uuid primary key references public.profiles (id) on delete cascade,
  registered_by        uuid references auth.users (id) on delete set null,
  -- 運営のメモ（連絡の経路など）。本人には見せない
  note                 text not null default '' check (char_length(note) <= 200 and note !~ '[[:cntrl:]]'),
  -- 「本人に頼まれ、規約・プライバシーポリシーへの同意と18歳以上の申告を受けた」と運営が確かめた時刻
  consent_confirmed_at timestamptz not null default now(),
  link_issued_at       timestamptz,
  link_issue_count     integer not null default 0 check (link_issue_count >= 0),
  handed_over_at       timestamptz,
  created_at           timestamptz not null default now()
);
create index proxy_registrations_created_idx on public.proxy_registrations (created_at desc);
alter table public.proxy_registrations enable row level security;
revoke all on public.proxy_registrations from anon, authenticated;
revoke insert, update, delete, truncate on public.proxy_registrations from service_role;

-- 運営が代わりに出した申請だけ、出した運営の id が入る（本人が出した申請は null）。
-- 本人の画面には出さない（authenticated に列の権限を渡さない。0006 の grant select の列の一覧に足さない）。
alter table public.kyc_applications add column submitted_by uuid references auth.users (id) on delete set null;

-- 代理登録の印を付ける。auth.admin.createUser で作った直後に呼ぶ。
-- 作ったばかりで、まだだれもログインしていないアカウントだけ（今いる利用者を代理登録の扱いにしない）。
create or replace function public.admin_proxy_register(p_admin uuid, p_user uuid, p_note text)
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
  if not found or v_p.status <> 'active' or v_p.kyc_status <> 'unsubmitted'
     or v_p.created_at < now() - interval '10 minutes'
     or exists (select 1 from auth.users u where u.id = p_user and u.last_sign_in_at is not null)
     or exists (select 1 from public.proxy_registrations r where r.user_id = p_user) then
    raise exception 'pantia:bad_state';
  end if;
  insert into public.proxy_registrations (user_id, registered_by, note) values (p_user, p_admin, v_note);
  perform public.audit(p_admin, 'user.proxy_register', 'user', p_user::text, jsonb_build_object('role', v_p.role));
end;
$$;
revoke all on function public.admin_proxy_register(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_proxy_register(uuid, uuid, text) to service_role;

-- パスワードを決めるリンクを作る前に呼ぶ（作った回数と時刻を残す）。本人に渡したあと・利用停止中は作れない。
-- リンクそのものはアプリが auth.admin.generateLink で作り、画面に1回だけ出す（DB にもログにも残さない）。
create or replace function public.admin_proxy_link_issued(p_admin uuid, p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  perform public.assert_admin(p_admin);
  update public.proxy_registrations r
  set link_issued_at = now(), link_issue_count = r.link_issue_count + 1
  where r.user_id = p_user
    and r.handed_over_at is null
    and exists (select 1 from public.profiles p where p.id = r.user_id and p.status = 'active')
  returning r.link_issue_count into v_n;
  if not found then
    raise exception 'pantia:bad_state';
  end if;
  perform public.audit(p_admin, 'user.proxy_link', 'user', p_user::text, jsonb_build_object('count', v_n));
  return v_n;
end;
$$;
revoke all on function public.admin_proxy_link_issued(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_proxy_link_issued(uuid, uuid) to service_role;

-- 本人確認を運営が代わりに出す（代理登録した人だけ・書類を目で見る manual だけ）。
-- 書類の置き場はアプリが「本人の id/」の下に置く（paths_ok が確かめる）。戻り値は submit_kyc と同じ。
create or replace function public.admin_proxy_submit_kyc(p_admin uuid, p_user uuid, p_doc_type text, p_paths text[], p_birth_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r  jsonb;
  v_id uuid;
begin
  perform public.assert_admin(p_admin);
  if p_user is null or p_user = p_admin then
    raise exception 'pantia:bad_request' using errcode = '22023';
  end if;
  perform 1 from public.proxy_registrations where user_id = p_user for update;
  if not found then
    raise exception 'pantia:bad_state';
  end if;
  v_r := public.submit_kyc(p_user, 'manual', p_doc_type, p_paths, p_birth_date);
  v_id := (v_r ->> 'app_id')::uuid;
  update public.kyc_applications set submitted_by = p_admin where id = v_id;
  perform public.audit(p_admin, 'kyc.proxy_submit', 'kyc', v_id::text,
                       jsonb_build_object('user', p_user, 'doc_type', p_doc_type, 'status', v_r ->> 'status'));
  return v_r;
end;
$$;
revoke all on function public.admin_proxy_submit_kyc(uuid, uuid, text, text[], date) from public, anon, authenticated;
grant execute on function public.admin_proxy_submit_kyc(uuid, uuid, text, text[], date) to service_role;

-- 本人がパスワードを決めたら呼ぶ（lib/actions/auth.ts の updatePassword）。代理登録でない人は何もしない。
-- 戻り値: 今回「渡した」の印を付けたら true
create or replace function public.proxy_mark_handed_over(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.proxy_registrations set handed_over_at = now() where user_id = p_user and handed_over_at is null;
  if not found then
    return false;
  end if;
  perform public.audit(p_user, 'user.proxy_handover', 'user', p_user::text, '{}'::jsonb);
  return true;
end;
$$;
revoke all on function public.proxy_mark_handed_over(uuid) from public, anon, authenticated;
grant execute on function public.proxy_mark_handed_over(uuid) to service_role;
