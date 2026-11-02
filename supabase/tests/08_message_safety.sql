-- 08 メッセージの安全（初めて送る前の同意・禁止ワードで送る前に止める・運営が通報と保留の会話だけを見る）
-- 利用者として流し、エラーの hint（当たった禁止ワード）を返す。成功なら 'ok'
create function pg_temp.hint(p_uid uuid, p_sql text) returns text language plpgsql as $f$
declare h text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  execute p_sql;
  reset role;
  return 'ok';
exception when others then
  get stacked diagnostics h = pg_exception_hint;
  return coalesce(h, '');
end $f$;
create function pg_temp.send(p_thread uuid, p_body text) returns text language sql as $f$
  select format('select public.send_message(%L, %L)', p_thread, p_body);
$f$;
create function pg_temp.words(p_admin uuid, p_words jsonb) returns text language sql as $f$
  select pg_temp.run(null, 'service_role', format('select public.admin_update_settings(%L, %L::jsonb)', p_admin, jsonb_build_object('banned_words', p_words)));
$f$;
create function pg_temp.view(p_admin uuid, p_message uuid) returns text language sql as $f$
  select pg_temp.val(null, 'service_role', format('select public.admin_view_thread(%L, %L)::text', p_admin, p_message));
$f$;

do $t$
declare
  adm uuid; s1 uuid; b1 uuid; b2 uuid;
  th uuid; th2 uuid; m2 uuid; mh uuid; m5 uuid; mn uuid; mx uuid;
  r text; j jsonb; n integer;
begin
  adm := pg_temp.mkuser('運営', 'buyer');
  insert into public.admin_users (user_id) values (adm);
  s1 := pg_temp.mkuser('みさき', 'seller');
  b1 := pg_temp.mkuser('たろう', 'buyer');
  b2 := pg_temp.mkuser('じろう', 'buyer');
  th := pg_temp.val(b1, 'authenticated', format('select public.open_thread(%L)', s1))::uuid;
  th2 := pg_temp.val(b2, 'authenticated', format('select public.open_thread(%L)', s1))::uuid;

  -- 同意（初めて送る前に、運営が通報と保留の物を確かめることへの同意をもらう）-------
  perform pg_temp.run(null, 'postgres', format('delete from public.message_consents where user_id = %L', b1));
  perform pg_temp.ng('C01 同意が無いと送れない', b1, 'authenticated', pg_temp.send(th, 'こんにちは'), 'pantia:message_consent_required');
  perform pg_temp.eq('C02 止まったら行は増えない', null, 'postgres', format('select count(*)::text from public.messages where thread_id = %L', th), '0');
  perform pg_temp.ng('C03 同意の行は画面から直接作れない', b1, 'authenticated', format('insert into public.message_consents (user_id) values (%L)', b1), 'permission denied');
  perform pg_temp.ng('C04 匿名は同意できない', null, 'anon', 'select public.agree_message_terms()', 'permission denied');
  perform pg_temp.ok('C05 同意する', b1, 'authenticated', 'select public.agree_message_terms()');
  perform pg_temp.ok('C06 2回同意してもよい', b1, 'authenticated', 'select public.agree_message_terms()');
  perform pg_temp.eq('C07 本人は自分の同意を読める（1行）', b1, 'authenticated', 'select count(*)::text from public.message_consents', '1');
  perform pg_temp.eq('C08 他人の同意は見えない', s1, 'authenticated', format('select count(*)::text from public.message_consents where user_id = %L', b1), '0');
  perform pg_temp.ok('C09 同意すれば送れる', b1, 'authenticated', pg_temp.send(th, 'こんにちは'));
  perform pg_temp.ok('C10 取り消せる', b1, 'authenticated', 'select public.withdraw_message_terms()');
  perform pg_temp.ng('C11 取り消すとまた止まる', b1, 'authenticated', pg_temp.send(th, 'もしもし'), 'pantia:message_consent_required');
  perform pg_temp.eq('C12 同意と取り消しは記録に残る', null, 'postgres',
    format('select count(*)::text from public.audit_logs where actor_id = %L and action in (%L, %L)', b1, 'message_terms.agree', 'message_terms.withdraw'), '3');
  perform pg_temp.ok('C13 また同意できる', b1, 'authenticated', 'select public.agree_message_terms()');

  -- 禁止ワード（管理画面で入れる。入っていたら送らせない）-----------------------
  r := pg_temp.words(adm, '["死ね","ＢＡＫＡ","振込先","カネ"]');
  perform pg_temp.chk('W01 管理者は禁止ワードを入れられる', r = 'ok', r);
  perform pg_temp.eq('W02 入れた語がそのまま残る', null, 'postgres', 'select array_to_string(banned_words, $$,$$) from public.site_settings', '死ね,ＢＡＫＡ,振込先,カネ');
  perform pg_temp.ng('W03 管理者でない id では変えられない', null, 'service_role',
    format('select public.admin_update_settings(%L, %L::jsonb)', b1, '{"banned_words":[]}'), 'not_admin');
  perform pg_temp.chk('W04 31字の語は断る', pg_temp.words(adm, jsonb_build_array(repeat('あ', 31))) like 'ERR %check%', '');
  perform pg_temp.chk('W05 空の語は断る', pg_temp.words(adm, '[""]') like 'ERR %check%', '');
  perform pg_temp.chk('W06 前後の空白は断る', pg_temp.words(adm, '[" 死ね"]') like 'ERR %check%', '');
  perform pg_temp.chk('W07 全角の空白だけの語は断る', pg_temp.words(adm, '["　"]') like 'ERR %check%', '');
  perform pg_temp.chk('W08 制御文字は断る', pg_temp.words(adm, jsonb_build_array('a' || chr(10) || 'b')) like 'ERR %check%', '');
  perform pg_temp.chk('W09 201語は断る', pg_temp.words(adm, (select jsonb_agg('語' || i) from generate_series(1, 201) i)) like 'ERR %check%', '');
  r := pg_temp.words(adm, (select jsonb_agg(lpad(i::text, 30, 'あ')) from generate_series(1, 200) i));
  perform pg_temp.chk('W10 200語・30字ずつは通る（記録が大きすぎて止まらない）', r = 'ok', r);
  perform pg_temp.chk('W11 並びでないのは断る', pg_temp.words(adm, '"死ね"') like 'ERR %bad_request%', '');
  perform pg_temp.chk('W12 中が文字でないのは断る', pg_temp.words(adm, '[1]') like 'ERR %bad_request%', '');
  perform pg_temp.chk('W13 元に戻す', pg_temp.words(adm, '["死ね","ＢＡＫＡ","振込先","カネ"]') = 'ok', '');
  perform pg_temp.ng('W14 利用者は禁止ワードを読めない', b1, 'authenticated', 'select banned_words from public.site_settings', 'permission denied');
  perform pg_temp.ng('W15 匿名も読めない', null, 'anon', 'select banned_words from public.site_settings', 'permission denied');
  perform pg_temp.ng('W16 利用者は判定の関数を呼べない', b1, 'authenticated', 'select public.banned_word_in($$x$$)', 'permission denied');
  n := (select count(*) from public.messages where thread_id = th);
  perform pg_temp.ng('W17 禁止ワードが入っていれば送れない', b1, 'authenticated', pg_temp.send(th, 'お前は死ねばいい'), 'pantia:banned_word');
  perform pg_temp.chk('W18 当たった語を返す（hint）', pg_temp.hint(b1, pg_temp.send(th, 'お前は死ねばいい')) = '死ね', pg_temp.hint(b1, pg_temp.send(th, 'お前は死ねばいい')));
  perform pg_temp.chk('W19 全角・半角と大文字・小文字は区別しない', pg_temp.hint(b1, pg_temp.send(th, 'Baka じゃないの')) = 'ＢＡＫＡ', pg_temp.hint(b1, pg_temp.send(th, 'Baka じゃないの')));
  perform pg_temp.chk('W20 半角カナも同じに見る', pg_temp.hint(b1, pg_temp.send(th, 'ｶﾈ払え')) = 'カネ', pg_temp.hint(b1, pg_temp.send(th, 'ｶﾈ払え')));
  perform pg_temp.chk('W21 空白を挟んでも止める', pg_temp.hint(b1, pg_temp.send(th, '振　込　先を教えて')) = '振込先', pg_temp.hint(b1, pg_temp.send(th, '振　込　先を教えて')));
  perform pg_temp.eq('W22 止まったら行は増えない', null, 'postgres', format('select count(*)::text from public.messages where thread_id = %L', th), n::text);
  r := pg_temp.val(b1, 'authenticated', pg_temp.send(th, 'よろしくお願いします'));
  perform pg_temp.chk('W23 当たらない文は送れる', r !~ '^ERR', r);
  m2 := r::uuid;
  perform pg_temp.chk('W24 空にすれば止まらない', pg_temp.words(adm, '[]') = 'ok', '');
  perform pg_temp.ok('W25 空のあとは同じ文も送れる', b1, 'authenticated', pg_temp.send(th, 'baka'));

  -- 運営が会話を見る（通報か保留のあるメッセージからだけ）------------------------
  perform pg_temp.ok('V00 出品者の返事', s1, 'authenticated', pg_temp.send(th, 'こちらこそ'));
  mh := pg_temp.val(b1, 'authenticated', pg_temp.send(th, 'LINEで話そう'))::uuid;
  perform pg_temp.eq('V00 外への誘導は保留', null, 'postgres', format('select status from public.messages where id = %L', mh), 'held');
  perform pg_temp.ok('V00 出品者が通報', s1, 'authenticated', format('select public.file_report(%L, %L, %L, %L)', 'message', m2, 'harassment', ''));
  m5 := pg_temp.val(b2, 'authenticated', pg_temp.send(th2, 'はじめまして'))::uuid;
  r := pg_temp.view(adm, m2);
  perform pg_temp.chk('V01 通報されたメッセージの会話は開ける', r !~ '^ERR', r);
  j := case when r ~ '^ERR' then '{}'::jsonb else r::jsonb end;
  perform pg_temp.chk('V02 その会話のメッセージを全部返す', jsonb_array_length(j -> 'messages') = (select count(*) from public.messages where thread_id = th), coalesce(jsonb_array_length(j -> 'messages')::text, 'null'));
  perform pg_temp.chk('V03 印が付くのは通報と保留の2件', (select count(*) from jsonb_array_elements(j -> 'messages') e where (e ->> 'flagged')::boolean) = 2, '');
  perform pg_temp.chk('V04 開いたメッセージと会話の人を返す', j ->> 'target_id' = m2::text and j ->> 'seller_id' = s1::text and j ->> 'buyer_id' = b1::text, left(j::text, 120));
  perform pg_temp.chk('V05 別の会話のメッセージは入らない', not exists (select 1 from jsonb_array_elements(j -> 'messages') e where e ->> 'id' = m5::text), '');
  r := pg_temp.view(adm, mh);
  perform pg_temp.chk('V06 保留のメッセージからも開ける', r !~ '^ERR', r);
  perform pg_temp.chk('V07 通報も保留も無いメッセージは開けない', pg_temp.view(adm, m5) like 'ERR %pantia:not_flagged%', pg_temp.view(adm, m5));
  perform pg_temp.chk('V08 管理者でない id では開けない', pg_temp.view(b1, m2) like 'ERR %not_admin%', pg_temp.view(b1, m2));
  perform pg_temp.ng('V09 利用者からは呼べない', b1, 'authenticated', format('select public.admin_view_thread(%L, %L)', adm, m2), 'permission denied');
  perform pg_temp.chk('V10 無いメッセージは開けない', pg_temp.view(adm, gen_random_uuid()) like 'ERR %pantia:not_flagged%', '');

  -- 長い会話は、前30件・後10件まで
  insert into public.messages (thread_id, sender_id, kind, body, status, created_at)
  select th2, case when i % 2 = 0 then s1 else b2 end, 'text', 'n' || i, case when i = 35 then 'held' when i = 20 then 'hidden' else 'visible' end,
         now() - make_interval(mins => 100 - i)
  from generate_series(1, 49) i;
  mn := (select id from public.messages where thread_id = th2 and body = 'n35');
  mx := (select id from public.messages where thread_id = th2 and body = 'n20');
  r := pg_temp.view(adm, mn);
  j := case when r ~ '^ERR' then '{}'::jsonb else r::jsonb end;
  perform pg_temp.chk('V11 前30件・後10件まで（41件）', jsonb_array_length(j -> 'messages') = 41, coalesce(jsonb_array_length(j -> 'messages')::text, r));
  perform pg_temp.chk('V12 古い順で、前は n5 から、後は n45 まで',
    j -> 'messages' -> 0 ->> 'body' = 'n5' and j -> 'messages' -> 40 ->> 'body' = 'n45', coalesce(j -> 'messages' -> 0 ->> 'body', '') || ' .. ' || coalesce(j -> 'messages' -> 40 ->> 'body', ''));
  r := pg_temp.view(adm, mx);
  perform pg_temp.chk('V13 非表示にした物からも開ける', r !~ '^ERR', r);
  perform pg_temp.eq('V14 開いたことが記録に残る（開けた4回だけ）', null, 'postgres',
    format('select count(*)::text from public.audit_logs where actor_id = %L and action = %L and target_type = %L', adm, 'thread.viewed', 'message'), '4');
end $t$;
