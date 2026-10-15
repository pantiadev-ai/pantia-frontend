-- =============================================================================
-- 0007 storage — 画像の置き場（箱）
-- -----------------------------------------------------------------------------
-- 決まり
--   ・書くのはサーバーだけ（service_role）。画面から直接は上げない。サーバーが sharp で webp に直し、EXIF（位置情報）を消してから置く
--   ・storage.objects に方針（policy）を1つも足さない = 画面の利用者は一覧も書き込みもできない
--   ・公開の箱（出品・アイコン・つぶやき）は公開URLで読む。非公開の箱（チャット・本人確認）はサーバーが確かめてから期限つきURLを出す
--   ・置く場所は <持ち主の id>/<uuid>.webp（チャットは <thread_id>/...）。DB の paths_ok と同じ形（28 §A8-2）
--   ・前の画面の箱（profile-images・item-images）には触らない
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('listing-images', 'listing-images', true,  2097152, array['image/webp']),
  ('avatars',        'avatars',        true,  2097152, array['image/webp']),
  ('post-images',    'post-images',    true,  2097152, array['image/webp']),
  ('chat-images',    'chat-images',    false, 2097152, array['image/webp']),
  ('kyc-documents',  'kyc-documents',  false, 4194304, array['image/webp'])
on conflict (id) do update
set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
