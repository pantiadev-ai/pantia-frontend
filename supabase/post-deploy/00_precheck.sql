-- =============================================================================
-- 本番に migration を流す「前」に読むだけの確認（何も変えない・行の中身は読まない。件数だけ）
--   SQL Editor は最後の結果しか見せないので、全部を1つの表で返す。
--   result が NG の行が1つでもあれば、流さずに相談する。要確認 は detail を読んで判断する。
--   一覧はマイグレーションから機械で抜いた（表 31・関数 96・箱 5）。
-- =============================================================================
with
  new_tables(name) as (values
    ('admin_users'), ('audit_logs'), ('bank_accounts'), ('blocks'), ('cart_items'), ('cron_runs'),
    ('favorites'), ('follows'), ('kyc_applications'), ('ledger_entries'), ('legacy_item_map'), ('listings'),
    ('mail_outbox'), ('messages'), ('notifications'), ('order_addresses'), ('orders'), ('payment_events'),
    ('payouts'), ('post_comments'), ('post_likes'), ('posts'), ('profiles'), ('rate_limit_hits'),
    ('reports'), ('reviews'), ('role_change_requests'), ('saved_addresses'), ('site_settings'), ('threads'),
    ('user_sanctions')
  ),
  new_functions(name) as (values
    ('admin_cancel_order'), ('admin_dashboard'), ('admin_kyc_allow_resubmit'), ('admin_kyc_decide'), ('admin_kyc_start_review'), ('admin_ledger_adjust'),
    ('admin_moderate'), ('admin_payout_pay'), ('admin_payout_reject'), ('admin_report_update'), ('admin_role_change_decide'), ('admin_set_listing_status'),
    ('admin_set_user_status'), ('admin_update_settings'), ('admin_user_balance'), ('admin_warn_user'), ('admin_withdraw_user'), ('assert_admin'),
    ('attach_payment_ref'), ('audit'), ('auto_complete_orders'), ('blocked_between'), ('blocks_cleanup'), ('bump_listing_view'),
    ('cancel_expired_orders'), ('cancel_my_pending_group'), ('cart_items_guard'), ('claim_mail_batch'), ('cleanup_retention'), ('complete_order'),
    ('create_checkout'), ('delete_my_listing'), ('ensure_thread'), ('favorites_count'), ('file_report'), ('finish_order'),
    ('follows_count'), ('handle_new_user'), ('is_blocked_with'), ('is_end_user'), ('is_following'), ('is_verified'),
    ('kyc_apply_decision'), ('kyc_mark_purged'), ('kyc_provider_result'), ('kyc_set_provider_ref'), ('legacy_clean'), ('listing_quote'),
    ('listings_announce'), ('listings_guard'), ('looks_spammy'), ('mark_group_paid'), ('mark_refunded'), ('mark_thread_read'),
    ('migrate_legacy_data'), ('my_balance'), ('my_ledger'), ('my_profile'), ('my_threads'), ('my_unread_messages'),
    ('notify'), ('open_thread'), ('paths_ok'), ('pin_post'), ('post_comments_after'), ('post_comments_guard'),
    ('post_likes_count'), ('post_review'), ('post_system_message'), ('posts_announce'), ('posts_guard'), ('prepare_order'),
    ('quote_listing'), ('rate_limit_take'), ('request_payout'), ('request_role_change'), ('san'), ('search_listings'),
    ('seller_can_leave'), ('seller_cancel_order'), ('seller_is_public'), ('seller_stats'), ('send_message'), ('set_thread_muted'),
    ('ship_order'), ('spam_hold'), ('submit_kyc'), ('suspend_internal'), ('toggle_message_heart'), ('touch_last_seen'),
    ('touch_updated_at'), ('trend_tags'), ('viewer_context'), ('weekly_ranking'), ('withdraw_account'), ('withdraw_internal')
  ),
  new_buckets(id) as (values
    ('avatars'), ('chat-images'), ('kyc-documents'), ('listing-images'), ('post-images')
  ),
  hit_tables as (select name from new_tables where to_regclass('public.' || quote_ident(name)) is not null),
  hit_types as (
    select t.typname::text as name from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname in (select name from new_tables)),
  -- create or replace なので、同じ名前があると黙って中身を入れ替える（引数が違えば別物が増える）
  hit_functions as (
    select distinct p.proname::text as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (select name from new_functions)),
  -- on conflict do update なので、同じ名前の箱があると公開設定・上限を書き換える
  hit_buckets as (select id from storage.buckets where id in (select id from new_buckets)),
  auth_triggers as (
    select tg.tgname::text as name, tg.tgfoid::regproc::text as fn from pg_trigger tg
    where tg.tgrelid = 'auth.users'::regclass and not tg.tgisinternal),
  legacy_cols as (
    select c.table_name::text as t, c.column_name::text as col, c.data_type::text as typ
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name in ('sellers', 'items')),
  trgm as (select e.extname, n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm'),
  pub as (select pubname, puballtables from pg_publication where pubname = 'supabase_realtime')
select 1 as no, '新しい表の名前が本番に無い' as item,
  case when exists (select 1 from hit_tables) then 'NG' else 'OK' end as result,
  coalesce((select string_agg(name, ', ' order by name) from hit_tables), '') as detail
union all
select 2, '新しい表と同じ名前の型が無い',
  case when exists (select 1 from hit_types) then 'NG' else 'OK' end,
  coalesce((select string_agg(name, ', ' order by name) from hit_types), '')
union all
select 3, '関数の名前が本番に無い（あると黙って上書き）',
  case when exists (select 1 from hit_functions) then 'NG' else 'OK' end,
  coalesce((select string_agg(name, ', ' order by name) from hit_functions), '')
union all
select 4, '画像の箱の名前が本番に無い（あると設定を上書き）',
  case when exists (select 1 from hit_buckets) then 'NG' else 'OK' end,
  coalesce((select string_agg(id, ', ' order by id) from hit_buckets), '')
union all
select 5, 'auth.users の trigger（会員登録で動く物）',
  case when not exists (select 1 from auth_triggers) then 'OK'
       when exists (select 1 from auth_triggers where name = 'pantia_on_auth_user_created') then 'NG'
       else '要確認' end,
  coalesce((select string_agg(name || ' → ' || fn, ', ' order by name) from auth_triggers), 'なし')
union all
select 6, '旧表 sellers の id が uuid（引っ越しで auth.users と照らす）',
  case when to_regclass('public.sellers') is null then '要確認'
       when exists (select 1 from legacy_cols where t = 'sellers' and col = 'id' and typ = 'uuid') then 'OK'
       else 'NG' end,
  coalesce((select string_agg(col || ':' || typ, ', ' order by col) from legacy_cols where t = 'sellers'), '表なし')
union all
select 7, '旧表 items に id がある（引っ越しの印に使う）',
  case when to_regclass('public.items') is null then '要確認'
       when exists (select 1 from legacy_cols where t = 'items' and col = 'id') then 'OK'
       else 'NG' end,
  coalesce((select string_agg(col || ':' || typ, ', ' order by col) from legacy_cols where t = 'items'), '表なし')
union all
select 8, 'pg_trgm が extensions に入っているか未導入（extensions.gin_trgm_ops を使う）',
  case when not exists (select 1 from trgm) then
         case when exists (select 1 from pg_available_extensions where name = 'pg_trgm') then 'OK' else 'NG' end
       when exists (select 1 from trgm where nspname = 'extensions') then 'OK'
       else 'NG' end,
  coalesce((select '導入済み: ' || nspname::text from trgm), '未導入（0003 で入れる）')
union all
select 9, 'extensions スキーマがある',
  case when to_regnamespace('extensions') is null then 'NG' else 'OK' end, ''
union all
select 10, 'supabase_realtime が「全表」モードでない（チャットの即時表示）',
  case when not exists (select 1 from pub) then '要確認'
       when exists (select 1 from pub where puballtables) then 'NG'
       else 'OK' end,
  coalesce((select case when puballtables then '全表モード' else '表を選ぶモード' end from pub), '無い（チャットは即時に出ない）')
union all
select 11, 'Postgres の版',
  case when current_setting('server_version_num')::integer >= 150000 then 'OK' else '要確認' end,
  current_setting('server_version')
union all
select 12, '役割 anon・authenticated・service_role がある',
  case when (select count(*) from pg_roles where rolname in ('anon', 'authenticated', 'service_role')) = 3 then 'OK' else 'NG' end, ''
union all
select 13, '件数（あとで引っ越しの結果と照らす）', '記録',
  'auth.users=' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %s', coalesce(to_regclass('auth.users')::text, '(select 1 where false) x')), false, true, '')))[1]::text
  || ' / sellers=' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %s', coalesce(to_regclass('public.sellers')::text, '(select 1 where false) x')), false, true, '')))[1]::text
  || ' / items=' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %s', coalesce(to_regclass('public.items')::text, '(select 1 where false) x')), false, true, '')))[1]::text
order by no;
