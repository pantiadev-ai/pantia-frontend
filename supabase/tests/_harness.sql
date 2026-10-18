-- 回帰テストの共通部品（各テストの先頭に連結して流す。最後に結果を例外で返して全部取り消す）
create temp table _r (n serial, name text, ok boolean, info text);
grant all on _r to public;

-- 利用者として SQL を流す。成功なら 'ok'、失敗なら 'ERR <メッセージ>'
create function pg_temp.run(p_uid uuid, p_role text, p_sql text) returns text language plpgsql as $f$
declare m text;
begin
  perform set_config('request.jwt.claims', coalesce(json_build_object('sub', p_uid, 'role', p_role)::text, ''), true);
  execute format('set local role %I', p_role);
  execute p_sql;
  execute 'reset role';
  return 'ok';
exception when others then
  get stacked diagnostics m = message_text;
  return 'ERR ' || m;
end $f$;

-- 利用者として SQL を流し、1行目1列目を文字で返す（失敗は 'ERR ...'）
create function pg_temp.val(p_uid uuid, p_role text, p_sql text) returns text language plpgsql as $f$
declare m text; v text;
begin
  perform set_config('request.jwt.claims', coalesce(json_build_object('sub', p_uid, 'role', p_role)::text, ''), true);
  execute format('set local role %I', p_role);
  execute p_sql into v;
  execute 'reset role';
  return v;
exception when others then
  get stacked diagnostics m = message_text;
  return 'ERR ' || m;
end $f$;

create function pg_temp.chk(p_name text, p_ok boolean, p_info text default '') returns void language sql as $f$
  insert into _r (name, ok, info) values (p_name, coalesce(p_ok, false), coalesce(p_info, '(null)'));
$f$;

-- 期待: 成功
create function pg_temp.ok(p_name text, p_uid uuid, p_role text, p_sql text) returns void language plpgsql as $f$
declare v text := pg_temp.run(p_uid, p_role, p_sql);
begin perform pg_temp.chk(p_name, v = 'ok', v); end $f$;

-- 期待: 失敗（メッセージに p_like を含む）
create function pg_temp.ng(p_name text, p_uid uuid, p_role text, p_sql text, p_like text) returns void language plpgsql as $f$
declare v text := pg_temp.run(p_uid, p_role, p_sql);
begin perform pg_temp.chk(p_name, v like 'ERR %' and position(p_like in v) > 0, v); end $f$;

-- 期待: 値が一致
create function pg_temp.eq(p_name text, p_uid uuid, p_role text, p_sql text, p_want text) returns void language plpgsql as $f$
declare v text := pg_temp.val(p_uid, p_role, p_sql);
begin perform pg_temp.chk(p_name, v is not distinct from p_want, 'got ' || coalesce(v, 'null') || ' want ' || coalesce(p_want, 'null')); end $f$;

-- テスト用の利用者を作る（メール確認済み・プロフィールは trigger が作る）
create function pg_temp.mkuser(p_nick text, p_role text, p_kyc text default 'approved') returns uuid language plpgsql as $f$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v, 'authenticated', 'authenticated', v::text || '@test.invalid', '', now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('nickname', p_nick, 'role', p_role, 'age', '25'), now(), now());
  update public.profiles set kyc_status = p_kyc where id = v;
  return v;
end $f$;

-- 出品者として出品を作る（画面と同じ道）。p_set は作ったあとに管理者権限で足す列（例: 'opt_extend = true, max_worn_days = 4'）
create function pg_temp.listing(p_seller uuid, p_status text default 'published', p_set text default '') returns uuid language plpgsql as $f$
declare v text; id uuid;
begin
  v := pg_temp.val(p_seller, 'authenticated', format(
    'insert into public.listings (title, description, category, worn_days, price, image_paths, status) values (%L, %L, %L, 2, 3000, array[%L], %L) returning id',
    'テスト商品', '説明です', 'panty', p_seller::text || '/' || gen_random_uuid()::text || '.webp', p_status));
  if v like 'ERR %' then raise exception 'listing 作成に失敗: %', v; end if;
  id := v::uuid;
  if p_set <> '' then
    execute format('update public.listings set %s where id = %L', p_set, id);
  end if;
  return id;
end $f$;

-- 住所（注文用）
create function pg_temp.addr() returns jsonb language sql as $f$
  select '{"name":"山田 花子","postal":"1500001","prefecture":"東京都","address1":"渋谷区神宮前1-1-1","address2":"","phone":"090-1234-5678"}'::jsonb;
$f$;
