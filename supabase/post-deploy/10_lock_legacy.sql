-- =============================================================================
-- 新しいアプリを本番に出して動きを確かめた「あと」に流す（前の表を閉じる）
--   ・前の画面は sellers・items を画面から直接読み書きしていた。新しいアプリは使わない
--   ・消さずに閉じる（RLS をかけ、画面の利用者の権限を外す）。中身は 0008 で写してある
--   ・前の箱（profile-images・item-images）は、中身を確かめてから別に判断する（ここでは触らない）
-- =============================================================================
alter table public.sellers enable row level security;
alter table public.items enable row level security;
revoke all on public.sellers from anon, authenticated;
revoke all on public.items from anon, authenticated;

-- 確かめ: どちらも rowsecurity = true、権限は postgres・service_role だけ
select relname, relrowsecurity from pg_class where oid in ('public.sellers'::regclass, 'public.items'::regclass);
select table_name, grantee, string_agg(privilege_type, ',') from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('sellers', 'items') group by 1, 2 order by 1, 2;
