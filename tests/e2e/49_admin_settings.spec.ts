/* 管理画面: サイトの設定（担当 D）
   ※ サイト全体に効く設定を変えるので、ほかの試験と並べて流さない。取りまとめ役が、ほかの試験が終わってから流す。
   それぞれの試験の前に決まった状態（登録受付・メンテナンスなし・お知らせなし・メールあり）にそろえ、
   終わったら（落ちても）元の値に sql で戻す。ページはどれも動的（設定は1回の表示ごとに読む）なので、すぐ効く。 */
import type { Page } from "@playwright/test";
import { freshUser, lit, loginAs, seedListing, sql } from "./_db";
import { asAdmin, closeKyc, notificationsOf, rid, rowOf, seedKyc } from "./_d";
import { expect, test } from "./_fixtures";

type Snapshot = {
  registration_open: boolean;
  maintenance: boolean;
  notice: string;
  mail_order: boolean;
  mail_kyc: boolean;
  mail_payout: boolean;
  mod_spam_filter: boolean;
};
const COLS = "registration_open, maintenance, notice, mail_order, mail_kyc, mail_payout, mod_spam_filter";
let saved: Snapshot | null = null;

test.beforeEach(async () => {
  saved = (await sql<Snapshot>(`select ${COLS} from public.site_settings where id`))[0] ?? null;
  await sql(`update public.site_settings set registration_open = true, maintenance = false, notice = '', mail_kyc = true where id`);
});

test.afterEach(async () => {
  if (!saved) return;
  const s = saved;
  await sql(`
    update public.site_settings set
      registration_open = ${s.registration_open}, maintenance = ${s.maintenance}, notice = ${lit(s.notice)},
      mail_order = ${s.mail_order}, mail_kyc = ${s.mail_kyc}, mail_payout = ${s.mail_payout}, mod_spam_filter = ${s.mod_spam_filter}
    where id`);
  saved = null;
});

/** 切り替えのつまみを押す（見えないチェックボックスの代わりに、つまみの label を押す） */
async function flip(page: Page, label: string, to: boolean): Promise<void> {
  const box = page.getByRole("checkbox", { name: label, exact: true });
  await expect(box).toBeChecked({ checked: !to });
  await page.locator(".adm-row").filter({ has: box }).locator(".toggle-switch").click();
  await expect(box).toBeChecked({ checked: to });
}

/** 保存のボタン → 確認の窓（変えた項目が並ぶ）→ 保存する */
async function save(page: Page, labels: string[]): Promise<void> {
  await page.getByRole("button", { name: `設定を保存（${labels.length}項目）` }).click();
  const dialog = page.getByRole("dialog", { name: "設定を変えますか？" });
  for (const l of labels) await expect(dialog).toContainText(l);
  await dialog.getByRole("button", { name: "保存する", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".adm-toasts").getByText("設定を保存しました。")).toBeVisible();
}

async function setting<K extends keyof Snapshot>(key: K): Promise<Snapshot[K]> {
  return (await sql<Snapshot>(`select ${COLS} from public.site_settings where id`))[0][key];
}

test("何も変えずに保存を押すと「変えた項目がありません。」と出て、確認の窓は出ない", async ({ page, context }) => {
  await asAdmin(context);
  await page.goto("/admin/settings");
  await page.getByRole("button", { name: "設定を保存", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "変えた項目がありません。" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("新規登録の受付を止めると、登録の画面に止めている案内が出て先へ進めず、受付に戻すと進める", async ({ page, context, browser }) => {
  await asAdmin(context);
  const guest = await browser.newContext();
  try {
    const gp = await guest.newPage();
    await page.goto("/admin/settings");
    await flip(page, "新規登録受付", false);
    await save(page, ["新規登録受付"]);
    expect(await setting("registration_open")).toBe(false);

    await gp.goto("/auth?tab=register");
    await expect(gp.locator(".pt-closed")).toHaveText("ただいま新規登録を止めています。再開までお待ちください。");
    await expect(gp.getByRole("button", { name: "次へ進む →" })).toBeDisabled();

    await page.reload();
    await flip(page, "新規登録受付", true);
    await save(page, ["新規登録受付"]);
    await gp.reload();
    await expect(gp.locator(".pt-closed")).toHaveCount(0);
    await expect(gp.getByRole("button", { name: "次へ進む →" })).toBeEnabled();
  } finally {
    await guest.close();
  }
});

test("メンテナンスにすると全ページの上に帯が出て、購入の手続きが止まる", async ({ page, context, browser }) => {
  const r = rid();
  const seller = await freshUser("d-mnts", { role: "seller" });
  const buyer = await freshUser("d-mntb", { role: "buyer", kyc: "approved" });
  const listingId = await seedListing(seller, { title: `Dメンテ${r}` });
  await sql(`insert into public.cart_items (user_id, listing_id) values (${lit(buyer.id)}, ${lit(listingId)})`);
  await asAdmin(context);
  const bc = await browser.newContext();
  try {
    await page.goto("/admin/settings");
    await flip(page, "メンテナンスモード", true);
    await save(page, ["メンテナンスモード"]);
    expect(await setting("maintenance")).toBe(true);

    await loginAs(bc, buyer);
    const bp = await bc.newPage();
    for (const path of ["/", "/items"]) {
      await bp.goto(path);
      await expect(bp.getByRole("status").filter({ hasText: "ただいまメンテナンス中です。新しい購入の手続きを一時的に止めています。" })).toBeVisible();
    }
    await bp.goto(`/checkout?items=${listingId}`);
    await expect(bp.getByText("ただいまメンテナンス中のため、購入を受け付けていません。")).toBeVisible();
    await expect(bp.getByRole("button", { name: "注文を確定してお支払いへ" })).toBeDisabled();
  } finally {
    await bc.close();
  }
});

test("お知らせを入れると全ページの上に出て、消すと出なくなる", async ({ page, context, browser }) => {
  const r = rid();
  const text = `E2Eのお知らせ${r}`;
  await asAdmin(context);
  const guest = await browser.newContext();
  try {
    const gp = await guest.newPage();
    await page.goto("/admin/settings");
    await page.getByLabel("お知らせ（全ページの上に出す文）").fill(text);
    await save(page, ["お知らせ"]);
    expect(await setting("notice")).toBe(text);

    for (const path of ["/", "/items", "/auth"]) {
      await gp.goto(path);
      await expect(gp.getByRole("status").filter({ hasText: text })).toBeVisible();
    }

    await page.reload();
    await page.getByLabel("お知らせ（全ページの上に出す文）").fill("");
    await save(page, ["お知らせ"]);
    await gp.goto("/");
    await expect(gp.getByText(text)).toHaveCount(0);
  } finally {
    await guest.close();
  }
});

test("本人確認の結果のメールを止めると、承認しても画面のお知らせだけ届き、メールは控えに入らない", async ({ page, context }) => {
  const r = rid();
  const name = `Dメール停止${r}`;
  const u = await freshUser("d-mlk", { role: "seller", nickname: name });
  const app = await seedKyc(u);
  try {
    await asAdmin(context);
    await page.goto("/admin/settings");
    await flip(page, "KYC審査結果メール", false);
    await save(page, ["KYC審査結果メール"]);
    expect(await setting("mail_kyc")).toBe(false);

    await page.goto("/admin/kyc");
    await rowOf(page, name).getByRole("link", { name: "審査する" }).click();
    await page.getByRole("radio", { name: "承認する" }).check();
    await page.getByRole("button", { name: "判定を記録する" }).click();
    await page.getByRole("dialog", { name: "承認しますか？" }).getByRole("button", { name: "承認する", exact: true }).click();
    await expect(page.locator(".adm-toasts").getByText("承認しました。書類は消しました。")).toBeVisible();

    expect((await notificationsOf(u.id)).map((n) => n.title)).toContain("本人確認が完了しました");
    // 応答のあとのメールの処理が、この通知を拾い終わる（送らない設定でも「拾った」印は付く）まで待つ
    await expect
      .poll(async () => (await sql<{ done: boolean }>(`select bool_and(mailed_at is not null) as done from public.notifications where user_id = ${lit(u.id)} and kind = 'kyc'`))[0]?.done, {
        timeout: 15_000,
      })
      .toBe(true);
    const mails = await sql<{ n: number }>(`select count(*)::int as n from public.mail_outbox where user_id = ${lit(u.id)}`);
    expect(mails[0].n).toBe(0);
  } finally {
    await closeKyc(app.id);
  }
});

