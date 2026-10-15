-- 03 メッセージ（チャット）・つぶやき・いいね・コメント・保留と承認
do $t$
declare
  s1 uuid; s2 uuid; s0 uuid; b1 uuid; b2 uuid; b0 uuid; adm uuid;
  l1 uuid; l2 uuid; lo uuid;
  th uuid; th2 uuid; mh uuid; mt uuid; mi uuid;
  p1 uuid; p2 uuid; ph uuid; c1 uuid; ch uuid;
  g uuid; r text;
begin
  s1 := pg_temp.mkuser('みさき', 'seller');
  s2 := pg_temp.mkuser('ゆい', 'seller');
  s0 := pg_temp.mkuser('未確認', 'seller', 'unsubmitted');
  b1 := pg_temp.mkuser('たろう', 'buyer');
  b2 := pg_temp.mkuser('じろう', 'buyer');
  b0 := pg_temp.mkuser('未確認購入者', 'buyer', 'unsubmitted');
  adm := pg_temp.mkuser('運営', 'buyer');
  insert into public.admin_users (user_id) values (adm);
  l1 := pg_temp.listing(s1);
  lo := pg_temp.listing(s2);

  -- 会話を始める --------------------------------------------------------------
  perform pg_temp.ng('T01 本人確認前は会話を始められない', b0, 'authenticated', format('select public.open_thread(%L)', s1), 'kyc_required');
  r := pg_temp.val(b1, 'authenticated', format('select public.open_thread(%L)', s1));
  perform pg_temp.chk('T02 購入者は出品者と会話を始められる', r !~ '^ERR', r);
  th := r::uuid;
  perform pg_temp.eq('T03 2回目は同じ会話', b1, 'authenticated', format('select public.open_thread(%L)::text', s1), th::text);
  perform pg_temp.ng('T04 購入者どうしは会話できない', b1, 'authenticated', format('select public.open_thread(%L)', b2), 'unavailable');
  perform pg_temp.ng('T05 出品者からは取引の無い購入者に話しかけられない', s1, 'authenticated', format('select public.open_thread(%L)', b2), 'unavailable');
  update public.profiles set accept_messages = false where id = s2;
  perform pg_temp.ng('T06 受付を止めた出品者には話しかけられない', b1, 'authenticated', format('select public.open_thread(%L)', s2), 'messages_closed');
  perform pg_temp.ng('T07 本人確認前の出品者には話しかけられない', b1, 'authenticated', format('select public.open_thread(%L)', s0), 'messages_closed');
  perform pg_temp.ok('T08 出品者がブロック', s1, 'authenticated', format('insert into public.blocks (blocked_id) values (%L)', b2));
  perform pg_temp.ng('T09 ブロックされた人は会話を始められない', b2, 'authenticated', format('select public.open_thread(%L)', s1), 'unavailable');
  perform pg_temp.ng('T10 会話は画面から直接作れない', b1, 'authenticated', format('insert into public.threads (seller_id, buyer_id) values (%L, %L)', s2, b1), 'permission denied');

  -- 取引があれば受付を止めていても話せる
  r := pg_temp.val(null, 'service_role', format('select public.create_checkout(%L, %L::jsonb, %L, %L::jsonb)::text',
         b1, jsonb_build_array(jsonb_build_object('listing_id', lo)), 'mock', pg_temp.addr()));
  g := (r::jsonb ->> 'group_id')::uuid;
  perform pg_temp.val(null, 'service_role', format('select public.mark_group_paid(%L, %L, 3000)', g, 'pi'));
  r := pg_temp.val(b1, 'authenticated', format('select public.open_thread(%L)', s2));
  perform pg_temp.chk('T11 取引があれば受付を止めた出品者とも話せる', r !~ '^ERR', r);
  th2 := r::uuid;
  perform pg_temp.eq('T12 出品者からも取引のある購入者に話しかけられる（同じ会話）', s2, 'authenticated', format('select public.open_thread(%L)::text', b1), th2::text);
  update public.profiles set accept_messages = true where id = s2;

  -- 送る ----------------------------------------------------------------------
  perform pg_temp.ok('M01 文を送れる', b1, 'authenticated', format('select public.send_message(%L, %L)', th, 'はじめまして'));
  perform pg_temp.eq('M02 相手は読める', s1, 'authenticated', format('select count(*)::text from public.messages where thread_id = %L', th), '1');
  perform pg_temp.eq('M03 関係ない人は読めない', b2, 'authenticated', format('select count(*)::text from public.messages where thread_id = %L', th), '0');
  perform pg_temp.eq('M04 関係ない人には会話も見えない', s2, 'authenticated', format('select count(*)::text from public.threads where id = %L', th), '0');
  perform pg_temp.ng('M05 空の文は送れない', b1, 'authenticated', format('select public.send_message(%L, %L)', th, '   '), 'bad_message');
  perform pg_temp.ng('M06 1000字を超える文は送れない', b1, 'authenticated', format('select public.send_message(%L, %L)', th, repeat('あ', 1001)), 'bad_message');
  perform pg_temp.ng('M07 別の会話の画像の場所は使えない', b1, 'authenticated',
    format('select public.send_message(%L, %L, array[%L])', th, '', th2::text || '/' || gen_random_uuid()::text || '.webp'), 'bad_message');
  perform pg_temp.ng('M08 画像の場所に ../ は入れられない', b1, 'authenticated',
    format('select public.send_message(%L, %L, array[%L])', th, '', th::text || '/../x.webp'), 'bad_message');
  r := pg_temp.val(b1, 'authenticated', format('select public.send_message(%L, %L, array[%L])', th, '写真です', th::text || '/' || gen_random_uuid()::text || '.webp'));
  perform pg_temp.chk('M09 この会話の画像は送れる', r !~ '^ERR', r);
  mi := r::uuid;
  perform pg_temp.eq('M10 画像の文の種類', null, 'postgres', format('select kind from public.messages where id = %L', mi), 'image');
  perform pg_temp.ng('M11 ほかの出品者の商品は添付できない', b1, 'authenticated', format('select public.send_message(%L, %L, %L, %L)', th, '', '{}', lo), 'bad_message');
  perform pg_temp.ng('M12 購入者は商品を添付できない（紹介は出品者だけ）', b1, 'authenticated', format('select public.send_message(%L, %L, %L, %L)', th, 'これ', '{}', l1), 'bad_message');
  perform pg_temp.ng('M13 画像と商品は一緒に送れない', b1, 'authenticated',
    format('select public.send_message(%L, %L, array[%L], %L)', th, '', th::text || '/' || gen_random_uuid()::text || '.webp', l1), 'bad_message');
  perform pg_temp.eq('M14 相手へのお知らせは未読の間は1件だけ', null, 'postgres',
    format('select count(*)::text from public.notifications where user_id = %L and kind = %L', s1, 'message'), '1');
  perform pg_temp.eq('M15 未読の数', s1, 'authenticated', 'select public.my_unread_messages()::text', '2');
  perform pg_temp.eq('M16 会話の一覧に相手の名前（伏せ字）', s1, 'authenticated', format('select other_name from public.my_threads() where thread_id = %L', th), 'た***さん');
  perform pg_temp.ok('M17 既読にする', s1, 'authenticated', format('select public.mark_thread_read(%L)', th));
  perform pg_temp.eq('M18 既読で未読0・お知らせも既読', s1, 'authenticated',
    'select public.my_unread_messages() || ''/'' || (select count(*) from public.notifications where kind = ''message'' and read_at is null)', '0/0');
  perform pg_temp.ng('M18b 出品者もほかの出品者の商品は紹介できない', s1, 'authenticated', format('select public.send_message(%L, %L, %L, %L)', th, '', '{}', lo), 'bad_message');
  r := pg_temp.val(s1, 'authenticated', format('select public.send_message(%L, %L, %L, %L)', th, 'これはいかが', '{}', l1));
  perform pg_temp.chk('M18c 出品者は自分の商品を紹介できる', r !~ '^ERR', r);
  perform pg_temp.eq('M18d 紹介の文の種類', null, 'postgres', format('select kind from public.messages where id = %L', r), 'item');
  perform pg_temp.ng('M19 メッセージは画面から直接書けない', b1, 'authenticated',
    format('insert into public.messages (thread_id, sender_id, kind, body) values (%L, %L, %L, %L)', th, s1, 'text', 'なりすまし'), 'permission denied');
  perform pg_temp.ng('M20 メッセージは画面から直せない', b1, 'authenticated', format('update public.messages set body = %L where thread_id = %L', 'x', th), 'permission denied');
  perform pg_temp.ng('M21 関係ない人は送れない', s2, 'authenticated', format('select public.send_message(%L, %L)', th, '割り込み'), 'unavailable');

  -- ♥ -------------------------------------------------------------------------
  select id into mt from public.messages where thread_id = th and kind = 'text' order by created_at limit 1;
  perform pg_temp.eq('H01 相手の文に♥を付けられる', s1, 'authenticated', format('select public.toggle_message_heart(%L)::text', mt), 'true');
  perform pg_temp.ng('H02 自分の文には付けられない', b1, 'authenticated', format('select public.toggle_message_heart(%L)', mt), 'unavailable');
  perform pg_temp.ng('H03 関係ない人は付けられない', s2, 'authenticated', format('select public.toggle_message_heart(%L)', mt), 'unavailable');
  perform pg_temp.eq('H04 もう一度で外れる', s1, 'authenticated', format('select public.toggle_message_heart(%L)::text', mt), 'false');

  -- スパムの保留と承認 --------------------------------------------------------
  r := pg_temp.val(b1, 'authenticated', format('select public.send_message(%L, %L)', th, 'LINE IDおしえて abc@example.com'));
  perform pg_temp.chk('S01 外への誘導は送れるが保留になる', r !~ '^ERR', r);
  mh := r::uuid;
  perform pg_temp.eq('S02 保留は相手に見えない', s1, 'authenticated', format('select count(*)::text from public.messages where id = %L', mh), '0');
  perform pg_temp.eq('S03 保留は送った本人には見える', b1, 'authenticated', format('select status from public.messages where id = %L', mh), 'held');
  perform pg_temp.eq('S04 保留は会話の一覧の最後の文にしない', null, 'postgres', format('select (last_message_preview not like %L)::text from public.threads where id = %L', '%LINE%', th), 'true');
  perform pg_temp.eq('S05 保留は相手に知らせない', null, 'postgres',
    format('select count(*)::text from public.notifications where user_id = %L and kind = %L and read_at is null', s1, 'message'), '0');
  perform pg_temp.eq('S06 保留は監査ログに残る', null, 'postgres',
    format('select count(*)::text from public.audit_logs where action = %L and target_id = %L', 'moderation.held', mh), '1');
  perform pg_temp.ng('S07 画面からは承認できない', adm, 'authenticated', format('select public.admin_moderate(%L, %L, %L, %L)', adm, 'message', mh, 'approve'), 'permission denied');
  perform pg_temp.ng('S08 管理者でない人の id では承認できない', null, 'service_role', format('select public.admin_moderate(%L, %L, %L, %L)', b1, 'message', mh, 'approve'), 'not_admin');
  perform pg_temp.ok('S09 管理者は承認できる', null, 'service_role', format('select public.admin_moderate(%L, %L, %L, %L)', adm, 'message', mh, 'approve'));
  perform pg_temp.eq('S10 承認したら相手に見える', s1, 'authenticated', format('select count(*)::text from public.messages where id = %L', mh), '1');
  perform pg_temp.eq('S11 承認したら相手に知らせる', null, 'postgres',
    format('select count(*)::text from public.notifications where user_id = %L and kind = %L and read_at is null', s1, 'message'), '1');
  perform pg_temp.ng('S12 同じ承認は2回できない', null, 'service_role', format('select public.admin_moderate(%L, %L, %L, %L)', adm, 'message', mh, 'approve'), 'bad_state');
  perform pg_temp.ok('S13 管理者は隠せる', null, 'service_role', format('select public.admin_moderate(%L, %L, %L, %L)', adm, 'message', mh, 'hide'));
  perform pg_temp.eq('S14 隠した文は会話の一覧の最後の文に残らない', null, 'postgres', format('select (last_message_preview not like %L)::text from public.threads where id = %L', '%LINE%', th), 'true');
  perform pg_temp.eq('S15 隠した文は送った本人にも見えない', b1, 'authenticated', format('select count(*)::text from public.messages where id = %L', mh), '0');
  perform pg_temp.eq('S16 承認・非表示は監査ログに残る', null, 'postgres',
    format('select count(*)::text from public.audit_logs where target_id = %L and action in (%L, %L) and actor_id = %L', mh, 'moderation.approve', 'moderation.hide', adm), '2');
  perform pg_temp.ng('S17 決済完了などのお知らせは隠せない', null, 'service_role',
    format('select public.admin_moderate(%L, %L, (select id from public.messages where thread_id = %L and kind = %L limit 1), %L)', adm, 'message', th2, 'system', 'hide'), 'bad_state');
  update public.site_settings set mod_spam_filter = false where id;
  r := pg_temp.val(b1, 'authenticated', format('select public.send_message(%L, %L)', th, 'インスタやってます'));
  perform pg_temp.eq('S18 スパムフィルターを切ると保留にしない', null, 'postgres', format('select status from public.messages where id = %L', r), 'visible');
  update public.site_settings set mod_spam_filter = true where id;

  -- 通知を止める・ブロック・停止 ----------------------------------------------
  perform pg_temp.ok('N01 出品者がこの会話の通知を止める', s1, 'authenticated', format('select public.set_thread_muted(%L, true)', th));
  perform pg_temp.ok('N02 既読にしておく', s1, 'authenticated', format('select public.mark_thread_read(%L)', th));
  perform pg_temp.ok('N03 止めた会話にも送れる', b1, 'authenticated', format('select public.send_message(%L, %L)', th, 'まだですか'));
  perform pg_temp.eq('N04 止めた会話はお知らせしない', null, 'postgres',
    format('select count(*)::text from public.notifications where user_id = %L and kind = %L and read_at is null', s1, 'message'), '0');
  perform pg_temp.ok('N05 関係ない人が通知を止めようとする', s2, 'authenticated', format('select public.set_thread_muted(%L, true)', th));
  perform pg_temp.eq('N05b 関係ない人の操作では何も変わらない', null, 'postgres', format('select seller_muted || %L || buyer_muted from public.threads where id = %L', '/', th), 'true/false');
  perform pg_temp.ok('N06 出品者が購入者をブロック', s1, 'authenticated', format('insert into public.blocks (blocked_id) values (%L)', b1));
  perform pg_temp.ng('N07 ブロック中は送れない', b1, 'authenticated', format('select public.send_message(%L, %L)', th, 'なぜ'), 'unavailable');
  perform pg_temp.ng('N08 ブロックした側も送れない', s1, 'authenticated', format('select public.send_message(%L, %L)', th, 'x'), 'unavailable');
  perform pg_temp.ok('N09 ブロックを外す', s1, 'authenticated', format('delete from public.blocks where blocked_id = %L', b1));
  update public.profiles set status = 'suspended' where id = s1;
  perform pg_temp.ng('N10 停止中の相手には送れない', b1, 'authenticated', format('select public.send_message(%L, %L)', th, 'x'), 'unavailable');
  perform pg_temp.ng('N11 停止中の本人は送れない', s1, 'authenticated', format('select public.send_message(%L, %L)', th, 'x'), 'kyc_required');
  update public.profiles set status = 'active' where id = s1;
  update public.profiles set accept_messages = false where id = s1;
  perform pg_temp.ng('N12 受付を止めた出品者へは（取引が無ければ）送れない', b1, 'authenticated', format('select public.send_message(%L, %L)', th, 'x'), 'messages_closed');
  perform pg_temp.ok('N13 出品者からは送れる', s1, 'authenticated', format('select public.send_message(%L, %L)', th, '今週発送します'));
  update public.profiles set accept_messages = true where id = s1;

  -- つぶやき ------------------------------------------------------------------
  perform pg_temp.ok('P00 購入者が出品者をフォロー', b1, 'authenticated', format('insert into public.follows (seller_id) values (%L)', s1));
  r := pg_temp.val(s1, 'authenticated', format('insert into public.posts (body) values (%L) returning id', '新作です #パンティ #新作 ＃パンティ'));
  perform pg_temp.chk('P01 出品者はつぶやける', r !~ '^ERR', r);
  p1 := r::uuid;
  perform pg_temp.eq('P02 タグは本文から取り出す（重ならない）', null, 'postgres', format('select array_to_string(array(select unnest(tags) order by 1), %L) from public.posts where id = %L', ',', p1), 'パンティ,新作');
  perform pg_temp.eq('P03 フォロワーに知らせる', null, 'postgres', format('select count(*)::text from public.notifications where user_id = %L and kind = %L', b1, 'post'), '1');
  perform pg_temp.ng('P04 購入者はつぶやけない', b1, 'authenticated', format('insert into public.posts (body) values (%L)', 'x'), 'row-level security');
  perform pg_temp.ng('P05 本人確認前の出品者はつぶやけない', s0, 'authenticated', format('insert into public.posts (body) values (%L)', 'x'), 'row-level security');
  perform pg_temp.ng('P06 140字を超えるとつぶやけない', s1, 'authenticated', format('insert into public.posts (body) values (%L)', repeat('あ', 141)), 'check');
  perform pg_temp.ng('P07 空はつぶやけない', s1, 'authenticated', format('insert into public.posts (body) values (%L)', '  '), 'check');
  perform pg_temp.ng('P08 ほかの出品者の商品は添付できない', s1, 'authenticated', format('insert into public.posts (body, listing_id) values (%L, %L)', 'x', lo), 'row-level security');
  r := pg_temp.val(s1, 'authenticated', format('insert into public.posts (body, listing_id) values (%L, %L) returning id', '出品しました', l1));
  perform pg_temp.chk('P09 自分の商品は添付できる', r !~ '^ERR', r);
  p2 := r::uuid;
  perform pg_temp.eq('P10 添付した商品のカテゴリが入る', null, 'postgres', format('select category from public.posts where id = %L', p2), 'panty');
  perform pg_temp.ng('P11 書いた人の id は画面から決められない', s2, 'authenticated', format('insert into public.posts (author_id, body) values (%L, %L)', s1, 'なりすまし'), 'permission denied');
  perform pg_temp.ng('P12 いいねの数は画面から変えられない', s1, 'authenticated', format('update public.posts set like_count = 100 where id = %L', p1), 'permission denied');
  perform pg_temp.ng('P13 他人の画像の場所は使えない', s1, 'authenticated',
    format('insert into public.posts (body, image_paths) values (%L, array[%L])', 'x', s2::text || '/' || gen_random_uuid()::text || '.webp'), 'check');
  perform pg_temp.ok('P14 本文を直せる', s1, 'authenticated', format('update public.posts set body = %L where id = %L', '新作です #パンティ', p1));
  perform pg_temp.eq('P15 直したら編集の印', null, 'postgres', format('select (edited_at is not null)::text from public.posts where id = %L', p1), 'true');
  perform pg_temp.eq('P16 他人のつぶやきは直せない（0行）', s2, 'authenticated',
    format('with u as (update public.posts set body = %L where id = %L returning 1) select count(*)::text from u', 'x', p1), '0');
  perform pg_temp.ok('P17 ピン留めできる', s1, 'authenticated', format('select public.pin_post(%L, true)', p1));
  perform pg_temp.ok('P18 別のつぶやきをピン留め', s1, 'authenticated', format('select public.pin_post(%L, true)', p2));
  perform pg_temp.eq('P19 ピンは1件だけ', null, 'postgres', format('select string_agg(pinned::text, %L order by created_at, id) from public.posts where id in (%L, %L)', ',', p1, p2),
    (select string_agg((id = p2)::text, ',' order by created_at, id) from public.posts where id in (p1, p2)));
  perform pg_temp.ng('P20 他人のつぶやきはピン留めできない', s2, 'authenticated', format('select public.pin_post(%L, true)', p1), 'unavailable');
  r := pg_temp.val(s1, 'authenticated', format('insert into public.posts (body) values (%L) returning id', 'LINEで連絡ください'));
  ph := r::uuid;
  perform pg_temp.eq('P21 外への誘導は保留', null, 'postgres', format('select status from public.posts where id = %L', ph), 'held');
  perform pg_temp.eq('P22 保留のつぶやきは他人に見えない', null, 'anon', format('select count(*)::text from public.posts where id = %L', ph), '0');
  perform pg_temp.eq('P23 保留のつぶやきは本人に見える', s1, 'authenticated', format('select count(*)::text from public.posts where id = %L', ph), '1');
  perform pg_temp.eq('P24 保留はフォロワーに知らせない', null, 'postgres', format('select count(*)::text from public.notifications where user_id = %L and kind = %L', b1, 'post'), '2');
  perform pg_temp.ok('P25 管理者が承認', null, 'service_role', format('select public.admin_moderate(%L, %L, %L, %L)', adm, 'post', ph, 'approve'));
  perform pg_temp.eq('P26 承認したらフォロワーに知らせる', null, 'postgres', format('select count(*)::text from public.notifications where user_id = %L and kind = %L', b1, 'post'), '3');
  perform pg_temp.ok('P27 管理者が隠す（ピンも外れる）', null, 'service_role', format('select public.admin_moderate(%L, %L, %L, %L)', adm, 'post', p2, 'hide'));
  perform pg_temp.eq('P28 隠したつぶやきは本人が戻せない', s1, 'authenticated',
    format('with u as (update public.posts set body = %L where id = %L returning 1) select count(*)::text from u', '戻して', p2), '0');
  perform pg_temp.eq('P29 隠したつぶやきは誰にも見えない', null, 'anon', format('select count(*)::text from public.posts where id = %L', p2), '0');
  perform pg_temp.eq('P30 ブロックした相手のつぶやきは見えない', b2, 'authenticated', format('select count(*)::text from public.posts where author_id = %L', s1), '0');
  perform pg_temp.eq('P31 トレンドタグ', null, 'anon', 'select tag || ''/'' || n from public.trend_tags(7, 1)', 'パンティ/1');

  -- いいね --------------------------------------------------------------------
  perform pg_temp.ok('K01 いいねできる', b1, 'authenticated', format('insert into public.post_likes (post_id) values (%L)', p1));
  perform pg_temp.eq('K02 いいねの数が増える', null, 'anon', format('select like_count::text from public.posts where id = %L', p1), '1');
  perform pg_temp.ng('K03 2回はできない', b1, 'authenticated', format('insert into public.post_likes (post_id) values (%L)', p1), 'duplicate');
  perform pg_temp.ng('K04 隠したつぶやきにはできない', b1, 'authenticated', format('insert into public.post_likes (post_id) values (%L)', p2), 'row-level security');
  perform pg_temp.ng('K05 他人の名前ではできない', b1, 'authenticated', format('insert into public.post_likes (user_id, post_id) values (%L, %L)', s2, p1), 'permission denied');
  perform pg_temp.eq('K06 他人のいいねの一覧は見えない', s1, 'authenticated', 'select count(*)::text from public.post_likes', '0');
  perform pg_temp.ok('K07 いいねを外せる', b1, 'authenticated', format('delete from public.post_likes where post_id = %L', p1));
  perform pg_temp.eq('K08 外すと数が減る', null, 'anon', format('select like_count::text from public.posts where id = %L', p1), '0');
  perform pg_temp.ng('K09 匿名はいいねできない', null, 'anon', format('insert into public.post_likes (post_id) values (%L)', p1), 'permission denied');

  -- コメント ------------------------------------------------------------------
  r := pg_temp.val(b1, 'authenticated', format('insert into public.post_comments (post_id, body) values (%L, %L) returning id', p1, 'かわいい'));
  perform pg_temp.chk('C01 コメントできる', r !~ '^ERR', r);
  c1 := r::uuid;
  perform pg_temp.eq('C02 コメント数が増え、つぶやいた人に知らせる', null, 'postgres',
    format('select (select comment_count from public.posts where id = %L) || %L || (select count(*) from public.notifications where user_id = %L and kind = %L)', p1, '/', s1, 'comment'), '1/1');
  perform pg_temp.ng('C03 本人確認前はコメントできない', b0, 'authenticated', format('insert into public.post_comments (post_id, body) values (%L, %L)', p1, 'x'), 'row-level security');
  perform pg_temp.ng('C04 ブロックされた人はコメントできない', b2, 'authenticated', format('insert into public.post_comments (post_id, body) values (%L, %L)', p1, 'x'), 'row-level security');
  perform pg_temp.ng('C05 200字を超えるとコメントできない', b1, 'authenticated', format('insert into public.post_comments (post_id, body) values (%L, %L)', p1, repeat('あ', 201)), 'check');
  r := pg_temp.val(b1, 'authenticated', format('insert into public.post_comments (post_id, body) values (%L, %L) returning id', p1, 'twitterフォローして'));
  ch := r::uuid;
  perform pg_temp.eq('C06 外への誘導は保留・数に入れない', null, 'postgres',
    format('select (select status from public.post_comments where id = %L) || %L || (select comment_count from public.posts where id = %L)', ch, '/', p1), 'held/1');
  perform pg_temp.eq('C07 保留のコメントは他人に見えない', null, 'anon', format('select count(*)::text from public.post_comments where post_id = %L', p1), '1');
  perform pg_temp.ng('C08 コメントの状態は画面から変えられない', b1, 'authenticated', format('update public.post_comments set status = %L where id = %L', 'visible', ch), 'permission denied');
  perform pg_temp.ok('C09 管理者が承認', null, 'service_role', format('select public.admin_moderate(%L, %L, %L, %L)', adm, 'comment', ch, 'approve'));
  perform pg_temp.eq('C10 承認で数に入り、つぶやいた人に知らせる', null, 'postgres',
    format('select (select comment_count from public.posts where id = %L) || %L || (select count(*) from public.notifications where user_id = %L and kind = %L)', p1, '/', s1, 'comment'), '2/2');
  perform pg_temp.ok('C11 管理者が隠す', null, 'service_role', format('select public.admin_moderate(%L, %L, %L, %L)', adm, 'comment', ch, 'hide'));
  perform pg_temp.eq('C12 隠すと数から外れる', null, 'anon', format('select comment_count::text from public.posts where id = %L', p1), '1');
  perform pg_temp.eq('C13 関係ない人は他人のコメントを消せない（0行）', s2, 'authenticated',
    format('with d as (delete from public.post_comments where id = %L returning 1) select count(*)::text from d', c1), '0');
  perform pg_temp.ok('C14 つぶやいた人は他人のコメントを消せる', s1, 'authenticated', format('delete from public.post_comments where id = %L', c1));
  perform pg_temp.eq('C15 消すと数が減る', null, 'anon', format('select comment_count::text from public.posts where id = %L', p1), '0');
  perform pg_temp.ok('C16 隠したコメントを消しても数は減らない', null, 'postgres', format('delete from public.post_comments where id = %L', ch));
  perform pg_temp.eq('C17 数は0のまま', null, 'anon', format('select comment_count::text from public.posts where id = %L', p1), '0');
  perform pg_temp.ok('C18 つぶやいた本人のコメントは本人に知らせない', s1, 'authenticated', format('insert into public.post_comments (post_id, body) values (%L, %L)', p1, 'ありがとう'));
  perform pg_temp.eq('C19 本人への知らせは増えない', null, 'postgres', format('select count(*)::text from public.notifications where user_id = %L and kind = %L', s1, 'comment'), '2');

  -- 外への誘導の判定（当たる／当たらない） -------------------------------------
  perform pg_temp.eq('G01 外への誘導に当たる', null, 'anon',
    $q$select string_agg(public.looks_spammy(x)::text, ',') from unnest(array['LINEで連絡ください', 'line id教えて', 'ラインやってる？', 'ＬＩＮＥ', 'https://x.example', 'a@b.jp',
      '090-1234-5678', '０９０', 'インスタ見て', 'telegram', 'ディスコで'])x$q$,
    'true,true,true,true,true,true,true,true,true,true,true');
  perform pg_temp.eq('G02 普通の文には当たらない', null, 'anon',
    $q$select string_agg(public.looks_spammy(x)::text, ',') from unnest(array['オンラインで買いました', 'ヒップラインがきれい', 'ガイドライン', 'online', 'ありがとうございます', '2日着用です', '3000円'])x$q$,
    'false,false,false,false,false,false,false');

  -- 消す ----------------------------------------------------------------------
  perform pg_temp.ok('D01 自分のつぶやきを消せる', s1, 'authenticated', format('delete from public.posts where id = %L', p1));
  perform pg_temp.eq('D02 他人のつぶやきは消せない（0行）', s2, 'authenticated',
    format('with d as (delete from public.posts where id = %L returning 1) select count(*)::text from d', ph), '0');
end $t$;
