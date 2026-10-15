-- =============================================================================
-- 本番に migration を流す「前」に読むだけの確認（何も変えない）
--   新しく作る表の名前が、本番にもう無いことを確かめる。1つでも not null が出たら流さずに相談する
-- =============================================================================
select name, to_regclass('public.' || name) as already_exists
from unnest(array[
  'rate_limit_hits', 'profiles', 'admin_users', 'site_settings', 'audit_logs', 'notifications', 'mail_outbox', 'cron_runs',
  'payment_events', 'blocks', 'follows', 'listings', 'favorites', 'cart_items', 'orders', 'order_addresses',
  'saved_addresses', 'reviews', 'bank_accounts', 'ledger_entries', 'payouts', 'threads', 'messages', 'posts', 'post_likes',
  'post_comments', 'user_sanctions', 'reports', 'kyc_applications', 'role_change_requests', 'legacy_item_map'
]) as name
order by already_exists nulls last, name;

-- 箱の名前もかぶっていないか
select id, public from storage.buckets
where id in ('listing-images', 'avatars', 'post-images', 'chat-images', 'kyc-documents');

-- auth.users に、前から付いている trigger（profiles を作る物など）が無いか
select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal;
