/* 担当 C: メッセージ（会話の開始・送受信・リアルタイム・未読と既読・古い物の読み込み・商品の紹介・入力の誤り・権限・ブロック・スパムの保留） */
import { BASE_URL, lit, loginAs, seedListing, sql, userClient } from "./_db";
import { acceptDialogs, freshBuyer, freshSeller, rnd, seedMessage, seedThread } from "./_c";
import { expect, test } from "./_fixtures";

const THREAD_URL = /\/messages\/[0-9a-f-]{36}$/;

test.describe("会話を始める", () => {
  test("購入者が商品のページで『メッセージを送る』を押すと、出品者との会話が開く", async ({ page, context }) => {
    const seller = await freshSeller("ch-item");
    const buyer = await freshBuyer("ch-item");
    const listingId = await seedListing(seller, { title: `C会話の商品 ${rnd()}` });
    await loginAs(context, buyer);
    await page.goto(`/items/${listingId}`);
    await page.getByRole("button", { name: "✉ メッセージを送る" }).click();
    await expect(page).toHaveURL(THREAD_URL);
    await expect(page.getByText("まだメッセージはありません。")).toBeVisible();
    const tid = page.url().split("/").pop()!;
    const rows = await sql<{ seller_id: string; buyer_id: string }>(`select seller_id, buyer_id from public.threads where id = ${lit(tid)}`);
    expect(rows[0]).toEqual({ seller_id: seller.id, buyer_id: buyer.id });
  });

  test("購入者が出品者のページで『メッセージを送る』を2回押すと、2回とも同じ会話が開く", async ({ page, context }) => {
    const seller = await freshSeller("ch-prof");
    const buyer = await freshBuyer("ch-prof");
    await loginAs(context, buyer);
    await page.goto(`/sellers/${seller.id}`);
    await page.getByRole("button", { name: "✉ メッセージを送る" }).click();
    await expect(page).toHaveURL(THREAD_URL);
    const first = page.url();
    await page.goto(`/sellers/${seller.id}`);
    await page.getByRole("button", { name: "✉ メッセージを送る" }).click();
    await expect(page).toHaveURL(THREAD_URL);
    expect(page.url()).toBe(first);
    const n = await sql<{ n: number }>(`select count(*)::int as n from public.threads where seller_id = ${lit(seller.id)} and buyer_id = ${lit(buyer.id)}`);
    expect(n[0]!.n).toBe(1);
  });

  test("メッセージを受け付けない出品者には、送るボタンが押せず、会話の欄も閉じている", async ({ page, context }) => {
    const seller = await freshSeller("ch-closed");
    const buyer = await freshBuyer("ch-closed");
    const listingId = await seedListing(seller);
    await sql(`update public.profiles set accept_messages = false where id = ${lit(seller.id)}`);
    await loginAs(context, buyer);

    // ① 出品者のページ: 押せないボタン
    await page.goto(`/sellers/${seller.id}`);
    await expect(page.getByRole("button", { name: "✉ メッセージは受け付けていません" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "✉ メッセージを送る" })).toHaveCount(0);
    // ② 商品のページ: ボタンが出ない
    await page.goto(`/items/${listingId}`);
    await expect(page.getByRole("button", { name: "✉ メッセージを送る" })).toHaveCount(0);
    // ③ 直に会話を開こうとしても断られる
    const db = await userClient(buyer);
    const { error } = await db.rpc("open_thread", { p_other: seller.id });
    expect(error?.message ?? "").toMatch(/messages_closed/);

    // 前からある会話も、受付を止めたら欄の代わりに案内が出る
    const tid = await seedThread(seller, buyer);
    await page.goto(`/messages/${tid}`);
    await expect(page.getByText("この出品者は、購入した人からのメッセージだけを受け付けています。")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "メッセージ" })).toHaveCount(0);
  });

  test("出品者どうしでは、出品者のページに送るボタンが出ず、直に開こうとしても断られる", async ({ page, context }) => {
    const seller = await freshSeller("ch-ss");
    const other = await freshSeller("ch-ss2");
    await loginAs(context, other);
    await page.goto(`/sellers/${seller.id}`);
    await expect(page.getByRole("button", { name: /✉ メッセージ/ })).toHaveCount(0);
    const db = await userClient(other);
    const { error } = await db.rpc("open_thread", { p_other: seller.id });
    expect(error?.message ?? "").toMatch(/unavailable/);
  });

  test("本人確認の済んでいない購入者が『メッセージを送る』を押すと、本人確認が要ると出る", async ({ page, context }) => {
    const seller = await freshSeller("ch-kyc");
    const buyer = await freshBuyer("ch-kyc", "unsubmitted");
    await loginAs(context, buyer);
    await page.goto(`/sellers/${seller.id}`);
    await page.getByRole("button", { name: "✉ メッセージを送る" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "本人確認（18歳以上の確認）が済んでから使えます。" })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/sellers/${seller.id}$`));
    const n = await sql<{ n: number }>(`select count(*)::int as n from public.threads where buyer_id = ${lit(buyer.id)}`);
    expect(n[0]!.n).toBe(0);
  });

  test("出品者は、取引の無い購入者との会話を自分から始められない", async () => {
    const seller = await freshSeller("ch-sb");
    const buyer = await freshBuyer("ch-sb");
    const db = await userClient(seller);
    const { error } = await db.rpc("open_thread", { p_other: buyer.id });
    expect(error?.message ?? "").toMatch(/unavailable/);
  });
});

test.describe("送る・受け取る", () => {
  test("メッセージを送ると、開いている相手の画面に読み込み直さずに届き、返事も届き、既読が付く", async ({ page, context, browser }) => {
    const seller = await freshSeller("ch-rt");
    const buyer = await freshBuyer("ch-rt");
    const tid = await seedThread(seller, buyer);
    await loginAs(context, buyer);
    const sellerCtx = await browser.newContext();
    try {
      await loginAs(sellerCtx, seller);
      const sp = await sellerCtx.newPage();
      await sp.goto(`${BASE_URL}/messages/${tid}`);
      await expect(sp.getByText("まだメッセージはありません。")).toBeVisible();
      await page.goto(`/messages/${tid}`);
      await expect(page.getByText("まだメッセージはありません。")).toBeVisible();
      // Realtime のつながりを待つ（ここだけ時間で待つ）
      await page.waitForTimeout(3000);

      const hello = `こんにちは ${rnd()}`;
      await page.getByRole("textbox", { name: "メッセージ" }).fill(hello);
      await page.getByRole("button", { name: "送信" }).click();
      await expect(page.locator(".bubble.mine", { hasText: hello })).toBeVisible();
      await expect(page.getByRole("textbox", { name: "メッセージ" })).toHaveValue("");
      // 相手（出品者）の画面に、読み込み直さずに届く
      await expect(sp.locator(".bubble.theirs", { hasText: hello })).toBeVisible({ timeout: 10_000 });

      const reply = `お返事です ${rnd()}`;
      await sp.getByRole("textbox", { name: "メッセージ" }).fill(reply);
      await sp.getByRole("button", { name: "送信" }).click();
      await expect(page.locator(".bubble.theirs", { hasText: reply })).toBeVisible({ timeout: 10_000 });
      // 購入者が見ているので、出品者の送った物に既読が付く
      await expect(sp.locator(".msg-row.mine", { hasText: reply }).getByText("✓✓ 既読")).toBeVisible({ timeout: 10_000 });

      const saved = await sql<{ body: string }>(`select body from public.messages where thread_id = ${lit(tid)} order by created_at`);
      expect(saved.map((r) => r.body)).toEqual([hello, reply]);
    } finally {
      await sellerCtx.close();
    }
  });

  test("未読のメッセージがあると、ヘッダーと会話の一覧に件数が出て、会話を開くと消える", async ({ page, context }) => {
    const seller = await freshSeller("ch-unread");
    const buyer = await freshBuyer("ch-unread");
    const tid = await seedThread(seller, buyer);
    for (let i = 1; i <= 3; i++) await seedMessage(tid, seller, `未読の確かめ ${i}`);
    await loginAs(context, buyer);

    await page.goto("/");
    await expect(page.getByRole("link", { name: "メッセージ（未読 3件）" })).toBeVisible();
    await page.goto("/messages");
    const item = page.locator(`a[href="/messages/${tid}"]`);
    await expect(item.getByLabel("未読 3件")).toBeVisible();

    await item.click();
    await expect(page).toHaveURL(new RegExp(`/messages/${tid}$`));
    await expect(page.locator(".bubble.theirs", { hasText: "未読の確かめ 3" })).toBeVisible();
    // 開いた時点で既読になる（DB にも残る）
    await expect
      .poll(async () => (await sql<{ r: string | null }>(`select buyer_last_read_at as r from public.threads where id = ${lit(tid)}`))[0]!.r)
      .not.toBeNull();

    await page.goto("/messages");
    await expect(page.locator(`a[href="/messages/${tid}"]`)).toBeVisible();
    await expect(page.locator(`a[href="/messages/${tid}"]`).getByLabel(/未読/)).toHaveCount(0);
    await page.goto("/");
    await expect(page.getByRole("link", { name: "メッセージ", exact: true })).toBeVisible();
  });

  test("120件ある会話で『前のメッセージを読む』を続けて押すと、同じ時刻の物も含めて抜けも重なりもなく順に並ぶ", async ({ page, context }) => {
    const seller = await freshSeller("ch-old");
    const buyer = await freshBuyer("ch-old");
    const tid = await seedThread(seller, buyer);
    // 61〜80件目は同じ時刻、15〜25件目も同じ時刻（50件の区切りが同じ時刻の群れの中に来る）。マイクロ秒まで入れる
    await sql(`
      insert into public.messages (thread_id, sender_id, kind, body, created_at)
      select ${lit(tid)}, case when i % 2 = 0 then ${lit(seller.id)}::uuid else ${lit(buyer.id)}::uuid end, 'text',
             '古い' || lpad(i::text, 3, '0'),
             timestamptz '2026-10-01 10:00:00.123456+00'
               + make_interval(secs => case when i between 60 and 80 then 60 when i between 15 and 25 then 15 else i end)
      from generate_series(1, 120) as i;
      update public.threads set last_message_at = now(), last_message_preview = '古い120' where id = ${lit(tid)};
    `);
    const expected = (
      await sql<{ body: string }>(`select body from public.messages where thread_id = ${lit(tid)} order by created_at, id`)
    ).map((r) => r.body);
    expect(expected).toHaveLength(120);

    await loginAs(context, buyer);
    await page.goto(`/messages/${tid}`);
    const log = page.getByRole("log", { name: "メッセージ" });
    await expect(log.locator(".bubble")).toHaveCount(50);
    const older = page.getByRole("button", { name: "前のメッセージを読む" });
    for (let i = 0; i < 5 && (await older.count()) > 0; i++) {
      const before = await log.locator(".bubble").count();
      await older.click();
      await expect.poll(() => log.locator(".bubble").count()).toBeGreaterThan(before);
      await expect(page.getByRole("button", { name: "読み込み中…" })).toHaveCount(0);
    }
    await expect(older).toHaveCount(0);
    const shown = await log.locator(".bubble").allInnerTexts();
    expect(shown.map((s) => s.trim())).toEqual(expected);
  });

  test("出品者が自分の商品を紹介すると、両方の画面に商品のカードが出て、購入者は紹介を送れない", async ({ page, context, browser }) => {
    const seller = await freshSeller("ch-card");
    const buyer = await freshBuyer("ch-card");
    const title = `C紹介の商品 ${rnd()}`;
    const listingId = await seedListing(seller, { title, price: 4500 });
    const tid = await seedThread(seller, buyer);
    await seedMessage(tid, buyer, "どんな商品がありますか？");

    await loginAs(context, seller);
    await page.goto(`/messages/${tid}`);
    await page.getByRole("button", { name: "自分の商品を紹介" }).click();
    await page.locator("button.chat-pick", { hasText: title }).click();
    await expect(page.locator("button.chat-pick", { hasText: title })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "送信" }).click();
    const card = page.locator(`a.item-bubble[href="/items/${listingId}"]`);
    await expect(card).toBeVisible();
    await expect(card).toContainText(title);

    const buyerCtx = await browser.newContext();
    try {
      await loginAs(buyerCtx, buyer);
      const bp = await buyerCtx.newPage();
      await bp.goto(`${BASE_URL}/messages/${tid}`);
      await expect(bp.locator(`a.item-bubble[href="/items/${listingId}"]`)).toBeVisible();
      await expect(bp.getByRole("button", { name: "自分の商品を紹介" })).toHaveCount(0);
    } finally {
      await buyerCtx.close();
    }
    // 購入者が直に送ろうとしても断られる
    const db = await userClient(buyer);
    const { error } = await db.rpc("send_message", { p_thread: tid, p_body: "", p_image_paths: [], p_listing: listingId });
    expect(error?.message ?? "").toMatch(/bad_message/);
  });

  test("相手のメッセージにハートを付けると付いたままになり、もう一度押すと外れる", async ({ page, context }) => {
    const seller = await freshSeller("ch-heart");
    const buyer = await freshBuyer("ch-heart");
    const tid = await seedThread(seller, buyer);
    const mid = await seedMessage(tid, seller, `ハートの確かめ ${rnd()}`);
    await loginAs(context, buyer);
    await page.goto(`/messages/${tid}`);
    await page.getByRole("button", { name: "ハートを付ける" }).click();
    await expect(page.getByRole("button", { name: "ハートを外す" })).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(async () => (await sql<{ h: boolean }>(`select hearted as h from public.messages where id = ${lit(mid)}`))[0]!.h)
      .toBe(true);
    await page.reload();
    await page.getByRole("button", { name: "ハートを外す" }).click();
    await expect(page.getByRole("button", { name: "ハートを付ける" })).toHaveAttribute("aria-pressed", "false");
    await expect
      .poll(async () => (await sql<{ h: boolean }>(`select hearted as h from public.messages where id = ${lit(mid)}`))[0]!.h)
      .toBe(false);
  });
});

test.describe("入力の誤り・保留", () => {
  test("空や空白だけのメッセージは送信ボタンが押せず、1000字を超える物は DB でも断られる", async ({ page, context }) => {
    const seller = await freshSeller("ch-len");
    const buyer = await freshBuyer("ch-len");
    const tid = await seedThread(seller, buyer);
    await loginAs(context, buyer);
    await page.goto(`/messages/${tid}`);
    const box = page.getByRole("textbox", { name: "メッセージ" });
    const send = page.getByRole("button", { name: "送信" });
    await expect(send).toBeDisabled();
    await box.fill("   \n  ");
    await expect(send).toBeDisabled();
    await expect(box).toHaveAttribute("maxlength", "1000");
    await box.fill("あ".repeat(1000));
    await expect(send).toBeEnabled();

    const db = await userClient(buyer);
    const long = await db.rpc("send_message", { p_thread: tid, p_body: "あ".repeat(1001), p_image_paths: [], p_listing: undefined });
    expect(long.error?.message ?? "").toMatch(/bad_message/);
    const blank = await db.rpc("send_message", { p_thread: tid, p_body: "  ", p_image_paths: [], p_listing: undefined });
    expect(blank.error?.message ?? "").toMatch(/bad_message/);
    const n = await sql<{ n: number }>(`select count(*)::int as n from public.messages where thread_id = ${lit(tid)}`);
    expect(n[0]!.n).toBe(0);
  });

  test("連絡先の交換を誘う言葉を送ると、自分には『確認中』と出て、相手には届かない", async ({ page, context }) => {
    const seller = await freshSeller("ch-spam");
    const buyer = await freshBuyer("ch-spam");
    const tid = await seedThread(seller, buyer);
    await loginAs(context, buyer);
    await page.goto(`/messages/${tid}`);
    const body = `LINEで話しませんか ${rnd()}`;
    await page.getByRole("textbox", { name: "メッセージ" }).fill(body);
    await page.getByRole("button", { name: "送信" }).click();
    await expect(page.locator(".msg-row.mine", { hasText: body }).getByText("確認中（相手にはまだ届いていません）")).toBeVisible();
    await expect(page.getByText("確認のあと相手に届きます。")).toBeVisible();

    const db = await userClient(seller);
    const seen = await db.from("messages").select("id").eq("thread_id", tid);
    expect(seen.error).toBeNull();
    expect(seen.data ?? []).toHaveLength(0);
    const noti = await sql<{ n: number }>(`select count(*)::int as n from public.notifications where user_id = ${lit(seller.id)} and kind = 'message'`);
    expect(noti[0]!.n).toBe(0);
  });
});

test.describe("権限", () => {
  test.use({ consoleAllow: [/status of 404/] });

  test("当事者でない人が会話の URL を開くと 404 になり、DB を直に読んでも0件で、送ることもできない", async ({ page, context }) => {
    const seller = await freshSeller("ch-perm");
    const buyer = await freshBuyer("ch-perm");
    const stranger = await freshBuyer("ch-perm-x");
    const tid = await seedThread(seller, buyer);
    await seedMessage(tid, seller, `ひみつの話 ${rnd()}`);
    await loginAs(context, stranger);

    const res = await page.goto(`/messages/${tid}`);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "ページが見つかりません" })).toBeVisible();
    const bad = await page.goto("/messages/not-a-thread");
    expect(bad?.status()).toBe(404);

    const db = await userClient(stranger);
    const threads = await db.from("threads").select("id").eq("id", tid);
    expect(threads.data ?? []).toHaveLength(0);
    const msgs = await db.from("messages").select("id").eq("thread_id", tid);
    expect(msgs.data ?? []).toHaveLength(0);
    const send = await db.rpc("send_message", { p_thread: tid, p_body: "割り込み", p_image_paths: [], p_listing: undefined });
    expect(send.error?.message ?? "").toMatch(/unavailable/);
    await db.rpc("mark_thread_read", { p_thread: tid });
    const t = await sql<{ r: string | null }>(`select buyer_last_read_at as r from public.threads where id = ${lit(tid)}`);
    expect(t[0]!.r).toBeNull();
    const n = await sql<{ n: number }>(`select count(*)::int as n from public.messages where thread_id = ${lit(tid)}`);
    expect(n[0]!.n).toBe(1);
  });
});

test.describe("ブロック", () => {
  test("会話の中で相手をブロックすると欄が閉じ、ブロックされた側から送っても届かず、外すと元に戻る", async ({ page, context, browser }) => {
    const seller = await freshSeller("ch-block");
    const buyer = await freshBuyer("ch-block");
    const tid = await seedThread(seller, buyer);
    await seedMessage(tid, seller, `ブロック前の話 ${rnd()}`);
    await loginAs(context, buyer);
    acceptDialogs(page);
    await page.goto(`/messages/${tid}`);
    await page.getByRole("button", { name: "この相手をブロック" }).click();
    await expect(page.getByText("この相手をブロックしています。送るには、上の 🚫 でブロックを外してください。")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "メッセージ" })).toHaveCount(0);

    // ブロックされた出品者の側から送っても届かない
    const sellerCtx = await browser.newContext();
    try {
      await loginAs(sellerCtx, seller);
      const sp = await sellerCtx.newPage();
      await sp.goto(`${BASE_URL}/messages/${tid}`);
      const body = `ブロック後の話 ${rnd()}`;
      await sp.getByRole("textbox", { name: "メッセージ" }).fill(body);
      await sp.getByRole("button", { name: "送信" }).click();
      await expect(sp.getByRole("alert").filter({ hasText: "この相手にはメッセージを送れません。" })).toBeVisible();
      const n = await sql<{ n: number }>(`select count(*)::int as n from public.messages where thread_id = ${lit(tid)} and body = ${lit(body)}`);
      expect(n[0]!.n).toBe(0);
    } finally {
      await sellerCtx.close();
    }

    // 外すと、また送れる
    await page.getByRole("button", { name: "この相手をブロック" }).click();
    await expect(page.getByRole("textbox", { name: "メッセージ" })).toBeVisible();
    await expect(page.getByText("この相手をブロックしています。", { exact: false })).toHaveCount(0);
    const blocks = await sql<{ n: number }>(`select count(*)::int as n from public.blocks where blocker_id = ${lit(buyer.id)}`);
    expect(blocks[0]!.n).toBe(0);
  });
});
