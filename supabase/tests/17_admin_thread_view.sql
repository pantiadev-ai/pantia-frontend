-- 17 運営が利用者の会話を、理由を残して見る（改修リスト 行8）
-- 決まり: 利用者の詳細から、その人の会話の一覧（相手と最後の時刻だけ。中身は出さない）を見られる。
--         中身を見るには、会話ごとに理由（1〜200字）を書いて「開く」。開いてから30分のあいだ、その管理者だけが読める。
--         見せるのは、送った人が新しい同意（版2）をした後のメッセージだけ。版1の同意しかない人がいる会話は開けない。
--         同意の版は2に上がる。版1の人は、次に送る前に同意し直す。同意し直しても、版2の同意の時刻は動かさない。
--         同意の関数は、画面が見せた文の版を受け取る。引数なし（0023 の前の画面）は版1として残す（古い文への同意を版2にしない）。
--         開くこと（理由つき）と読むことは、毎回、操作ログに残す。一覧を見ることは残さない。
create function pg_temp.lst(p_admin uuid, p_user uuid) returns text language sql as $f$
  select pg_temp.val(null, 'service_role', format('select public.admin_list_user_threads(%L, %L)::text', p_admin, p_user));
$f$;
create function pg_temp.opn(p_admin uuid, p_thread uuid, p_reason text) returns text language sql as $f$
  select pg_temp.val(null, 'service_role', format('select public.admin_open_thread(%L, %L, %L)::text', p_admin, p_thread, p_reason));
$f$;
create function pg_temp.rd(p_admin uuid, p_thread uuid) returns text language sql as $f$
  select pg_temp.val(null, 'service_role', format('select public.admin_view_any_thread(%L, %L)::text', p_admin, p_thread));
$f$;
create function pg_temp.js(p text) returns jsonb language sql as $f$
  select case when p is null or p ~ '^ERR' then null else p::jsonb end;
$f$;
create function pg_temp.consent(p_user uuid, p_version int, p_at timestamptz) returns text language sql as $f$
  select pg_temp.run(null, 'postgres', format('update public.message_consents set version = %s, agreed_at = %L where user_id = %L', p_version, p_at, p_user));
$f$;

do $t$
declare
  adm uuid; adm2 uuid; s1 uuid; b1 uuid; b2 uuid; b3 uuid;
  th uuid; th2 uuid; th3 uuid; g uuid;
  r text; j jsonb; old timestamptz := now() - interval '2 days';
begin
  adm := pg_temp.mkuser('運営', 'buyer');
  insert into public.admin_users (user_id) values (adm);
  adm2 := pg_temp.mkuser('運営2', 'buyer');
  insert into public.admin_users (user_id) values (adm2);
  s1 := pg_temp.mkuser('みさき', 'seller');
  b1 := pg_temp.mkuser('たろう', 'buyer');
  b2 := pg_temp.mkuser('じろう', 'buyer');
  b3 := pg_temp.mkuser('さぶろう', 'buyer');
  th := pg_temp.val(b1, 'authenticated', format('select public.open_thread(%L)', s1))::uuid;
  th2 := pg_temp.val(b2, 'authenticated', format('select public.open_thread(%L)', s1))::uuid;
  th3 := pg_temp.val(b3, 'authenticated', format('select public.open_thread(%L)', s1))::uuid;

  -- 同意の版 ----------------------------------------------------------------------
  perform pg_temp.eq('K01 新しく同意した人は版2', null, 'postgres',
    format('select version::text from public.message_consents where user_id = %L', b1), '2');
  perform pg_temp.consent(b3, 1, old);
  perform pg_temp.chk('K02 版1の同意しかない人は送れない（同意し直しを求める）',
    pg_temp.run(b3, 'authenticated', format('select public.send_message(%L, %L)', th3, 'こんにちは')) like 'ERR %message_consent_required%',
    pg_temp.run(b3, 'authenticated', format('select public.send_message(%L, %L)', th3, 'こんにちは')));
  perform pg_temp.ok('K03 版2の同意がある人は送れる', b1, 'authenticated', format('select public.send_message(%L, %L)', th, 'はじめまして'));
  perform pg_temp.ok('K04 版1の人が同意し直せる', b3, 'authenticated', 'select public.agree_message_terms(2)');
  perform pg_temp.eq('K05 同意し直すと版2になり、同意の時刻は今になる', null, 'postgres',
    format('select version || %L || (agreed_at = now())::text from public.message_consents where user_id = %L', '/', b3), '2/true');
  perform pg_temp.consent(b2, 2, old);
  perform pg_temp.ok('K06 版2の人がもう一度同意しても通る', b2, 'authenticated', 'select public.agree_message_terms(2)');
  perform pg_temp.eq('K07 版2の人がもう一度同意しても、同意の時刻は動かない', null, 'postgres',
    format('select (agreed_at = %L::timestamptz)::text from public.message_consents where user_id = %L', old, b2), 'true');
  perform pg_temp.ok('K08 取り消せる', b2, 'authenticated', 'select public.withdraw_message_terms()');
  perform pg_temp.ok('K09 取り消した後に同意し直せる', b2, 'authenticated', 'select public.agree_message_terms(2)');
  perform pg_temp.eq('K10 取り消してから同意し直すと、同意の時刻は今になる', null, 'postgres',
    format('select (agreed_at = now())::text from public.message_consents where user_id = %L', b2), 'true');
  perform pg_temp.eq('K11 同意の記録は版2として残る', null, 'postgres',
    format('select detail ->> %L from public.audit_logs where actor_id = %L and action = %L order by id desc limit 1', 'version', b3, 'message_terms.agree'), '2');

  -- 0023 の前の画面（引数なし）からの同意は版1のまま。migration を先に当てて画面を出すまでの間に、古い文への同意が版2にならない
  perform pg_temp.run(b2, 'authenticated', 'select public.withdraw_message_terms()');
  perform pg_temp.ok('K12 引数なしの同意も通る（前の画面のまま）', b2, 'authenticated', 'select public.agree_message_terms()');
  perform pg_temp.eq('K13 引数なしの同意は版1として残る', null, 'postgres',
    format('select version::text from public.message_consents where user_id = %L', b2), '1');
  perform pg_temp.ng('K14 版1の同意では送れない', b2, 'authenticated',
    format('select public.send_message(%L, %L)', th2, 'もしもし'), 'pantia:message_consent_required');
  perform pg_temp.eq('K15 引数なしの同意は、記録にも版1として残る', null, 'postgres',
    format('select detail ->> %L from public.audit_logs where actor_id = %L and action = %L order by id desc limit 1', 'version', b2, 'message_terms.agree'), '1');
  perform pg_temp.consent(b2, 2, old);
  perform pg_temp.ok('K16 版2の人が引数なしで同意しても通る', b2, 'authenticated', 'select public.agree_message_terms()');
  perform pg_temp.eq('K17 版2の人が引数なしで同意しても、版2のままで、同意の時刻も動かない', null, 'postgres',
    format('select version || %L || (agreed_at = %L::timestamptz)::text from public.message_consents where user_id = %L', '/', old, b2), '2/true');
  perform pg_temp.ng('K18 知らない版（3）は断る', b2, 'authenticated', 'select public.agree_message_terms(3)', 'pantia:bad_request');
  perform pg_temp.ng('K19 版0は断る', b2, 'authenticated', 'select public.agree_message_terms(0)', 'pantia:bad_request');
  perform pg_temp.ng('K20 版が null なら断る', b2, 'authenticated', 'select public.agree_message_terms(null)', 'pantia:bad_request');
  perform pg_temp.consent(b2, 2, now());

  -- 会話を作る（th: みさき⇔たろう。たろうは同意の前にも1通ある。運営からの知らせ＝送り手なしも1通）
  perform pg_temp.run(null, 'postgres', format('update public.message_consents set agreed_at = now() - interval %L where user_id = %L', '1 hour', b1));
  insert into public.messages (thread_id, sender_id, kind, body, created_at) values
    (th, b1, 'text', '同意の前', now() - interval '2 hours'),
    (th, null, 'system', '運営からの知らせ', now()),
    (th, s1, 'text', 'よろしくお願いします', now());
  perform pg_temp.run(null, 'postgres', format('update public.threads set last_message_at = now() - interval %L where id = %L', '5 minutes', th2));
  perform pg_temp.run(null, 'postgres', format('update public.threads set last_message_at = now() where id = %L', th));
  perform pg_temp.run(null, 'postgres', format('update public.threads set last_message_at = now() - interval %L where id = %L', '10 minutes', th3));
  perform pg_temp.consent(b3, 1, old);

  -- 一覧 --------------------------------------------------------------------------
  r := pg_temp.lst(adm, s1);
  j := pg_temp.js(r);
  perform pg_temp.chk('L01 その人の会話を全部返す（3件）', jsonb_array_length(j) = 3, coalesce(jsonb_array_length(j)::text, r));
  perform pg_temp.chk('L02 新しい順（th → th2 → th3）',
    j -> 0 ->> 'thread_id' = th::text and j -> 1 ->> 'thread_id' = th2::text, left(coalesce(r, ''), 160));
  perform pg_temp.chk('L03 相手と、その人がどちら側かを返す',
    j -> 0 ->> 'partner_id' = b1::text and j -> 0 ->> 'side' = 'seller' and j -> 0 ->> 'last_message_at' is not null, left(coalesce(r, ''), 160));
  perform pg_temp.chk('L04 両方が版2なら開ける、片方が版1なら開けない',
    (j -> 0 ->> 'viewable')::boolean and not (j -> 2 ->> 'viewable')::boolean, left(coalesce(r, ''), 300));
  perform pg_temp.chk('L05 中身（最後のメッセージの抜き出し）は返さない',
    j is not null and r !~ 'よろしく' and r !~ 'preview' and r !~ 'body', left(coalesce(r, ''), 160));
  j := pg_temp.js(pg_temp.lst(adm, b1));
  perform pg_temp.chk('L06 購入者から見ても返す（相手はみさき・購入者の側）',
    jsonb_array_length(j) = 1 and j -> 0 ->> 'partner_id' = s1::text and j -> 0 ->> 'side' = 'buyer', coalesce(j::text, ''));
  perform pg_temp.chk('L07 管理者でない id では見られない', pg_temp.lst(b1, s1) like 'ERR %not_admin%', pg_temp.lst(b1, s1));
  perform pg_temp.ng('L08 利用者からは呼べない', b1, 'authenticated', format('select public.admin_list_user_threads(%L, %L)', adm, s1), 'permission denied');
  perform pg_temp.eq('L09 一覧を見ただけでは操作ログに残さない', null, 'postgres',
    format('select count(*)::text from public.audit_logs where actor_id = %L and action like %L', adm, 'thread.%'), '0');

  -- 開く（理由を書く）--------------------------------------------------------------
  perform pg_temp.chk('O01 理由が空なら開けない', pg_temp.opn(adm, th, '') like 'ERR %pantia:bad_reason%', pg_temp.opn(adm, th, ''));
  perform pg_temp.chk('O02 空白だけ（全角の空白・改行を含む）なら開けない', pg_temp.opn(adm, th, E' 　\n\t ') like 'ERR %pantia:bad_reason%', pg_temp.opn(adm, th, E' 　\n\t '));
  perform pg_temp.chk('O03 201字なら開けない', pg_temp.opn(adm, th, repeat('あ', 201)) like 'ERR %pantia:bad_reason%', left(pg_temp.opn(adm, th, repeat('あ', 201)), 80));
  perform pg_temp.chk('O04 制御文字が入っていたら開けない', pg_temp.opn(adm, th, E'通報\u0007の確認') like 'ERR %pantia:bad_reason%', pg_temp.opn(adm, th, E'通報\u0007の確認'));
  perform pg_temp.chk('O05 理由が無い（null）なら開けない', pg_temp.opn(adm, th, null) like 'ERR %pantia:bad_reason%', coalesce(pg_temp.opn(adm, th, null), '(null)'));
  perform pg_temp.chk('O06 無い会話は開けない', pg_temp.opn(adm, gen_random_uuid(), '確認') like 'ERR %pantia:not_found%', '');
  perform pg_temp.chk('O07 片方が版1の同意しかない会話は開けない', pg_temp.opn(adm, th3, '確認') like 'ERR %pantia:consent_missing%', pg_temp.opn(adm, th3, '確認'));
  perform pg_temp.chk('O08 管理者でない id では開けない', pg_temp.opn(b1, th, '確認') like 'ERR %not_admin%', pg_temp.opn(b1, th, '確認'));
  perform pg_temp.ng('O09 利用者からは呼べない', b1, 'authenticated', format('select public.admin_open_thread(%L, %L, %L)', adm, th, '確認'), 'permission denied');
  perform pg_temp.eq('O10 断ったときは記録を作らない', null, 'postgres',
    format('select count(*)::text from public.audit_logs where actor_id = %L and action like %L', adm, 'thread.%'), '0');
  r := pg_temp.opn(adm, th, repeat('い', 200));
  perform pg_temp.chk('O11 200字ちょうどなら開ける', r !~ '^ERR', left(coalesce(r, ''), 80));
  perform pg_temp.run(null, 'postgres', format('update public.thread_view_grants set opened_at = now() - interval %L where reason = %L', '1 minute', repeat('い', 200)));
  r := pg_temp.opn(adm, th, '  取引の行き違いの申し出（#1001）  ');
  perform pg_temp.chk('O12 理由を書けば開ける（券の id を返す）', r ~ '^[0-9a-f-]{36}$', coalesce(r, ''));
  g := case when r ~ '^[0-9a-f-]{36}$' then r::uuid end;
  perform pg_temp.eq('O13 開いたことが理由つきで操作ログに残る（前後の空白は除く）', null, 'postgres',
    format('select detail ->> %L from public.audit_logs where actor_id = %L and action = %L and target_type = %L and target_id = %L order by id desc limit 1',
      'reason', adm, 'thread.opened', 'thread', th), '取引の行き違いの申し出（#1001）');
  perform pg_temp.ng('O14 券の表は利用者から読めない', b1, 'authenticated', 'select count(*) from public.thread_view_grants', 'permission denied');
  perform pg_temp.ng('O15 券の表に直接は書けない（関数からだけ）', null, 'service_role',
    format('insert into public.thread_view_grants (admin_id, thread_id, reason) values (%L, %L, %L)', adm2, th2, '直接'), 'permission denied');

  -- 読む --------------------------------------------------------------------------
  r := pg_temp.rd(adm, th);
  j := pg_temp.js(r);
  perform pg_temp.chk('R01 開いた管理者は読める', j is not null, left(coalesce(r, ''), 160));
  perform pg_temp.chk('R02 送った人の同意の後のメッセージだけ（同意の前の1通と、送り手なしの知らせは出さない）',
    jsonb_array_length(j -> 'messages') = 2
      and not exists (select 1 from jsonb_array_elements(j -> 'messages') e where e ->> 'body' in ('同意の前', '運営からの知らせ')),
    coalesce((select string_agg(e ->> 'body', ',') from jsonb_array_elements(j -> 'messages') e), r));
  perform pg_temp.chk('R03 会話の人・開いた理由・開いた時刻を返す',
    j ->> 'thread_id' = th::text and j ->> 'seller_id' = s1::text and j ->> 'buyer_id' = b1::text
      and j ->> 'reason' = '取引の行き違いの申し出（#1001）' and j ->> 'opened_at' is not null, left(coalesce(r, ''), 200));
  perform pg_temp.chk('R04 メッセージの項目（送り手・種類・本文・状態・時刻）を返す',
    j -> 'messages' -> 0 ? 'sender_id' and j -> 'messages' -> 0 ? 'kind' and j -> 'messages' -> 0 ? 'body'
      and j -> 'messages' -> 0 ? 'status' and j -> 'messages' -> 0 ? 'created_at' and j -> 'messages' -> 0 ? 'image_paths',
    left(coalesce(j -> 'messages' ->> 0, ''), 200));
  perform pg_temp.chk('R05 開いていない管理者は読めない', pg_temp.rd(adm2, th) like 'ERR %pantia:view_grant_required%', pg_temp.rd(adm2, th));
  perform pg_temp.chk('R06 開いていない会話は読めない', pg_temp.rd(adm, th2) like 'ERR %pantia:view_grant_required%', pg_temp.rd(adm, th2));
  perform pg_temp.chk('R07 管理者でない id では読めない', pg_temp.rd(b1, th) like 'ERR %not_admin%', pg_temp.rd(b1, th));
  perform pg_temp.ng('R08 利用者からは呼べない', b1, 'authenticated', format('select public.admin_view_any_thread(%L, %L)', adm, th), 'permission denied');
  perform pg_temp.chk('R09 無い会話は読めない', pg_temp.rd(adm, gen_random_uuid()) like 'ERR %pantia:view_grant_required%', '');

  -- 30分で切れる
  perform pg_temp.run(null, 'postgres', format('update public.thread_view_grants set opened_at = now() - interval %L where admin_id = %L and thread_id = %L', '29 minutes', adm, th));
  r := pg_temp.rd(adm, th);
  perform pg_temp.chk('R10 開いてから29分なら読める', r !~ '^ERR', left(coalesce(r, ''), 80));
  perform pg_temp.run(null, 'postgres', format('update public.thread_view_grants set opened_at = now() - interval %L where admin_id = %L and thread_id = %L', '31 minutes', adm, th));
  perform pg_temp.chk('R11 開いてから31分たつと読めない（開き直す）', pg_temp.rd(adm, th) like 'ERR %pantia:view_grant_required%', pg_temp.rd(adm, th));

  -- 同意を取り消した人のメッセージは、それ以後は見せない
  perform pg_temp.opn(adm, th, '再確認');
  perform pg_temp.run(b1, 'authenticated', 'select public.withdraw_message_terms()');
  j := pg_temp.js(pg_temp.rd(adm, th));
  perform pg_temp.chk('R12 同意を取り消した人のメッセージは見せない（相手の分だけ）',
    jsonb_array_length(j -> 'messages') = 1 and j -> 'messages' -> 0 ->> 'sender_id' = s1::text, coalesce(j::text, '(null)'));

  -- 長い会話は、新しい200件を古い順に
  insert into public.messages (thread_id, sender_id, kind, body, created_at)
  select th2, case when i % 2 = 0 then s1 else b2 end, 'text', 'n' || i, now() + make_interval(secs => i)
  from generate_series(1, 210) i;
  perform pg_temp.opn(adm, th2, '長い会話の確認');
  j := pg_temp.js(pg_temp.rd(adm, th2));
  perform pg_temp.chk('R13 新しい200件まで', jsonb_array_length(j -> 'messages') = 200, coalesce(jsonb_array_length(j -> 'messages')::text, '(null)'));
  perform pg_temp.chk('R14 古い順で、n11 から n210 まで',
    j -> 'messages' -> 0 ->> 'body' = 'n11' and j -> 'messages' -> 199 ->> 'body' = 'n210',
    coalesce(j -> 'messages' -> 0 ->> 'body', '') || ' .. ' || coalesce(j -> 'messages' -> 199 ->> 'body', ''));

  -- 記録
  perform pg_temp.eq('R15 読んだことが毎回、操作ログに残る（読めた4回だけ）', null, 'postgres',
    format('select count(*)::text from public.audit_logs where actor_id = %L and action = %L and target_type = %L', adm, 'thread.read', 'thread'), '4');
  perform pg_temp.eq('R16 開いたことは4回（200字・理由つき・再確認・長い会話）', null, 'postgres',
    format('select count(*)::text from public.audit_logs where actor_id = %L and action = %L', adm, 'thread.opened'), '4');
end $t$;
