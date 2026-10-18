/* 担当 C: 取引以外のお知らせ（メッセージ・フォロー・新しいつぶやき・コメント）と、お知らせの画面（既読・すべて既読・削除・権限） */
import { lit, loginAs, sql, userClient } from "./_db";
import { freshBuyer, freshSeller, rnd, seedNotification, seedPost, seedThread } from "./_c";
import { expect, test } from "./_fixtures";

async function unreadOf(userId: string, kind?: string): Promise<number> {
  const rows = await sql<{ n: number }>(
    `select count(*)::int as n from public.notifications where user_id = ${lit(userId)} and read_at is null${kind ? ` and kind = ${lit(kind)}` : ""}`,
  );
  return rows[0]!.n;
}

test.describe("お知らせが届く", () => {
  test("メッセージを送ると相手のヘッダーとお知らせに出て、そのリンクから会話が開く", async ({ page, context }) => {
    const seller = await freshSeller("no-msg");
    const buyer = await freshBuyer("no-msg");
    const tid = await seedThread(seller, buyer);
    await loginAs(context, buyer);
    await page.goto(`/messages/${tid}`);
    const body = `お知らせの確かめ ${rnd()}`;
    await page.getByRole("textbox", { name: "メッセージ" }).fill(body);
    await page.getByRole("button", { name: "送信" }).click();
    await expect(page.locator(".bubble.mine", { hasText: body })).toBeVisible();

    await loginAs(context, seller);
    await page.goto("/mypage");
    await expect(page.getByRole("link", { name: "お知らせ（未読 1件）" })).toBeVisible();
    await page.goto("/notifications");
    const item = page.locator(".acc-noti", { hasText: body });
    await expect(item).toHaveClass(/unread/);
    // 購入者の公開名は「K***さん」。題は「K***さんからメッセージ」になる（「さん」が重ならない）
    await expect.soft(item.locator(".msg-name")).toHaveText("K***さんからメッセージ");
    await item.getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/messages/${tid}$`));
    await expect(page.locator(".bubble.theirs", { hasText: body })).toBeVisible();
    await expect.poll(() => unreadOf(seller.id, "message")).toBe(0);
  });

  test("会話のお知らせを止めると、新しいメッセージが来てもお知らせが増えず、再開すると届く", async ({ page, context }) => {
    const seller = await freshSeller("no-mute");
    const buyer = await freshBuyer("no-mute");
    const tid = await seedThread(seller, buyer);
    await loginAs(context, seller);
    await page.goto(`/messages/${tid}`);
    await page.getByRole("button", { name: "お知らせを止める" }).click();
    await expect(page.getByRole("button", { name: "お知らせを再開する" })).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(async () => (await sql<{ m: boolean }>(`select seller_muted as m from public.threads where id = ${lit(tid)}`))[0]!.m)
      .toBe(true);

    const db = await userClient(buyer);
    const first = await db.rpc("send_message", { p_thread: tid, p_body: `止めている間 ${rnd()}`, p_image_paths: [], p_listing: undefined });
    expect(first.error).toBeNull();
    expect(await unreadOf(seller.id, "message")).toBe(0);

    await page.getByRole("button", { name: "お知らせを再開する" }).click();
    await expect(page.getByRole("button", { name: "お知らせを止める" })).toHaveAttribute("aria-pressed", "false");
    await expect
      .poll(async () => (await sql<{ m: boolean }>(`select seller_muted as m from public.threads where id = ${lit(tid)}`))[0]!.m)
      .toBe(false);
    // 開いている画面が既読にしないよう、別の画面へ移ってから送る
    await page.goto("/mypage");
    const second = await db.rpc("send_message", { p_thread: tid, p_body: `再開のあと ${rnd()}`, p_image_paths: [], p_listing: undefined });
    expect(second.error).toBeNull();
    expect(await unreadOf(seller.id, "message")).toBe(1);
  });

  test("設定で『メッセージの通知』を切ると、メッセージが来てもお知らせが増えない", async ({ page, context }) => {
    const seller = await freshSeller("no-off");
    const buyer = await freshBuyer("no-off");
    const tid = await seedThread(seller, buyer);
    await loginAs(context, seller);
    await page.goto("/settings");
    const box = page.getByRole("checkbox", { name: "メッセージの通知" });
    await expect(box).toBeChecked();
    await page.locator(".setting-row", { has: box }).locator(".toggle-slider").click();
    await expect(box).not.toBeChecked();
    await expect
      .poll(async () => (await sql<{ on: boolean }>(`select notify_message as on from public.profiles where id = ${lit(seller.id)}`))[0]!.on)
      .toBe(false);

    const db = await userClient(buyer);
    const sent = await db.rpc("send_message", { p_thread: tid, p_body: `通知を切った後 ${rnd()}`, p_image_paths: [], p_listing: undefined });
    expect(sent.error).toBeNull();
    expect(await unreadOf(seller.id, "message")).toBe(0);
  });

  test("フォローの通知をオンにした出品者はフォローされるとお知らせが届き、既定（オフ）の出品者には届かない", async ({ page, context }) => {
    const on = await freshSeller("no-fol");
    const off = await freshSeller("no-fol-off");
    const buyer = await freshBuyer("no-fol");
    await sql(`update public.profiles set notify_follow = true where id = ${lit(on.id)}`);
    await loginAs(context, buyer);
    for (const s of [on, off]) {
      await page.goto(`/sellers/${s.id}`);
      const btn = page.getByRole("button", { name: `${s.nickname}をフォロー` });
      await btn.click();
      await expect(btn).toHaveAttribute("aria-pressed", "true");
      // ボタンは先に切り替わるので、DB に入るのを待ってから次へ移る
      await expect
        .poll(async () => (await sql<{ n: number }>(`select count(*)::int as n from public.follows where follower_id = ${lit(buyer.id)} and seller_id = ${lit(s.id)}`))[0]!.n)
        .toBe(1);
    }
    await expect.poll(() => unreadOf(on.id, "follow")).toBe(1);
    expect(await unreadOf(off.id, "follow")).toBe(0);

    await loginAs(context, on);
    await page.goto("/notifications");
    const item = page.locator(".acc-noti", { hasText: "フォローされました" });
    await expect(item).toContainText("K***さんがあなたをフォローしました。");
    await item.getByRole("link").click();
    await expect(page).toHaveURL(/\/mypage$/);
  });

  test("フォロー中の出品者がつぶやくと、フォロワーにお知らせが届き、リンクからタイムラインでそのつぶやきが見える", async ({ page, context }) => {
    const seller = await freshSeller("no-post");
    const buyer = await freshBuyer("no-post");
    await sql(`insert into public.follows (follower_id, seller_id) values (${lit(buyer.id)}, ${lit(seller.id)})`);
    await loginAs(context, seller);
    await page.goto("/mypage/tweets");
    const body = `フォロワーさんへ ${rnd()}`;
    await page.getByRole("textbox", { name: "つぶやきの本文" }).fill(body);
    await page.getByRole("button", { name: "つぶやく" }).click();
    await expect(page.getByRole("status")).toContainText("つぶやきました。");

    await loginAs(context, buyer);
    await page.goto("/notifications");
    const item = page.locator(".acc-noti", { hasText: body });
    await expect(item.locator(".msg-name")).toHaveText(`${seller.nickname}さんが新しくつぶやきました`);
    await item.getByRole("link").click();
    await expect(page).toHaveURL(/\/timeline$/);
    await expect(page.getByText(body, { exact: true })).toBeVisible();
  });

  test("購入者がつぶやきにコメントすると、つぶやきの下に出て、つぶやいた人にお知らせが届く", async ({ page, context }) => {
    const seller = await freshSeller("no-cmt");
    const buyer = await freshBuyer("no-cmt");
    const id = await seedPost(seller, `コメントを待つつぶやき ${rnd()}`);
    await loginAs(context, buyer);
    await page.goto(`/tweets/${id}`);
    const text = `すてきです ${rnd()}`;
    await page.getByRole("textbox", { name: "コメント" }).fill(text);
    await page.getByRole("button", { name: "送信" }).click();
    await expect(page.getByRole("status")).toContainText("コメントしました。");
    await expect(page.locator(".cmt-text", { hasText: text })).toBeVisible();

    await loginAs(context, seller);
    await page.goto("/notifications");
    const item = page.locator(".acc-noti", { hasText: text });
    // 購入者の公開名は「K***さん」。題は「K***さんがコメントしました」になる（「さん」が重ならない）
    await expect.soft(item.locator(".msg-name")).toHaveText("K***さんがコメントしました");
    await item.getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/tweets/${id}$`));
    await expect(page.locator(".cmt-text", { hasText: text })).toBeVisible();
  });
});

test.describe("お知らせの画面", () => {
  test("お知らせを開くと見えている分が既読になり、『すべて既読にする』で残りも既読になる", async ({ page, context }) => {
    const user = await freshBuyer("no-read");
    const tag = rnd();
    await sql(`
      insert into public.notifications (user_id, kind, title, body, link)
      select ${lit(user.id)}, 'system', 'E2E のお知らせ ' || ${lit(tag)} || ' ' || i, '', '/mypage'
      from generate_series(1, 25) as i`);
    await loginAs(context, user);
    await page.goto("/mypage");
    await expect(page.getByRole("link", { name: "お知らせ（未読 25件）" })).toBeVisible();

    await page.goto("/notifications");
    await expect(page.getByText("未読が 25 件あります。")).toBeVisible();
    await expect(page.getByRole("img", { name: "未読" })).toHaveCount(20);
    // 画面に出た20件は、開いただけで既読になる
    await expect.poll(() => unreadOf(user.id)).toBe(5);
    await page.reload();
    await expect(page.getByText("未読が 5 件あります。")).toBeVisible();

    await page.getByRole("button", { name: "すべて既読にする" }).click();
    await expect(page.getByText("未読のお知らせはありません。")).toBeVisible();
    await expect(page.getByRole("button", { name: "すべて既読にする" })).toBeDisabled();
    expect(await unreadOf(user.id)).toBe(0);
  });

  test("お知らせの『削除』を押すと、一覧から消える", async ({ page, context }) => {
    const user = await freshBuyer("no-del");
    const title = `消すお知らせ ${rnd()}`;
    const id = await seedNotification(user, title);
    await loginAs(context, user);
    await page.goto("/notifications");
    const item = page.locator(".acc-noti", { hasText: title });
    await item.getByRole("button", { name: "このお知らせを削除" }).click();
    await expect(item).toHaveCount(0);
    const n = await sql<{ n: number }>(`select count(*)::int as n from public.notifications where id = ${lit(id)}`);
    expect(n[0]!.n).toBe(0);
  });

  test("他人のお知らせは、DB を直に読んでも0件で、既読にも削除にもできず、お知らせを作ることもできない", async () => {
    const owner = await freshBuyer("no-perm");
    const other = await freshBuyer("no-perm-x");
    const id = await seedNotification(owner, `ひとのお知らせ ${rnd()}`);
    const db = await userClient(other);
    const read = await db.from("notifications").select("id").eq("id", id);
    expect(read.data ?? []).toHaveLength(0);
    const upd = await db.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).select("id");
    expect(upd.data ?? []).toHaveLength(0);
    const del = await db.from("notifications").delete().eq("id", id).select("id");
    expect(del.data ?? []).toHaveLength(0);
    const fake = await db.from("notifications").insert({ user_id: owner.id, kind: "system", title: "なりすまし", body: "" });
    expect(fake.error).not.toBeNull();
    const rows = await sql<{ read: boolean }>(`select read_at is not null as read from public.notifications where id = ${lit(id)}`);
    expect(rows).toEqual([{ read: false }]);
    const fakes = await sql<{ n: number }>(`select count(*)::int as n from public.notifications where user_id = ${lit(owner.id)} and title = 'なりすまし'`);
    expect(fakes[0]!.n).toBe(0);
  });
});
