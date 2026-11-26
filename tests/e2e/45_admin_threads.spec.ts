/* 管理画面: 利用者同士の会話を、理由を書いて開いて見る（改修リスト 行8）
   ・利用者の詳細に会話の一覧（相手と最後の時刻だけ。中身は出さない）
   ・「理由を書いて開く」で理由を残すと、30分のあいだ中身が見える。開いたことと見たことは操作の記録に残る
   ・同意（版2）より前のメッセージは出さない。片方が同意していない会話は開けない
   ・管理者でない人の 404 は 40_admin_access で見る */
import type { Page } from "@playwright/test";
import { freshUser, lit, sql } from "./_db";
import { freshBuyer, freshSeller, rnd, seedMessage, seedThread } from "./_c";
import { act, asAdmin, auditOf } from "./_d";
import { expect, test } from "./_fixtures";

/** 利用者の詳細の「利用者同士の会話」のカードの中で、相手の名前を含む行 */
const threadRow = (page: Page, name: string) =>
  page
    .locator(".chart-card")
    .filter({ has: page.locator(".card-title", { hasText: "利用者同士の会話" }) })
    .locator(".adm-row")
    .filter({ hasText: name });

test.describe("運営が会話を見る", () => {
  test("利用者の詳細から理由を書いて開くと中身が見え、開いたことと見たことが記録に残る（一覧では中身を出さない）", async ({ page, context }) => {
    const r = rnd();
    const seller = await freshSeller("at-open");
    const buyer = await freshBuyer("at-open");
    const tid = await seedThread(seller, buyer);
    const fromBuyer = `C購入者の文 ${r}`;
    const fromSeller = `C出品者の文 ${r}`;
    await seedMessage(tid, buyer, fromBuyer);
    await seedMessage(tid, seller, fromSeller);

    await asAdmin(context);
    await page.goto(`/admin/users/${seller.id}`);
    const row = threadRow(page, buyer.nickname);
    await expect(row).toHaveCount(1);
    // 名前のすぐ後ろに「この人が出品者」と書くと、相手の方が出品者に読めた。相手と、この利用者の側を分けて書く
    await expect(row.locator(".adm-row-title")).toHaveText(`相手: ${buyer.nickname}`);
    await expect(row.locator(".adm-row-note")).toContainText("この利用者は出品者");
    await expect(page.locator("body")).not.toContainText(fromBuyer);
    // 一覧を見ただけでは記録に残さない
    expect((await auditOf(tid)).map((a) => a.action)).toEqual([]);

    await row.getByRole("link", { name: "開く" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/users/${seller.id}/threads/${tid}$`));
    // 開く前は中身を出さない
    await expect(page.locator("body")).not.toContainText(fromBuyer);

    await act(page, page, {
      button: "理由を書いて開く",
      title: "この会話を開きますか？",
      reason: `E2E確認${r}`,
      confirm: "開く",
      done: /会話を開きました/,
    });
    const thread = page.locator(".adm-thread");
    await expect(thread).toContainText(fromBuyer);
    await expect(thread).toContainText(fromSeller);
    await expect(page.getByText(`E2E確認${r}`)).toBeVisible();
    const actions = (await auditOf(tid)).map((a) => a.action);
    expect(actions).toContain("thread.opened");
    expect(actions).toContain("thread.read");
  });

  test("理由が空では開けず、中身も出ず、記録も残らない", async ({ page, context }) => {
    const r = rnd();
    const seller = await freshSeller("at-empty");
    const buyer = await freshBuyer("at-empty");
    const tid = await seedThread(seller, buyer);
    const body = `C中身 ${r}`;
    await seedMessage(tid, buyer, body);

    await asAdmin(context);
    await page.goto(`/admin/users/${seller.id}/threads/${tid}`);
    await page.getByRole("button", { name: "理由を書いて開く", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "この会話を開きますか？" });
    await dialog.getByRole("button", { name: "開く", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("確認の理由を入力してください。");
    await expect(page.locator("body")).not.toContainText(body);
    expect((await auditOf(tid)).map((a) => a.action)).not.toContain("thread.opened");
  });

  test("同意より前のメッセージは、開いても出ない", async ({ page, context }) => {
    const r = rnd();
    const seller = await freshSeller("at-pre");
    const buyer = await freshBuyer("at-pre");
    const tid = await seedThread(seller, buyer);
    // 同意の時刻を1時間前にし、その前と後にメッセージを置く
    await sql(`update public.message_consents set agreed_at = now() - interval '1 hour' where user_id = ${lit(buyer.id)}`);
    const before = `C同意の前 ${r}`;
    const after = `C同意の後 ${r}`;
    await seedMessage(tid, buyer, before, new Date(Date.now() - 2 * 3600_000).toISOString());
    await seedMessage(tid, buyer, after);

    await asAdmin(context);
    await page.goto(`/admin/users/${buyer.id}/threads/${tid}`);
    await act(page, page, { button: "理由を書いて開く", reason: `E2E同意${r}`, confirm: "開く", done: /会話を開きました/ });
    const thread = page.locator(".adm-thread");
    await expect(thread).toContainText(after);
    await expect(page.locator("body")).not.toContainText(before);
  });

  test("片方が同意していない会話は、一覧で開けないと出て、画面から開こうとしても断られる", async ({ page, context }) => {
    const r = rnd();
    const seller = await freshSeller("at-nc");
    const buyer = await freshUser(`at-nc-b`, { role: "buyer", nickname: `K未同意${r}`, messageConsent: false });
    const tid = await seedThread(seller, buyer);

    await asAdmin(context);
    await page.goto(`/admin/users/${seller.id}`);
    const row = threadRow(page, buyer.nickname);
    await expect(row).toContainText("同意が無いため開けません");
    await expect(row.getByRole("link", { name: "開く" })).toHaveCount(0);

    await page.goto(`/admin/users/${seller.id}/threads/${tid}`);
    await page.getByRole("button", { name: "理由を書いて開く", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "この会話を開きますか？" });
    await dialog.getByRole("textbox").fill(`E2E未同意${r}`);
    await dialog.getByRole("button", { name: "開く", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("同意");
    expect((await auditOf(tid)).map((a) => a.action)).not.toContain("thread.opened");
  });
});
