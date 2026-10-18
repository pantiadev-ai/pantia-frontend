-- =============================================================================
-- 0001 rate_limits — サーバー側の回数の上限（28 §B7）
-- -----------------------------------------------------------------------------
-- ログイン・登録・再設定はサーバーから Supabase Auth を呼ぶので、Auth から見えるのは Vercel のIPだけ。
-- 攻撃者ごとに数えるため、DB に窓を固定した回数計を置く。数えるのは security definer の
-- rate_limit_take だけ。表は誰からも直接書けない。呼べるのは service_role だけ。
-- 手本: hudousan-tool 0012_rate_limits.sql（表と関数はそのまま）。
-- 使い方: lib/rate-limit-rules.ts（ルールの表）・lib/rate-limit.ts
-- =============================================================================

create table public.rate_limit_hits (
  -- 例: 'login.email:email:<sha256の先頭32字>' 'login.ip:ip:<sha256の先頭32字>'
  --     合言葉・IP は**そのまま入れない**（ハッシュにしてから渡す。アプリ側で済ませている）
  bucket       text        not null check (length(bucket) between 1 and 200),
  window_start timestamptz not null,
  -- この窓が終わる時刻。掃除はこれを見る
  expires_at   timestamptz not null,
  hits         integer     not null default 0 check (hits >= 0),
  primary key (bucket, window_start)
);
create index rate_limit_hits_expires_idx on public.rate_limit_hits (expires_at);

-- ポリシーは作らない＝PostgREST（anon / authenticated）からは1行も見えない・書けない
alter table public.rate_limit_hits enable row level security;
revoke all on public.rate_limit_hits from public, anon, authenticated;
-- service_role も直接は書かせない（数を減らして上限を外す道を作らない）。調べるための select だけ
revoke all on public.rate_limit_hits from service_role;
grant select on public.rate_limit_hits to service_role;

-- -----------------------------------------------------------------------------
-- rate_limit_take: 並べた順に1つずつ数え、**最初に上限を超えたところで止まる。**
--   ・狭い枠（利用者・鍵）を先に、広い枠（会社・日次）を後に並べる。
--     狭い枠で止められた連打が、会社全体の日次枠を食い潰さないようにするため。
--   ・p_offset_seconds は窓の区切りをずらす秒数。日次の窓を日本時間0時で切るときは 32400（+9時間）。
--   ・返すのは常に1行: allowed / 止めた枠の名前 / あと何秒で窓が変わるか。
-- -----------------------------------------------------------------------------
create or replace function public.rate_limit_take(
  p_buckets        text[],
  p_window_seconds integer[],
  p_max            integer[],
  p_offset_seconds integer[]
)
returns table (allowed boolean, denied_bucket text, retry_after_seconds integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n     integer := coalesce(array_length(p_buckets, 1), 0);
  v_now   double precision := extract(epoch from clock_timestamp());
  v_i     integer;
  v_win   integer;
  v_off   integer;
  v_start double precision;
  v_hits  integer;
begin
  if v_n < 1 or v_n > 8
     or coalesce(array_length(p_window_seconds, 1), 0) <> v_n
     or coalesce(array_length(p_max, 1), 0) <> v_n
     or coalesce(array_length(p_offset_seconds, 1), 0) <> v_n then
    raise exception 'rate_limit_take: 引数の数が合いません' using errcode = '22023';
  end if;

  for v_i in 1..v_n loop
    v_win := p_window_seconds[v_i];
    v_off := p_offset_seconds[v_i];
    if p_buckets[v_i] is null or length(p_buckets[v_i]) not between 1 and 200
       or v_win is null or v_win not between 1 and 172800
       or p_max[v_i] is null or p_max[v_i] not between 1 and 10000000
       or v_off is null or v_off not between -86400 and 86400 then
      raise exception 'rate_limit_take: 引数が範囲の外です' using errcode = '22023';
    end if;

    -- 窓の始まり（ずらした時刻で割り切ってから戻す）
    v_start := floor((v_now + v_off) / v_win) * v_win - v_off;

    insert into public.rate_limit_hits as h (bucket, window_start, expires_at, hits)
    values (p_buckets[v_i], to_timestamp(v_start), to_timestamp(v_start + v_win), 1)
    on conflict (bucket, window_start) do update set hits = h.hits + 1
    returning h.hits into v_hits;

    if v_hits > p_max[v_i] then
      return query select false, p_buckets[v_i], greatest(1, ceil(v_start + v_win - v_now)::integer);
      return;
    end if;
  end loop;

  -- 終わった窓を、ときどき少しずつ消す（定時処理に頼らない。1回で消すのは500行まで）
  if random() < 0.02 then
    delete from public.rate_limit_hits
    where ctid = any (array(
      select r.ctid from public.rate_limit_hits r where r.expires_at < now() limit 500
    ));
  end if;

  return query select true, null::text, 0;
end;
$$;

revoke all on function public.rate_limit_take(text[], integer[], integer[], integer[]) from public, anon, authenticated;
grant execute on function public.rate_limit_take(text[], integer[], integer[], integer[]) to service_role;
