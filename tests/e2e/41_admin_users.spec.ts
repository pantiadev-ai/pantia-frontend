/* 管理画面: 利用者（担当 D）
   一覧・検索・詳細、売上の残高（台帳の合計と合う）、台帳の調整、警告・停止・停止の解除・強制退会、
   ロールの変更申請の承認・却下。操作した人を壊す試験は、必ず freshUser の人で行う。 */
import type { Page } from "@playwright/test";
import { admin, freshUser, lit, loginAs, seedListing, sql } from "./_db";
import { act, asAdmin, auditOf, ledgerSum, notificationsOf, OLD, rid, rowOf, seedLedger } from "./_d";
import { expect, test } from "./_fixtures";

/** 詳細の「売上の残高」の金額 */
const balanceOf = (page: Page) => page.locator(".adm-statline").filter({ hasText: "売上の残高" }).locator("b");

test.describe("利用者の一覧と詳細", () => {
  test("名前や ID で探すと、その人だけが出て、一覧にはメールアドレスを出さず、詳細が開く", async ({ page, context }) => {
    const r = rid();
    const name = `D探す${r}`;
    const u = await freshUser("d-find", { role: "seller", nickname: name });
    await asAdmin(context);

    await page.goto("/admin/users");
    await page.getByRole("searchbox", { name: "名前・ユーザーIDで検索" }).fill(name);
    await page.getByRole("button", { name: "絞り込む" }).click();
    await expect(page).toHaveURL(/[?&]q=/);
    await expect(rowOf(page, name)).toHaveCount(1);
    await expect(rowOf(page, name)).not.toContainText("@");

    // ID でも探せる
    await page.goto(`/admin/users?q=${u.id}`);
    await expect(rowOf(page, name)).toHaveCount(1);
    await rowOf(page, name).getByRole("link", { name: "詳細" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/users/${u.id}$`));
    await expect(page.getByRole("heading", { name: "ユーザーの詳細", level: 1 })).toBeVisible();
    // 詳細では、この1人分だけメールアドレスを出す
    await expect(page.getByText(u.email)).toBeVisible();
    await expect(page.getByText(u.id).first()).toBeVisible();
  });

  test("売上の残高は、台帳の合計（admin_user_balance）と同じ金額で出る", async ({ page, context }) => {
    const u = await freshUser("d-bal", { role: "seller", nickname: `D残高${rid()}` });
    await seedLedger(u, 5000);
    await seedLedger(u, -1200);
    await seedLedger(u, 345);
    const adm = await asAdmin(context);

    const sum = await ledgerSum(u.id);
    expect(sum).toBe(4145);
    const { data, error } = await admin().rpc("admin_user_balance", { p_admin: adm.id, p_user: u.id });
    expect(error).toBeNull();
    expect(Number(data)).toBe(sum);

    await page.goto(`/admin/users/${u.id}`);
    await expect(balanceOf(page)).toHaveText("¥4,145");
  });

  test("台帳の調整を記録すると、残高・台帳・操作の記録に反映され、理由なしでは記録できない", async ({ page, context }) => {
    const r = rid();
    const u = await freshUser("d-adj", { role: "seller", nickname: `D調整${r}` });
    await seedLedger(u, 1000);
    await asAdmin(context);
    await page.goto(`/admin/users/${u.id}`);
    await expect(balanceOf(page)).toHaveText("¥1,000");

    const amount = page.getByLabel(/^金額/);
    const note = page.getByLabel(/^理由（必須/);
    // 理由が空なら、確認の窓を出さない
    await amount.fill("-300");
    await page.getByRole("button", { name: "調整を記録する" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "調整の理由を入力してください。" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await note.fill(`E2E調整${r}`);
    await page.getByRole("button", { name: "調整を記録する" }).click();
    const dialog = page.getByRole("dialog", { name: "台帳を調整しますか？" });
    await expect(dialog).toContainText("-300円");
    await dialog.getByRole("button", { name: "記録する", exact: true }).click();
    await expect(page.locator(".adm-toasts").getByText("台帳に -300円 の調整を記録しました。")).toBeVisible();

    await expect(balanceOf(page)).toHaveText("¥700");
    expect(await ledgerSum(u.id)).toBe(700);
    const rows = await sql<{ kind: string; amount: number; note: string }>(
      `select kind, amount, note from public.ledger_entries where user_id = ${lit(u.id)} order by id desc limit 1`,
    );
    expect(rows[0]).toMatchObject({ kind: "adjustment", amount: -300, note: `E2E調整${r}` });
    expect((await auditOf(u.id)).map((a) => a.action)).toContain("ledger.adjust");
  });

  test("自分自身の詳細では、警告・停止・退会の操作が出ない", async ({ page, context }) => {
    const adm = await asAdmin(context);
    await page.goto(`/admin/users/${adm.id}`);
    await expect(page.getByText("自分自身には操作できません。")).toBeVisible();
    await expect(page.getByRole("button", { name: "⛔ 利用を停止" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "強制退会" })).toHaveCount(0);
  });
});

test.describe("利用者への処分", () => {
  test("警告を送ると、本人に理由つきの通知が届き、処分の記録に残る", async ({ page, context }) => {
    const r = rid();
    const name = `D警告${r}`;
    const u = await freshUser("d-warn", { role: "buyer", nickname: name });
    await asAdmin(context);
    await page.goto(`/admin/users/${u.id}`);
    await act(page, page, {
      button: "⚠️ 警告を送る",
      title: `${name}さんに警告を送りますか？`,
      reason: `E2E警告${r}`,
      confirm: "警告を送る",
      done: "警告を送りました。",
    });
    // 処分の記録に理由が出る
    await expect(page.locator(".adm-row-note", { hasText: `E2E警告${r}` })).toBeVisible();
    expect(await notificationsOf(u.id)).toContainEqual({ kind: "system", title: "運営からの警告", body: `E2E警告${r}` });
    const s = await sql<{ kind: string }>(`select kind from public.user_sanctions where user_id = ${lit(u.id)}`);
    expect(s.map((x) => x.kind)).toEqual(["warning"]);
    // 警告だけでは止まらない
    expect((await sql<{ status: string }>(`select status from public.profiles where id = ${lit(u.id)}`))[0].status).toBe("active");
  });

  test("利用を停止すると本人は停止の画面へ回され、解除すると戻れる。理由が無いと止められず、どちらも記録に残る", async ({ page, context, browser }) => {
    const r = rid();
    const name = `D停止${r}`;
    const u = await freshUser("d-sus", { role: "buyer", nickname: name });
    const adm = await asAdmin(context);
    const other = await browser.newContext();
    try {
      await loginAs(other, u);
      const up = await other.newPage();
      await up.goto("/mypage");
      await expect(up).toHaveURL(/\/mypage$/);

      await page.goto(`/admin/users/${u.id}`);
      // 理由が空なら止められない
      await page.getByRole("button", { name: "⛔ 利用を停止", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: `${name}さんの利用を停止しますか？` });
      await dialog.getByRole("button", { name: "停止する", exact: true }).click();
      await expect(dialog.getByRole("alert")).toContainText("停止の理由を入力してください。");
      await dialog.getByRole("button", { name: "やめる" }).click();
      await expect(dialog).toBeHidden();
      expect((await sql<{ status: string }>(`select status from public.profiles where id = ${lit(u.id)}`))[0].status).toBe("active");

      await act(page, page, { button: "⛔ 利用を停止", reason: `E2E停止${r}`, confirm: "停止する", done: "利用を停止しました。" });
      await expect(page.getByText("⛔ この利用者は利用停止中です。")).toBeVisible();
      expect((await sql<{ status: string }>(`select status from public.profiles where id = ${lit(u.id)}`))[0].status).toBe("suspended");

      // 本人は、どのページを開いても停止の画面へ
      await up.goto("/mypage");
      await expect(up).toHaveURL(/\/auth\/suspended/);
      await expect(up.getByRole("heading", { name: "利用を停止しています" })).toBeVisible();

      // 解除すると戻れる
      await act(page, page, { button: "停止を解除", confirm: "解除する", done: "停止を解除しました。" });
      await expect(page.getByText("⛔ この利用者は利用停止中です。")).toHaveCount(0);
      await up.goto("/mypage");
      await expect(up).toHaveURL(/\/mypage$/);
      expect((await notificationsOf(u.id)).map((n) => n.title)).toContain("アカウントの利用停止を解除しました");

      // 操作の記録（ID で探す）
      await page.goto(`/admin/logs?q=${u.id}`);
      await expect(page.getByText(`${adm.nickname}さんが利用者を停止しました（理由: E2E停止${r}）`)).toBeVisible();
      await expect(page.getByText(`${adm.nickname}さんが利用者の停止を解除しました`)).toBeVisible();
    } finally {
      await other.close();
    }
  });

  test.describe("強制退会", () => {
    // 退会した人の公開ページは 404
    test.use({ consoleAllow: [/status of 404/] });

    test("停止中の人を強制退会にすると、名前が「退会したユーザー」になり、ログインも止まり、公開の画面から消える", async ({ page, context }) => {
      const r = rid();
      const name = `D退会${r}`;
      const u = await freshUser("d-wd", { role: "seller", nickname: name });
      const listingId = await seedListing(u, { title: `D退会の商品${r}` });
      // 残高が残っていても、運営の強制退会はできる（admin_withdraw_user の決まり。台帳は残る）
      await seedLedger(u, 2000);
      const adm = await asAdmin(context);
      const pre = await admin().rpc("admin_set_user_status", { p_admin: adm.id, p_user: u.id, p_status: "suspended", p_reason: "E2E 下ごしらえ" });
      expect(pre.error).toBeNull();

      await page.goto(`/admin/users/${u.id}`);
      await act(page, page, {
        button: "強制退会",
        title: `${name}さんを強制退会させますか？`,
        reason: `E2E退会${r}`,
        confirm: "退会させる",
        done: /^退会にしました。/,
      });
      await expect(page.getByText("この利用者は退会済みです。")).toBeVisible();
      await expect(page.getByText("退会済みの利用者には操作できません。")).toBeVisible();

      const p = (await sql<{ status: string; nickname: string }>(`select status, nickname from public.profiles where id = ${lit(u.id)}`))[0];
      expect(p).toEqual({ status: "withdrawn", nickname: "退会したユーザー" });
      const au = await admin().auth.admin.getUserById(u.id);
      const bannedUntil = (au.data.user as { banned_until?: string | null } | null)?.banned_until ?? null;
      expect(bannedUntil, "ログインが止まっている").not.toBeNull();
      expect(new Date(bannedUntil ?? 0).getTime()).toBeGreaterThan(Date.now());
      expect(await ledgerSum(u.id), "台帳は残る").toBe(2000);

      // 公開の画面からは消える
      expect((await page.request.get(`/sellers/${u.id}`)).status()).toBe(404);
      expect((await page.request.get(`/items/${listingId}`)).status()).toBe(404);

      await page.goto(`/admin/logs?q=${u.id}`);
      await expect(page.getByText(`${adm.nickname}さんが利用者を強制退会にしました（理由: E2E退会${r}）`)).toBeVisible();
    });
  });
});

test.describe("ロールの変更申請", () => {
  test("承認すると役割が変わって本人に知らせ、却下すると理由が本人に届く", async ({ page, context }) => {
    const r = rid();
    const nameA = `D役割A${r}`;
    const nameB = `D役割B${r}`;
    const a = await freshUser("d-rca", { role: "buyer", nickname: nameA });
    const b = await freshUser("d-rcb", { role: "buyer", nickname: nameB });
    await sql(`
      insert into public.role_change_requests (user_id, from_role, to_role, reason, created_at)
      values (${lit(a.id)}, 'buyer', 'seller', 'E2E の申請', ${lit(OLD)}), (${lit(b.id)}, 'buyer', 'seller', 'E2E の申請', ${lit(OLD)})`);
    try {
      await asAdmin(context);
      await page.goto("/admin/users");
      // 申請の表の行（操作のボタンがある行）
      const reqRow = (name: string) => rowOf(page, name).filter({ has: page.getByRole("button", { name: "承認", exact: true }) });

      await act(page, reqRow(nameA), { button: "承認", title: "ロールの変更を承認しますか？", confirm: "承認する", done: "ロールの変更を承認しました。" });
      await expect(reqRow(nameA)).toHaveCount(0);
      expect((await sql<{ role: string }>(`select role from public.profiles where id = ${lit(a.id)}`))[0].role).toBe("seller");
      expect((await notificationsOf(a.id)).map((n) => n.title)).toContain("ロールの変更が承認されました");

      await act(page, reqRow(nameB), { button: "却下", title: "ロールの変更を却下しますか？", reason: `E2E却下${r}`, confirm: "却下する", done: "ロールの変更を却下しました。" });
      expect((await sql<{ role: string }>(`select role from public.profiles where id = ${lit(b.id)}`))[0].role).toBe("buyer");
      expect(await notificationsOf(b.id)).toContainEqual({ kind: "system", title: "ロールの変更申請を承認できませんでした", body: `E2E却下${r}` });
    } finally {
      await sql(`update public.role_change_requests set status = 'rejected', reject_reason = 'E2E の後始末', decided_at = now()
                 where user_id in (${lit(a.id)}, ${lit(b.id)}) and status = 'pending'`);
    }
  });
});
