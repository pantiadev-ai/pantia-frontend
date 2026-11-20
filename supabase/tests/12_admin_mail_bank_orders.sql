-- 12 メールの文面の上書き・キャラの口座を見る・新しい注文の件数と一覧（管理画面だけ）
-- 運営の画面と同じ道（service_role）で買う
create function pg_temp.co(p_buyer uuid, p_items jsonb, p_method text default 'mock') returns text language sql as $f$
  select pg_temp.val(null, 'service_role', format('select public.create_checkout(%L, %L::jsonb, %L, %L::jsonb)::text',
    p_buyer, p_items, p_method, pg_temp.addr()));
$f$;
create function pg_temp.items(variadic p_ids uuid[]) returns jsonb language sql as $f$
  select jsonb_agg(jsonb_build_object('listing_id', x, 'options', '{}'::jsonb)) from unnest(p_ids) x;
$f$;
-- 買う。p_pay なら入金まで済ませる。注文の id を返す
create function pg_temp.buy(p_buyer uuid, p_listing uuid, p_method text, p_pay boolean) returns uuid language plpgsql as $f$
declare r text; g uuid;
begin
  r := pg_temp.co(p_buyer, pg_temp.items(p_listing), p_method);
  if r like 'ERR %' then raise exception 'checkout 失敗: %', r; end if;
  g := (r::jsonb ->> 'group_id')::uuid;
  if p_pay then
    r := pg_temp.val(null, 'service_role', format('select public.mark_group_paid(%L, %L, %s)', g, 'pi_test', (r::jsonb ->> 'total')::integer));
    if r like 'ERR %' then raise exception '入金に失敗: %', r; end if;
  end if;
  return (select id from public.orders where group_id = g limit 1);
end $f$;
-- 3つの関数を呼ぶ SQL
create function pg_temp.setmt(p_admin uuid, p_key text, p_subject text, p_body text) returns text language sql as $f$
  select format('select public.admin_set_mail_template(%L, %L, %L, %L)', p_admin, p_key, p_subject, p_body);
$f$;
create function pg_temp.bank(p_admin uuid, p_user uuid) returns text language sql as $f$
  select format('select public.admin_character_bank(%L, %L)::text', p_admin, p_user);
$f$;
create function pg_temp.neworders(p_admin uuid, p_limit int) returns text language sql as $f$
  select format('select public.admin_new_orders(%L, %s)::text', p_admin, p_limit);
$f$;

do $t$
declare
  adm uuid; ch uuid; s1 uuid; b1 uuid;
  lt uuid; lc uuid; ls uuid;
  ot uuid; oc uuid; os uuid;
  r text;
begin
  adm := pg_temp.mkuser('運営', 'buyer');
  insert into public.admin_users (user_id) values (adm);
  ch := pg_temp.mkuser('キャラ花子', 'seller', 'unsubmitted');
  s1 := pg_temp.mkuser('みさき', 'seller');
  b1 := pg_temp.mkuser('たろう', 'buyer');
  perform pg_temp.ok('準備 キャラの印', null, 'service_role', format('select public.admin_mark_character(%L, %L, %L)', adm, ch, 'メモ'));

  -- 呼べる人 -------------------------------------------------------------------
  perform pg_temp.ng('S01 文面の表は匿名から読めない', null, 'anon', 'select count(*) from public.mail_templates', 'permission denied');
  perform pg_temp.ng('S01 文面を変える関数は匿名から呼べない', null, 'anon', pg_temp.setmt(adm, 'order.new', '件名', ''), 'permission denied');
  perform pg_temp.ng('S01 口座を見る関数は匿名から呼べない', null, 'anon', pg_temp.bank(adm, ch), 'permission denied');
  perform pg_temp.ng('S01 新しい注文の関数は匿名から呼べない', null, 'anon', pg_temp.neworders(adm, 10), 'permission denied');
  perform pg_temp.ng('S01b 文面の表はログイン中の管理者の画面からも読めない', adm, 'authenticated', 'select count(*) from public.mail_templates', 'permission denied');
  perform pg_temp.ng('S01b 文面を変える関数は画面から呼べない', adm, 'authenticated', pg_temp.setmt(adm, 'order.new', '件名', ''), 'permission denied');
  perform pg_temp.ng('S01b 口座を見る関数は画面から呼べない', adm, 'authenticated', pg_temp.bank(adm, ch), 'permission denied');
  perform pg_temp.ng('S01b 新しい注文の関数は画面から呼べない', adm, 'authenticated', pg_temp.neworders(adm, 10), 'permission denied');
  perform pg_temp.ng('S02 文面: 管理者でない id は断る', null, 'service_role', pg_temp.setmt(s1, 'order.new', '件名', ''), 'not_admin');
  perform pg_temp.ng('S02 口座: 管理者でない id は断る', null, 'service_role', pg_temp.bank(s1, ch), 'not_admin');
  perform pg_temp.ng('S02 新しい注文: 管理者でない id は断る', null, 'service_role', pg_temp.neworders(s1, 10), 'not_admin');

  -- メールの文面 -----------------------------------------------------------------
  perform pg_temp.ok('M01 件名と書き出しを保存できる', null, 'service_role', pg_temp.setmt(adm, 'order.new', ' 新しいご注文です ', E'ご注文ありがとうございます。\n確認してください。'));
  perform pg_temp.eq('M01 行ができ、前後の空白は除く', null, 'postgres',
    'select subject || ''/'' || (updated_by is not null)::text from public.mail_templates where key = ''order.new''', '新しいご注文です/true');
  perform pg_temp.eq('M01 記録が1行（reset=false）', null, 'postgres',
    format('select count(*)::text from public.audit_logs where action = %L and actor_id = %L and target_id = %L and detail ->> %L = %L',
      'mail_template.update', adm, 'order.new', 'reset', 'false'), '1');
  perform pg_temp.chk('M01 記録に文面そのものは入れない',
    (select bool_and(detail::text not like '%ご注文ありがとう%' and detail::text not like '%新しいご注文です%')
       from public.audit_logs where action = 'mail_template.update'), '');
  perform pg_temp.ok('M01 件名だけの上書きもできる', null, 'service_role', pg_temp.setmt(adm, 'order.shipped', '発送しました', null));
  perform pg_temp.eq('M01 書き出しは null のまま', null, 'postgres',
    'select coalesce(body, ''(null)'') from public.mail_templates where key = ''order.shipped''', '(null)');
  perform pg_temp.ok('M02 両方を空白だけで送ると既定に戻る', null, 'service_role', pg_temp.setmt(adm, 'order.new', '  ', E' \n '));
  perform pg_temp.eq('M02 行が消える', null, 'postgres', 'select count(*)::text from public.mail_templates where key = ''order.new''', '0');
  perform pg_temp.eq('M02 記録は reset=true', null, 'postgres',
    format('select count(*)::text from public.audit_logs where action = %L and target_id = %L and detail ->> %L = %L',
      'mail_template.update', 'order.new', 'reset', 'true'), '1');
  perform pg_temp.ok('M02b 行が無いときに戻しても断らない', null, 'service_role', pg_temp.setmt(adm, 'kyc.approved', null, null));
  perform pg_temp.ng('M03 key の形が違う', null, 'service_role', pg_temp.setmt(adm, 'Order.x', '件名', null), 'bad_request');
  perform pg_temp.ng('M03 件名に改行', null, 'service_role', pg_temp.setmt(adm, 'order.new', E'件名\n2行目', null), 'bad_request');
  perform pg_temp.ng('M03 件名は100字まで', null, 'service_role', pg_temp.setmt(adm, 'order.new', repeat('あ', 101), null), 'bad_request');
  perform pg_temp.ok('M03 件名100字は通る', null, 'service_role', pg_temp.setmt(adm, 'order.new', repeat('あ', 100), null));
  perform pg_temp.ng('M03 書き出しに制御文字', null, 'service_role', pg_temp.setmt(adm, 'order.new', null, 'ベル' || chr(7)), 'bad_request');
  perform pg_temp.ng('M03 書き出しは2000字まで', null, 'service_role', pg_temp.setmt(adm, 'order.new', null, repeat('あ', 2001)), 'bad_request');
  perform pg_temp.ok('M03 書き出しの改行は通る', null, 'service_role', pg_temp.setmt(adm, 'order.new', null, E'1行目\n2行目'));
  perform pg_temp.ng('M04 service_role から表へ直接は書けない', null, 'service_role',
    'insert into public.mail_templates (key, subject) values (''order.paid'', ''x'')', 'permission denied');
  perform pg_temp.ok('M05 service_role は表を読める（送り出しで使う）', null, 'service_role', 'select key, subject, body from public.mail_templates');

  -- キャラの口座 -------------------------------------------------------------------
  perform pg_temp.ng('B01 キャラでない人の口座は見せない', null, 'service_role', pg_temp.bank(adm, s1), 'bad_state');
  perform pg_temp.eq('B01 断ったときは記録しない', null, 'postgres',
    'select count(*)::text from public.audit_logs where action = ''bank_account.view''', '0');
  perform pg_temp.eq('B02 口座が無いキャラは null', null, 'service_role', pg_temp.bank(adm, ch), null);
  perform pg_temp.eq('B02 見たことを記録する（found=false）', null, 'postgres',
    format('select count(*)::text from public.audit_logs where action = %L and actor_id = %L and target_id = %L and detail ->> %L = %L',
      'bank_account.view', adm, ch, 'found', 'false'), '1');
  insert into public.bank_accounts (user_id, bank_name, branch_name, account_type, account_number, holder_kana)
  values (ch, 'テスト銀行', '本店', 'ordinary', '0123456', 'キャラハナコ');
  perform pg_temp.eq('B03 口座番号は7桁そのまま', null, 'service_role',
    format('select public.admin_character_bank(%L, %L) ->> %L', adm, ch, 'account_number'), '0123456');
  perform pg_temp.eq('B03 ほかの項目も返す', null, 'service_role',
    format('select r ->> %L || %L || (r ->> %L) || %L || (r ->> %L) || %L || (r ->> %L) || %L || (r ? %L)::text from public.admin_character_bank(%L, %L) r',
      'bank_name', '/', 'branch_name', '/', 'account_type', '/', 'holder_kana', '/', 'updated_at', adm, ch),
    'テスト銀行/本店/ordinary/キャラハナコ/true');
  perform pg_temp.chk('B03 記録に口座番号を入れない',
    (select count(*) = 3 and bool_and(detail::text not like '%0123456%') from public.audit_logs where action = 'bank_account.view'), '');

  -- 新しい注文 ---------------------------------------------------------------------
  perform pg_temp.ok('準備 振込の受付をオン', null, 'service_role', format('select public.admin_update_settings(%L, %L::jsonb)', adm,
    '{"transfer_enabled":true,"transfer_bank":"テスト銀行","transfer_branch":"本店","transfer_type":"ordinary","transfer_number":"1234567","transfer_holder":"カ）パンティア"}'));
  perform pg_temp.eq('N00 注文が無いときは 0件と空の一覧', null, 'service_role',
    format('select r ->> %L || %L || (r -> %L)::text from public.admin_new_orders(%L, 10) r', 'count', '/', 'items', adm), '0/[]');
  lt := pg_temp.listing(s1);
  lc := pg_temp.listing(ch);
  ls := pg_temp.listing(s1);
  os := pg_temp.buy(b1, ls, 'mock', true);       -- 一般の売手の入金済み
  oc := pg_temp.buy(b1, lc, 'mock', true);       -- キャラの入金済み
  ot := pg_temp.buy(b1, lt, 'transfer', false);  -- 振込の入金待ち
  -- 1つの transaction の中では now() が同じなので、新しい順が分かるように時刻をずらす
  update public.orders set created_at = now() - interval '3 minutes' where id = os;
  update public.orders set created_at = now() - interval '2 minutes' where id = oc;
  update public.orders set created_at = now() - interval '1 minute' where id = ot;
  perform pg_temp.eq('N01 前提: 3件の状態', null, 'postgres',
    format('select string_agg(status || %L || payment_method, %L order by created_at desc) from public.orders where id in (%L, %L, %L)', ':', ',', ot, oc, os),
    'pending:transfer,paid:mock,paid:mock');
  perform pg_temp.eq('N01 件数は振込待ち＋キャラの入金済み', null, 'service_role',
    format('select public.admin_new_orders(%L, 10) ->> %L', adm, 'count'), '2');
  perform pg_temp.eq('N01 一覧は3件、新しい順、キャラの行だけ印', null, 'service_role',
    format('select string_agg((x ->> %L)::uuid::text || %L || (x ->> %L), %L order by n) from jsonb_array_elements(public.admin_new_orders(%L, 10) -> %L) with ordinality t(x, n)',
      'id', ':', 'is_character', ',', adm, 'items'),
    ot::text || ':false,' || oc::text || ':true,' || os::text || ':false');
  perform pg_temp.eq('N01 行の項目（売手の名前・金額・注文番号）', null, 'service_role',
    format('select x ->> %L || %L || (x ->> %L) || %L || (x ->> %L) || %L || (x ->> %L)::int::text || %L || ((x ->> %L) is not null)::text || %L || (x ? %L)::text || %L || (x ? %L)::text'
           || ' from jsonb_array_elements(public.admin_new_orders(%L, 10) -> %L) x where x ->> %L = %L',
      'seller_name', '/', 'status', '/', 'payment_method', '/', 'total', '/', 'order_no', '/', 'title', '/', 'created_at',
      adm, 'items', 'id', oc),
    'キャラ花子/paid/mock/' || (select total::text from public.orders where id = oc) || '/true/true/true');
  update public.orders set status = 'preparing', preparing_at = now() where id = oc;
  perform pg_temp.eq('N01b キャラの発送準備中も数える', null, 'service_role',
    format('select public.admin_new_orders(%L, 10) ->> %L', adm, 'count'), '2');
  update public.orders set expires_at = now() - interval '1 minute' where id = ot;
  perform pg_temp.eq('N02 期限切れの振込待ちは数えない', null, 'service_role',
    format('select public.admin_new_orders(%L, 10) ->> %L', adm, 'count'), '1');
  perform pg_temp.eq('N02 期限切れの振込待ちは一覧にも出さない', null, 'service_role',
    format('select jsonb_array_length(public.admin_new_orders(%L, 10) -> %L)::text', adm, 'items'), '2');
  perform pg_temp.eq('N02 p_limit=0 は1件に丸める', null, 'service_role',
    format('select jsonb_array_length(public.admin_new_orders(%L, 0) -> %L)::text', adm, 'items'), '1');
  perform pg_temp.eq('N02 p_limit=999 は50件までに丸める（いまは2件）', null, 'service_role',
    format('select jsonb_array_length(public.admin_new_orders(%L, 999) -> %L)::text', adm, 'items'), '2');
  perform pg_temp.eq('N03 新しい注文を見ても記録しない', null, 'postgres',
    'select count(*)::text from public.audit_logs where action like ''order.%'' and actor_id = ''' || adm::text || '''', '0');
end $t$;
