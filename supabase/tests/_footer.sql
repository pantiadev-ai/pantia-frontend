do $f$ begin
  raise exception 'RESULT %', (select json_build_object(
    'pass', count(*) filter (where ok), 'fail', count(*) filter (where not ok),
    'failed', coalesce(json_agg(n || ' ' || name || ' :: ' || left(info, 160) order by n) filter (where not ok), '[]'::json)) from _r);
end $f$;
