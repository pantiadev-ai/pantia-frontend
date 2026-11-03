/* メッセージの守りと、2026-11-03 の直し（担当 C・D）
   送る前の同意と取り消し・禁止ワード・運営が前後の会話を見る（通報か保留のメッセージからだけ）・
   ユーザー管理の写真とログインの列・管理画面のログアウト・出品の価格の見込み・写真の注意書き */
import type { Page } from "@playwright/test";
import { forgetSession, freshUser, lit, loginAs, seedImage, seedListing, sql, userClient } from "./_db";
import { freshBuyer, freshSeller, rnd, seedMessage, seedThread } from "./_c";
import { asAdmin, auditOf, rowOf } from "./_d";
import { expect, test } from "./_fixtures";

const box = (page: Page) => page.getByRole("textbox", { name: "メッセージ" });
const sendBtn = (page: Page) => page.getByRole("button", { name: "送信" });
const consentBox = (page: Page) => page.locator(".chat-consent").getByRole("checkbox");

async function consentOf(userId: string): Promise<number> {
  const rows = await sql<{ n: number }>(`select count(*)::int as n from public.message_consents where user_id = ${lit(userId)}`);
  return rows[0]!.n;
}

async function messagesIn(threadId: string): Promise<string[]> {
  const rows = await sql<{ body: string }>(`select body from public.messages where thread_id = ${lit(threadId)} order by created_at`);
  return rows.map((r) => r.body);
}

test.describe("送る前の同意", () => {
  test("同意していない人は、確認に印を付けるまで送れず、付けて送ると同意が残り、次からは確認が出ない", async ({ page, context }) => {
    const seller = await freshSeller("ms-agree");
    const buyer = await freshUser("c-ms-agree-b", { role: "buyer", nickname: `K購入${rnd()}`, kyc: "approved", messageConsent: false });
    const tid = await seedThread(seller, buyer);
    await loginAs(context, buyer);
    await page.goto(`/messages/${tid}`);

    const body = `C同意して送る ${rnd()}`;
    await box(page).fill(body);
    await expect(consentBox(page)).not.toBeChecked();
    await expect(sendBtn(page)).toBeDisabled();

    await consentBox(page).check();
    await sendBtn(page).click();
    await expect(page.locator(".bubble.mine", { hasText: body })).toBeVisible();
    await expect(consentBox(page)).toHaveCount(0);
    expect(await consentOf(buyer.id)).toBe(1);

    await page.reload();
    await expect(box(page)).toBeVisible();
    await expect(consentBox(page)).toHaveCount(0);
  });

  test("同意のない人が DB に直に送っても断られ、行は作られない", async () => {
    const seller = await freshSeller("ms-db");
    const buyer = await freshUser("c-ms-db-b", { role: "buyer", nickname: `K購入${rnd()}`, kyc: "approved", messageConsent: false });
    const tid = await seedThread(seller, buyer);
    const db = await userClient(buyer);
    const { error } = await db.rpc("send_message", { p_thread: tid, p_body: "C同意なし", p_image_paths: [] });
    expect(error?.message ?? "").toMatch(/message_consent_required/);
    expect(await messagesIn(tid)).toEqual([]);
  });

  test("設定で同意を取り消すと記録が消え、会話の画面にまた確認が出る", async ({ page, context }) => {
    const seller = await freshSeller("ms-wd");
    const buyer = await freshBuyer("ms-wd");
    const tid = await seedThread(seller, buyer);
    expect(await consentOf(buyer.id)).toBe(1);
    await loginAs(context, buyer);

    await page.goto("/settings");
    await page.getByRole("button", { name: "取り消す" }).click();
    await page.getByRole("button", { name: "同意を取り消す" }).click();
    await expect.poll(() => consentOf(buyer.id)).toBe(0);

    await page.goto(`/messages/${tid}`);
    await expect(consentBox(page)).toBeVisible();
    await box(page).fill("C取り消しのあと");
    await expect(sendBtn(page)).toBeDisabled();
  });
});

test.describe("禁止ワード", () => {
  test("禁止ワードが入っていると送れず、どの語かを知らせ、行は作られない（全角・大文字・空白も同じ語として見る）", async ({ page, context }) => {
    const r = rnd();
    const word = `NG語${r}`;
    const seller = await freshSeller("ms-ban");
    const buyer = await freshBuyer("ms-ban");
    const tid = await seedThread(seller, buyer);
    await sql(`update public.site_settings set banned_words = array[${lit(word)}] where id`);
    try {
      await loginAs(context, buyer);
      await page.goto(`/messages/${tid}`);
      const body = `これは ｎｇ 語${r.toUpperCase()} です`;
      await box(page).fill(body);
      await sendBtn(page).click();
      await expect(page.locator(".chat-form-msg[role=alert]")).toHaveText(`「${word}」は使えません。（送っていません）`);
      // 入れた文は消さずに残す（直して送り直せるように）
      await expect(box(page)).toHaveValue(body);
      expect(await messagesIn(tid)).toEqual([]);

      // 語を外せば送れる
      await box(page).fill(`C禁止ワードなし ${r}`);
      await sendBtn(page).click();
      await expect(page.locator(".bubble.mine", { hasText: `C禁止ワードなし ${r}` })).toBeVisible();
      expect(await messagesIn(tid)).toEqual([`C禁止ワードなし ${r}`]);
    } finally {
      await sql(`update public.site_settings set banned_words = '{}' where id`);
    }
  });
});

test.describe("運営が前後の会話を見る", () => {
  test("保留のメッセージから前後の会話を開け、開いたことが操作の記録に残る", async ({ page, context }) => {
    const r = rnd();
    const seller = await freshSeller("ms-view");
    const buyer = await freshBuyer("ms-view");
    const tid = await seedThread(seller, buyer);
    const before = `C前のやり取り ${r}`;
    await seedMessage(tid, seller, before, new Date(Date.now() - 60_000).toISOString());
    const heldBody = `C保留のメッセージ ${r}`;
    const heldId = await seedMessage(tid, buyer, heldBody);
    await sql(`update public.messages set status = 'held' where id = ${lit(heldId)}`);

    await asAdmin(context);
    await page.goto("/admin/moderation?type=message");
    await rowOf(page, heldBody).getByRole("link", { name: "前後の会話を見る →" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/moderation/thread/${heldId}$`));
    const thread = page.locator(".adm-thread");
    await expect(thread).toContainText(before);
    await expect(thread).toContainText(heldBody);
    expect((await auditOf(heldId)).map((a) => a.action)).toContain("thread.viewed");
  });

  test("通報も保留もないメッセージからは、会話を開けない", async ({ page, context }) => {
    const r = rnd();
    const seller = await freshSeller("ms-nf");
    const buyer = await freshBuyer("ms-nf");
    const tid = await seedThread(seller, buyer);
    const body = `C普通のメッセージ ${r}`;
    const id = await seedMessage(tid, buyer, body);

    await asAdmin(context);
    await page.goto(`/admin/moderation/thread/${id}`);
    await expect(page.getByText("この会話は開けません。通報されたメッセージか、保留中・非表示のメッセージからだけ開けます。")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(body);
    expect((await auditOf(id)).map((a) => a.action)).not.toContain("thread.viewed");
  });
});

test.describe("ユーザー管理の写真とログイン", () => {
  test("写真のある人は一覧と詳細に写真が出て、ログインの列は画面を開く前は「記録なし」、開いたあとは「🟢 オンライン」になる", async ({ page, context, browser }) => {
    const name = `D写真${rnd()}`;
    const u = await freshUser("d-photo", { role: "buyer", nickname: name });
    const path = await seedImage("avatars", u.id);
    await sql(`update public.profiles set avatar_path = ${lit(path)}, last_seen_at = null where id = ${lit(u.id)}`);

    await asAdmin(context);
    await page.goto(`/admin/users?q=${u.id}`);
    const row = rowOf(page, name);
    await expect(row).toHaveCount(1);
    await expect(row.locator("img")).toHaveAttribute("src", new RegExp(path.split("/").pop()!.replace(".", "\\.")));
    await expect(row).toContainText("利用中");
    await expect(row).toContainText("記録なし");
    await expect(row).not.toContainText("オンライン");
    // 状態の絞り込みの言葉も「利用中」
    await expect(page.locator("select option", { hasText: "利用中" })).toHaveCount(1);
    await expect(page.locator("select option", { hasText: "アクティブ" })).toHaveCount(0);

    // 当人が画面を開くと、時刻が書かれる
    const theirs = await browser.newContext();
    try {
      await loginAs(theirs, u);
      const p2 = await theirs.newPage();
      await p2.goto("/mypage");
      await expect
        .poll(async () => (await sql<{ at: string | null }>(`select last_seen_at as at from public.profiles where id = ${lit(u.id)}`))[0]!.at)
        .not.toBeNull();
    } finally {
      await theirs.close();
    }
    await page.reload();
    await expect(rowOf(page, name)).toContainText("🟢 オンライン");

    await page.goto(`/admin/users/${u.id}`);
    await expect(page.locator("img.adm-user-photo")).toHaveAttribute("src", new RegExp(path.split("/").pop()!.replace(".", "\\.")));
    await expect(page.getByText(/🟢 オンライン（/)).toBeVisible();
  });
});

test.describe("管理画面のログアウト", () => {
  test("上の帯の「ログアウト」で、サイトの入口に戻り、ログインが切れる", async ({ page, context }) => {
    const adm = await asAdmin(context);
    try {
      await page.goto("/admin");
      await page.locator("form.topbar-signout").getByRole("button", { name: "ログアウト" }).click();
      await expect(page).toHaveURL("http://localhost:3100/");
      expect((await context.cookies()).filter((c) => /^sb-.*auth-token/.test(c.name))).toEqual([]);
      await page.goto("/admin");
      await expect(page).not.toHaveURL(/\/admin$/);
    } finally {
      // この端末のログインを切ったので、保存したログインは使えない
      forgetSession(adm);
    }
  });
});

test.describe("出品の価格の見込み", () => {
  test("有料オプションを選ぶと1行ずつ出て、手数料と受け取り額が「なし〜全部」の幅で出る", async ({ page, context }) => {
    const seller = await freshUser("b-est", { role: "seller" });
    await loginAs(context, seller);
    const [st] = await sql<{ fee_rate: number | string; video_fee: number; extend_fee_per_day: number }>(
      "select fee_rate, video_fee, extend_fee_per_day from public.site_settings where id",
    );
    const rate = Number(st!.fee_rate);
    const feeOf = (n: number) => Math.round((n * Math.round(rate * 1000)) / 1000);
    const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

    await page.goto("/listings/new");
    // 写真の注意書き（一覧では端が切れる）
    await expect(page.getByText(/一覧や検索では、1枚目の写真の上下・左右の端が切れて表示されます/)).toBeVisible();

    await page.getByLabel("着用日数").selectOption("2");
    await page.getByLabel("販売価格（円）").fill("3000");
    const pp = page.locator(".price-preview");
    await expect(pp.locator(".lf-pp-option")).toHaveCount(0);
    await expect(pp).toContainText(`- ${yen(feeOf(3000))}`);

    const paid = page.getByRole("group", { name: "有料オプション" });
    await paid.getByRole("button", { name: /🎬 着用動画/ }).click();
    await paid.getByRole("button", { name: /📅 着用日数延長/ }).click();
    // 延長は、つけたときに最大の日数（6日）が入る。着用日数2日なので4日分
    const ext = st!.extend_fee_per_day * 4;
    await expect(pp.locator(".lf-pp-option")).toHaveCount(2);
    await expect(pp.locator(".lf-pp-option", { hasText: "🎬 着用動画" })).toContainText(`+ ${yen(st!.video_fee)}`);
    await expect(pp.locator(".lf-pp-option", { hasText: "📅 着用日数延長" })).toContainText(`${yen(st!.extend_fee_per_day)} × 最大4日`);
    await expect(pp.locator(".lf-pp-option", { hasText: "📅 着用日数延長" })).toContainText(`+ ${yen(ext)}`);

    const max = 3000 + st!.video_fee + ext;
    await expect(pp).toContainText(`- ${yen(feeOf(3000))} 〜 ${yen(feeOf(max))}`);
    await expect(pp.locator(".pp-total")).toHaveText(`${yen(3000 - feeOf(3000))} 〜 ${yen(max - feeOf(max))}`);
  });

  test("商品ページの大きな写真は、切らずに全体を出す", async ({ page }) => {
    const seller = await freshSeller("ms-img");
    const listingId = await seedListing(seller, { title: `C写真 ${rnd()}` });
    await page.goto(`/items/${listingId}`);
    const img = page.locator(".pg-item-detail .gallery-main-img");
    await expect(img).toBeVisible();
    expect(await img.evaluate((el) => getComputedStyle(el).objectFit)).toBe("contain");
  });
});
