-- =============================================================================
-- 本番に migration を流した「あと」に読むだけの確認（何も変えない・行の中身は読まない。件数だけ）
--   SQL Editor は最後の結果しか見せないので、全部を1つの表で返す。NG が1つでもあればアプリを出さない。
--   このあと、ダッシュボードの Advisors → Security で ERROR が 0 件かも見る。
-- =============================================================================
with
  new_tables(name) as (values
    ('admin_users'), ('audit_logs'), ('bank_accounts'), ('blocks'), ('cart_items'), ('cron_runs'),
    ('favorites'), ('follows'), ('kyc_applications'), ('ledger_entries'), ('legacy_item_map'), ('listings'),
    ('mail_outbox'), ('messages'), ('notifications'), ('order_addresses'), ('orders'), ('payment_events'),
    ('payouts'), ('post_comments'), ('post_likes'), ('posts'), ('profiles'), ('rate_limit_hits'),
    ('reports'), ('reviews'), ('role_change_requests'), ('saved_addresses'), ('site_settings'), ('threads'),
    ('user_sanctions'),
    -- 0010 代理登録
    ('proxy_registrations')
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
    ('touch_updated_at'), ('trend_tags'), ('viewer_context'), ('weekly_ranking'), ('withdraw_account'), ('withdraw_internal'),
    -- 0010 代理登録
    ('admin_proxy_link_issued'), ('admin_proxy_register'), ('admin_proxy_submit_kyc'), ('proxy_mark_handed_over')
  ),
  new_buckets(id) as (values
    ('avatars'), ('chat-images'), ('kyc-documents'), ('listing-images'), ('post-images')
  ),
  missing_tables as (select name from new_tables where to_regclass('public.' || quote_ident(name)) is null),
  no_rls as (
    select c.relname::text as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
      and c.relname in (select name from new_tables)),
  -- 前からある表で RLS が切れている物（今回の migration では触らない。記録だけ）
  old_no_rls as (
    select c.relname::text as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
      and c.relname not in (select name from new_tables)),
  missing_functions as (
    select name from new_functions f
    where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = f.name)),
  open_definer as (
    select p.proname::text as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c like 'search_path=%')),
  unvalidated as (
    select conrelid::regclass::text || '.' || conname::text as name from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace
    where n.nspname = 'public' and not c.convalidated),
  missing_buckets as (select id from new_buckets b where not exists (select 1 from storage.buckets s where s.id = b.id))
select 1 as no, '新しい表が全部ある' as item,
  case when exists (select 1 from missing_tables) then 'NG' else 'OK' end as result,
  coalesce((select '無い: ' || string_agg(name, ', ' order by name) from missing_tables), '32 表') as detail
union all
select 2, '新しい表は全部 RLS が入っている',
  case when exists (select 1 from no_rls) then 'NG' else 'OK' end,
  coalesce((select string_agg(name, ', ' order by name) from no_rls), '')
union all
select 3, '関数が全部ある',
  case when exists (select 1 from missing_functions) then 'NG' else 'OK' end,
  coalesce((select '無い: ' || string_agg(name, ', ' order by name) from missing_functions), '100 個')
union all
select 4, 'SECURITY DEFINER の関数は search_path が固定',
  case when exists (select 1 from open_definer) then 'NG' else 'OK' end,
  coalesce((select string_agg(name, ', ' order by name) from open_definer), '')
union all
select 5, '未検証の制約が無い',
  case when exists (select 1 from unvalidated) then 'NG' else 'OK' end,
  coalesce((select string_agg(name, ', ' order by name) from unvalidated), '')
union all
select 6, '画像の箱が全部ある',
  case when exists (select 1 from missing_buckets) then 'NG' else 'OK' end,
  coalesce((select '無い: ' || string_agg(id, ', ' order by id) from missing_buckets), '')
union all
select 7, '会員登録の trigger（pantia_on_auth_user_created）がある',
  case when exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'pantia_on_auth_user_created') then 'OK' else 'NG' end, ''
union all
select 8, 'pg_trgm が extensions にある',
  case when exists (select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
                    where e.extname = 'pg_trgm' and n.nspname = 'extensions') then 'OK' else 'NG' end, ''
union all
select 9, '設定の行が1行（新規登録の受付）',
  case when (select count(*) from public.site_settings) = 1 then 'OK' else 'NG' end,
  coalesce((select 'registration_open=' || registration_open::text from public.site_settings limit 1), '行なし')
union all
select 10, '全員に profiles がある（auth.users と同じ数）',
  case when (select count(*) from auth.users) = (select count(*) from public.profiles) then 'OK' else 'NG' end,
  'auth.users=' || (select count(*) from auth.users) || ' / profiles=' || (select count(*) from public.profiles)
  || '（出品者 ' || (select count(*) from public.profiles where role = 'seller') || '）'
union all
select 11, '旧 items の引っ越し（下書きとして写す）', '記録',
  'items=' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %s', coalesce(to_regclass('public.items')::text, '(select 1 where false) x')), false, true, '')))[1]::text
  || ' / 写した=' || (select count(*) from public.legacy_item_map)
  || ' / 下書きの出品=' || (select count(*) from public.listings where status = 'draft')
union all
select 12, 'チャットの即時表示に載った表', '記録',
  coalesce((select string_agg(tablename::text, ', ' order by tablename) from pg_publication_tables
            where pubname = 'supabase_realtime' and schemaname = 'public'), 'なし')
union all
select 13, '旧表 sellers・items の鍵（新アプリを確かめたあと 10_lock_legacy.sql で閉じる）', '記録',
  coalesce((select string_agg(c.relname::text || ' RLS=' || case when c.relrowsecurity then 'on' else 'off' end, ', ' order by c.relname)
            from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname in ('sellers', 'items')), '表なし')
union all
select 14, '前からある表で RLS が切れている物（今回は触らない）', '記録',
  coalesce((select string_agg(name, ', ' order by name) from old_no_rls), 'なし')
union all
select 15, '代理で出した運営の列（kyc_applications.submitted_by）は利用者から読めない',
  case when not exists (select 1 from information_schema.columns
                        where table_schema = 'public' and table_name = 'kyc_applications' and column_name = 'submitted_by') then 'NG'
       when has_column_privilege('authenticated', 'public.kyc_applications', 'submitted_by', 'SELECT') then 'NG'
       else 'OK' end, ''
union all
select 16, '代理登録の台帳（proxy_registrations）は関数からしか書けない',
  case when to_regclass('public.proxy_registrations') is null then 'NG'
       when has_table_privilege('service_role', 'public.proxy_registrations', 'INSERT')
         or has_table_privilege('service_role', 'public.proxy_registrations', 'UPDATE')
         or has_table_privilege('authenticated', 'public.proxy_registrations', 'SELECT')
         or has_table_privilege('anon', 'public.proxy_registrations', 'SELECT') then 'NG'
       else 'OK' end, ''
order by no;
