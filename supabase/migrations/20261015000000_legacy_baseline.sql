-- =============================================================================
-- 0000 legacy_baseline — 作り直す前の表（sellers・items）が「無いときだけ」作る
-- -----------------------------------------------------------------------------
-- 本番 DB には、前の画面が使っていた sellers・items がすでにある（中身は読んでいない。列は前のコードから推定）。
-- 本番では何もしない（あるので作らない・権限も変えない。前のアプリが動いている間に止めないため）。
-- 検証用 DB では空の表を作り、0008 の引っ越しを試せるようにする。
-- 前の表を閉じる（RLS で全部止める）のは、新しいアプリを出したあとに supabase/post-deploy/ の SQL で行う。
-- =============================================================================

do $$
begin
  if to_regclass('public.sellers') is null then
    create table public.sellers (
      id                 uuid primary key references auth.users (id) on delete cascade,
      nickname           text,
      age                integer,
      bio                text,
      occupation         text,
      profile_image_url  text,
      profile_image_urls text[],
      created_at         timestamptz not null default now()
    );
    alter table public.sellers enable row level security;
    revoke all on public.sellers from anon, authenticated;
  end if;

  if to_regclass('public.items') is null then
    create table public.items (
      id             uuid primary key default gen_random_uuid(),
      user_id        uuid references auth.users (id) on delete cascade,
      seller_id      uuid,
      title          text,
      price          integer,
      category       text,
      shipping_badge text,
      description    text,
      image_url      text,
      image_urls     text[],
      image_src      text,
      created_at     timestamptz not null default now()
    );
    alter table public.items enable row level security;
    revoke all on public.items from anon, authenticated;
  end if;
end;
$$;
