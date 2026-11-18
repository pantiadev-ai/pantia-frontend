-- 09 会話の「交渉中」の札（売手だけが付け外し、2人に見える）
do $t$
declare
  s1 uuid; s2 uuid; b1 uuid; b2 uuid;
  th uuid; at0 text; un0 text;
begin
  s1 := pg_temp.mkuser('みさき', 'seller');
  s2 := pg_temp.mkuser('ゆい', 'seller');
  b1 := pg_temp.mkuser('たろう', 'buyer');
  b2 := pg_temp.mkuser('じろう', 'buyer');
  th := pg_temp.val(b1, 'authenticated', format('select public.open_thread(%L)', s1))::uuid;
  perform pg_temp.ok('N00 購入者が売手に送る', b1, 'authenticated', format('select public.send_message(%L, %L)', th, 'こんにちは'));
  -- 試験は1つの取引の中で動くので now() が変わらない。最後の時刻を1日戻しておかないと、関数が now() に書き換えても N08 で見分けられない
  update public.threads set last_message_at = now() - interval '1 day' where id = th;
  at0 := (select last_message_at::text from public.threads where id = th);
  un0 := pg_temp.val(s1, 'authenticated', format('select unread::text from public.my_threads() where thread_id = %L', th));

  perform pg_temp.eq('N00b 始めは交渉中でない', b1, 'authenticated', format('select negotiating::text from public.threads where id = %L', th), 'false');
  perform pg_temp.ng('N01 匿名からは呼べない', null, 'anon', format('select public.set_thread_negotiating(%L, true)', th), 'permission denied');
  perform pg_temp.eq('N02 売手は自分の会話に付けられる（戻り値は付けたあとの値）', s1, 'authenticated', format('select public.set_thread_negotiating(%L, true)::text', th), 'true');
  perform pg_temp.eq('N02b 付いている', null, 'postgres', format('select negotiating::text from public.threads where id = %L', th), 'true');

  perform pg_temp.ng('N03 購入者は付け外しできない', b1, 'authenticated', format('select public.set_thread_negotiating(%L, false)', th), 'pantia:forbidden');
  perform pg_temp.ng('N04 関係のない売手は付け外しできない', s2, 'authenticated', format('select public.set_thread_negotiating(%L, false)', th), 'pantia:forbidden');
  perform pg_temp.ng('N04b 関係のない購入者も付け外しできない', b2, 'authenticated', format('select public.set_thread_negotiating(%L, false)', th), 'pantia:forbidden');
  perform pg_temp.eq('N04c 拒否のあと値はそのまま', null, 'postgres', format('select negotiating::text from public.threads where id = %L', th), 'true');

  perform pg_temp.ng('N05 画面から表を直接は直せない（売手）', s1, 'authenticated', format('update public.threads set negotiating = false where id = %L', th), 'permission denied');
  perform pg_temp.ng('N05b 画面から表を直接は直せない（購入者）', b1, 'authenticated', format('update public.threads set negotiating = false where id = %L', th), 'permission denied');

  perform pg_temp.eq('N06 購入者の会話の一覧にも交渉中が見える', b1, 'authenticated', format('select negotiating::text from public.my_threads() where thread_id = %L', th), 'true');
  perform pg_temp.eq('N06b 売手の会話の一覧にも見える', s1, 'authenticated', format('select negotiating::text from public.my_threads() where thread_id = %L', th), 'true');

  perform pg_temp.eq('N07 外すと false', s1, 'authenticated', format('select public.set_thread_negotiating(%L, false)::text', th), 'false');
  perform pg_temp.eq('N07b 購入者の一覧でも外れている', b1, 'authenticated', format('select negotiating::text from public.my_threads() where thread_id = %L', th), 'false');
  perform pg_temp.ng('N07c null は受けない', s1, 'authenticated', format('select public.set_thread_negotiating(%L, null)', th), 'pantia:bad_request');
  perform pg_temp.ng('N07d 無い会話は拒否', s1, 'authenticated', format('select public.set_thread_negotiating(%L, true)', gen_random_uuid()), 'pantia:forbidden');

  perform pg_temp.eq('N08 付け外しで会話の並び（最後の時刻）は変わらない', null, 'postgres', format('select last_message_at::text from public.threads where id = %L', th), at0);
  perform pg_temp.eq('N08b 付け外しで未読の数は変わらない', s1, 'authenticated', format('select unread::text from public.my_threads() where thread_id = %L', th), un0);
  perform pg_temp.eq('N08c 未読のバッジの合計も今までどおり動く', s1, 'authenticated', 'select public.my_unread_messages()::text', un0);
end $t$;
