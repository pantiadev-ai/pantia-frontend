/* 管理画面: 日々の運営の操作（担当 D）
   本人確認の審査・商品の非公開・通報・保留の投稿とメッセージ・注文・振込申請・操作の記録とメールの控え・検索・ダッシュボード。
   相手になる人は、どれも freshUser の使い捨ての人。古い順に並ぶ一覧には、古い日時で入れて1ページ目に出す。 */
import { admin, freshUser, lit, seedListing, sql } from "./_db";
import {
  act,
  asAdmin,
  closeKyc,
  closePayout,
  closeReports,
  kycFiles,
  ledgerSum,
  notificationsOf,
  OLD,
  PAYOUT_ACCOUNT,
  rid,
  rowOf,
  seedKyc,
  seedMessage,
  seedOrder,
  seedPayout,
  seedPost,
  seedReport,
} from "./_d";
import { expect, test } from "./_fixtures";

/** 1つの値を読む */
async function one<T>(q: string): Promise<T> {
  const rows = await sql<Record<string, T>>(q);
  return Object.values(rows[0] ?? {})[0] as T;
}

test.describe("本人確認の審査", () => {
  test("書類を見てから承認すると、本人が本人確認済みになって通知が届き、書類は消える", async ({ page, context }) => {
    const r = rid();
    const name = `D審査${r}`;
    const u = await freshUser("d-kyca", { role: "seller", nickname: name });
    const app = await seedKyc(u);
    try {
      const adm = await asAdmin(context);
      const mailOn = (await one<boolean>(`select mail_kyc from public.site_settings limit 1`)) === true;

      // 一覧（古い順）から開く
      await page.goto("/admin/kyc");
      await rowOf(page, name).getByRole("link", { name: "審査する" }).click();
      await expect(page).toHaveURL(new RegExp(`/admin/kyc/${app.id}$`));
      await expect(page.getByRole("heading", { level: 1 })).toContainText("本人確認の申請 #");

      // 承認か却下かを選ばないと記録できない
      await page.getByRole("button", { name: "判定を記録する" }).click();
      await expect(page.getByRole("alert").filter({ hasText: "承認か却下かを選んでください。" })).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);

      // 書類は押したときだけ、期限つきの URL で出る（見たことは記録に残り、申請は審査中になる）
      await page.getByRole("button", { name: "書類を見る（見たことは記録に残ります）" }).click();
      const img = page.getByRole("img", { name: "本人確認の書類 1" });
      await expect(img).toBeVisible();
      expect(await img.getAttribute("src")).toMatch(/token=/);
      await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      expect(await one<string>(`select status from public.kyc_applications where id = ${lit(app.id)}`)).toBe("reviewing");
      expect(await one<number>(`select count(*)::int from public.audit_logs where action = 'kyc.view_documents' and actor_id = ${lit(adm.id)} and target_id in (${lit(u.id)}, ${lit(app.id)})`)).toBe(1);

      await page.getByRole("radio", { name: "承認する" }).check();
      await page.getByRole("button", { name: "判定を記録する" }).click();
      const dialog = page.getByRole("dialog", { name: "承認しますか？" });
      await dialog.getByRole("button", { name: "承認する", exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(page.locator(".adm-toasts").getByText("承認しました。書類は消しました。")).toBeVisible();
      await expect(page.getByText("審査が済んだので、書類は消しました。")).toBeVisible();

      expect(await one<string>(`select kyc_status from public.profiles where id = ${lit(u.id)}`)).toBe("approved");
      expect(await one<string>(`select status from public.kyc_applications where id = ${lit(app.id)}`)).toBe("approved");
      expect((await notificationsOf(u.id)).filter((n) => n.kind === "kyc").map((n) => n.title)).toContain("本人確認が完了しました");
      expect(await kycFiles(u.id), "書類は置き場から消える").toBe(0);
      if (mailOn) {
        // メールは応答のあとに控えへ入る（MAIL_MODE=mock なので送らない）
        await expect
          .poll(() => one<number>(`select count(*)::int from public.mail_outbox where user_id = ${lit(u.id)} and kind = 'notice.kyc'`), { timeout: 15_000 })
          .toBe(1);
      }
    } finally {
      await closeKyc(app.id);
    }
  });

  test("却下には理由が要り、却下すると理由つきで本人に届き、書類は消える", async ({ page, context }) => {
    const r = rid();
    const u = await freshUser("d-kycr", { role: "seller", nickname: `D却下${r}` });
    const app = await seedKyc(u);
    try {
      await asAdmin(context);
      await page.goto(`/admin/kyc/${app.id}`);
      await page.getByRole("radio", { name: "却下する" }).check();
      await page.getByRole("button", { name: "判定を記録する" }).click();
      await expect(page.getByRole("alert").filter({ hasText: "却下の理由を入力してください（本人に届きます）。" })).toBeVisible();

      await page.getByLabel("却下の理由（必須・本人に届きます）").fill(`E2E書類が読めません${r}`);
      await page.getByRole("button", { name: "判定を記録する" }).click();
      const dialog = page.getByRole("dialog", { name: "却下しますか？" });
      await expect(dialog).toContainText(`理由: E2E書類が読めません${r}`);
      await dialog.getByRole("button", { name: "却下する", exact: true }).click();
      await expect(page.locator(".adm-toasts").getByText("却下しました。書類は消しました。")).toBeVisible();

      expect(await one<string>(`select kyc_status from public.profiles where id = ${lit(u.id)}`)).toBe("rejected");
      expect(await one<string>(`select status from public.profiles where id = ${lit(u.id)}`), "18歳未満でなければ止めない").toBe("active");
      const n = (await notificationsOf(u.id)).find((x) => x.title === "本人確認を承認できませんでした");
      expect(n?.body).toContain(`E2E書類が読めません${r}`);
      expect(await kycFiles(u.id)).toBe(0);
    } finally {
      await closeKyc(app.id);
    }
  });
});

test.describe("商品の非公開", () => {
  // 非公開の商品を開くと 404
  test.use({ consoleAllow: [/status of 404/] });

  test("運営が非公開にすると公開の一覧と詳細から消え、公開に戻すとまた出る", async ({ page, context, browser }) => {
    const r = rid();
    const title = `D非公開${r}`;
    const seller = await freshUser("d-item", { role: "seller", nickname: `D出品者${r}` });
    const listingId = await seedListing(seller, { title });
    const adm = await asAdmin(context);
    const guest = await browser.newContext();
    try {
      const gp = await guest.newPage();
      // 前: 誰でも見える
      expect((await guest.request.get(`/items/${listingId}`)).status()).toBe(200);
      // （検索語は「絞り込み中」の札にも出るので、商品へのリンクで確かめる）
      const card = gp.getByRole("link", { name: title, exact: true });
      await gp.goto(`/items?q=${encodeURIComponent(title)}`);
      await expect(card).toBeVisible();

      await page.goto(`/admin/items?q=${encodeURIComponent(title)}`);
      const row = rowOf(page, title);
      // 理由が無いと非公開にできない
      await row.getByRole("button", { name: "非公開", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "この商品を運営の判断で非公開にしますか？" });
      await dialog.getByRole("button", { name: "非公開にする", exact: true }).click();
      await expect(dialog.getByRole("alert")).toContainText("非公開にする理由を入力してください。");
      await dialog.getByRole("button", { name: "やめる" }).click();

      await act(page, row, { button: "非公開", reason: `E2E規約違反${r}`, confirm: "非公開にする", done: "非表示にしました。" });
      expect(await one<string>(`select status from public.listings where id = ${lit(listingId)}`)).toBe("hidden");
      expect((await notificationsOf(seller.id)).map((n) => n.title)).toContain("出品が運営により非表示になりました");

      expect((await guest.request.get(`/items/${listingId}`)).status()).toBe(404);
      await gp.goto(`/items?q=${encodeURIComponent(title)}`);
      await expect(gp.locator(".no-result-text")).toHaveText("検索結果が見つかりませんでした");
      await expect(card).toHaveCount(0);

      // 公開に戻す
      await act(page, rowOf(page, title), { button: "公開に戻す", title: "この商品を公開に戻しますか？", confirm: "公開に戻す", done: "公開に戻しました。" });
      expect(await one<string>(`select status from public.listings where id = ${lit(listingId)}`)).toBe("published");
      expect((await guest.request.get(`/items/${listingId}`)).status()).toBe(200);
      await gp.goto(`/items?q=${encodeURIComponent(title)}`);
      await expect(card).toBeVisible();

      // どちらも操作の記録に残る
      await page.goto(`/admin/logs?q=${listingId}`);
      await expect(page.getByText(`${adm.nickname}さんが「${title}」を非表示にしました（理由: E2E規約違反${r}）`)).toBeVisible();
      await expect(page.getByText(`${adm.nickname}さんが「${title}」を公開に戻しました`)).toBeVisible();
    } finally {
      await guest.close();
    }
  });
});

test.describe("通報", () => {
  test("同じつぶやきへの通報は古い順に並び、対応中→非表示→解決・却下ができ、記録に残る", async ({ page, context }) => {
    const r = rid();
    const author = await freshUser("d-rpa", { role: "seller", nickname: `D通報された${r}` });
    const rep1 = await freshUser("d-rp1", { role: "buyer" });
    const rep2 = await freshUser("d-rp2", { role: "buyer" });
    const postId = await seedPost(author, `D通報のつぶやき${r}`);
    const newer = await seedReport(rep2, { type: "post", id: postId, owner: author.id }, { detail: `D新しい${r}`, at: "2002-01-01 09:00:00+09" });
    const older = await seedReport(rep1, { type: "post", id: postId, owner: author.id }, { detail: `D古い${r}`, at: OLD });
    try {
      await asAdmin(context);
      await page.goto(`/admin/reports?q=${postId}`);
      const rows = page.getByRole("row").filter({ hasText: "#R" });
      await expect(rows).toHaveCount(2);
      await expect(rows.locator("td:first-child")).toHaveText([`#R${older.no}`, `#R${newer.no}`]);

      const rowOld = rowOf(page, `D古い${r}`);
      await act(page, rowOld, { button: "確認", title: "この通報を「対応中」にしますか？", confirm: "対応中にする", done: "通報の状態を変えました。" });
      expect(await one<string>(`select status from public.reports where id = ${lit(older.id)}`)).toBe("reviewing");

      await act(page, rowOld, { button: "非表示", title: "通報されたつぶやきを非表示にしますか？", confirm: "非表示にする", done: "非表示にしました。" });
      expect(await one<string>(`select status from public.posts where id = ${lit(postId)}`)).toBe("hidden");
      await expect(rowOld.getByText("非表示済み")).toBeVisible();

      await act(page, rowOld, { button: "解決", title: "この通報を「解決済み」にしますか？", reason: `E2E非表示にした${r}`, confirm: "解決済みにする", done: "通報の状態を変えました。" });
      await act(page, rowOf(page, `D新しい${r}`), { button: "却下", title: "この通報を「問題なし」で閉じますか？", confirm: "問題なしで閉じる", done: "通報の状態を変えました。" });
      const st = await sql<{ id: string; status: string }>(`select id, status from public.reports where id in (${lit(older.id)}, ${lit(newer.id)})`);
      expect(Object.fromEntries(st.map((s) => [s.id, s.status]))).toEqual({ [older.id]: "resolved", [newer.id]: "dismissed" });
      // 閉じた通報は「対応が要る」一覧から消える
      await expect(rows).toHaveCount(0);

      expect(await one<number>(`select count(*)::int from public.audit_logs where action like 'report.%' and (detail ->> 'report_no')::bigint in (${older.no}, ${newer.no})`)).toBeGreaterThanOrEqual(3);
    } finally {
      await closeReports([older.id, newer.id]);
    }
  });
});

test.describe("保留の投稿とメッセージ", () => {
  // 非表示のつぶやきを開くと 404
  test.use({ consoleAllow: [/status of 404/] });

  test("保留のつぶやきを非表示にすると誰にも見えず、非表示の一覧から公開に戻すと見えるようになる", async ({ page, context, browser }) => {
    const r = rid();
    const body = `D保留のつぶやき${r}`;
    const author = await freshUser("d-modp", { role: "seller", nickname: `D投稿者${r}` });
    const postId = await seedPost(author, body, { status: "held", at: OLD });
    const guest = await browser.newContext();
    try {
      await asAdmin(context);
      await page.goto("/admin/moderation");
      await act(page, rowOf(page, body), { button: "非表示", title: "このつぶやきを非表示にしますか？", confirm: "非表示にする", done: "非表示にしました。" });
      expect(await one<string>(`select status from public.posts where id = ${lit(postId)}`)).toBe("hidden");
      await expect(rowOf(page, body)).toHaveCount(0);
      expect((await guest.request.get(`/tweets/${postId}`)).status()).toBe(404);

      // 非表示の一覧は新しい順なので、いまの日時に寄せてから探す（下ごしらえ）
      await sql(`update public.posts set created_at = now() where id = ${lit(postId)}`);
      await page.goto("/admin/moderation?view=hidden");
      await act(page, rowOf(page, body), { button: "公開", title: "このつぶやきを公開しますか？", confirm: "公開する", done: "公開しました。" });
      expect(await one<string>(`select status from public.posts where id = ${lit(postId)}`)).toBe("visible");

      const gp = await guest.newPage();
      await gp.goto(`/tweets/${postId}`);
      await expect(gp.getByText(body).first()).toBeVisible();
    } finally {
      await guest.close();
    }
  });

  test("保留のメッセージを非表示にできる", async ({ page, context }) => {
    const r = rid();
    const body = `D保留のメッセージ${r}`;
    const seller = await freshUser("d-mods", { role: "seller" });
    const buyer = await freshUser("d-modb", { role: "buyer", nickname: `D送り手${r}` });
    const msgId = await seedMessage(seller, buyer, body, { status: "held", at: OLD });
    await asAdmin(context);
    await page.goto("/admin/moderation?type=message");
    await act(page, rowOf(page, body), { button: "非表示", title: "このメッセージを非表示にしますか？", confirm: "非表示にする", done: "非表示にしました。" });
    expect(await one<string>(`select status from public.messages where id = ${lit(msgId)}`)).toBe("hidden");
  });
});

test.describe("注文", () => {
  test("注文を商品名で探して詳細を開くと、金額や流れは出るが、送り先の住所・氏名・電話は出ない", async ({ page, context }) => {
    const r = rid();
    const title = `D注文${r}`;
    const seller = await freshUser("d-ords", { role: "seller" });
    const buyer = await freshUser("d-ordb", { role: "buyer", kyc: "approved" });
    const address = { name: `E2E宛名${r}`, postal: "100-0001", prefecture: "東京都", address1: `千代田区E2E町${r}`, address2: `E2E荘${r}`, phone: "09011112222" };
    const { orderId } = await seedOrder(seller, buyer, title, address);
    const no = await one<number>(`select order_no from public.orders where id = ${lit(orderId)}`);
    await asAdmin(context);

    await page.goto("/admin/orders");
    await page.getByRole("searchbox", { name: "注文番号・商品名で検索" }).fill(title);
    await page.getByRole("button", { name: "絞り込む" }).click();
    await rowOf(page, title).getByRole("link", { name: "詳細" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/orders/${orderId}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`注文 #${no}`);
    await expect(page.getByText("金額の内訳")).toBeVisible();
    await expect(page.getByText("取引の流れ")).toBeVisible();

    const body = page.locator("body");
    for (const secret of [address.name, address.address1, address.address2, address.phone, "090-1111-2222"]) {
      await expect(body, `「${secret}」を出さない`).not.toContainText(secret);
    }
  });
});

test.describe("振込申請", () => {
  test("振込済みにすると、確認の窓に口座番号が全部出て、出品者に金額つきの通知が届く", async ({ page, context }) => {
    const r = rid();
    const name = `D振込${r}`;
    const u = await freshUser("d-pay", { role: "seller", nickname: name });
    const p = await seedPayout(u, 5000);
    try {
      await asAdmin(context);
      await page.goto("/admin/sales");
      const row = rowOf(page, name);
      await expect(row).toContainText(`#${p.no}`);
      await expect(row).toContainText("E2E銀行 ****4321");
      await expect(row).not.toContainText(PAYOUT_ACCOUNT);

      await row.getByRole("button", { name: "振込済み", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: `${name}さんへの振込を「振込済み」にしますか？` });
      await expect(dialog).toContainText(PAYOUT_ACCOUNT);
      await dialog.getByRole("button", { name: "振込済みにする", exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(page.locator(".adm-toasts").getByText("振込済みにしました。出品者に通知しました。")).toBeVisible();

      expect(await one<string>(`select status from public.payouts where id = ${lit(p.id)}`)).toBe("paid");
      expect(await notificationsOf(u.id)).toContainEqual({ kind: "payout", title: "振込が完了しました", body: `¥${p.net}（E2E銀行）` });
      expect(await ledgerSum(u.id), "申請の時点で残高から引いてあるので、そのまま").toBe(0);
    } finally {
      await closePayout(p.id);
    }
  });

  test("振込申請を却下すると、申請額が残高に戻り、理由つきで出品者に届く", async ({ page, context }) => {
    const r = rid();
    const name = `D振込却下${r}`;
    const u = await freshUser("d-payr", { role: "seller", nickname: name });
    const p = await seedPayout(u, 3000);
    try {
      await asAdmin(context);
      expect(await ledgerSum(u.id)).toBe(0);
      await page.goto("/admin/sales");
      await act(page, rowOf(page, name), {
        button: "却下",
        title: `${name}さんの振込申請を却下しますか？`,
        reason: `E2E口座の名義が違います${r}`,
        confirm: "却下する",
        done: "振込申請を却下し、申請額を残高に戻しました。",
      });
      expect(await one<string>(`select status from public.payouts where id = ${lit(p.id)}`)).toBe("rejected");
      expect(await ledgerSum(u.id)).toBe(3000);
      expect(await notificationsOf(u.id)).toContainEqual({
        kind: "payout",
        title: "振込申請を承認できませんでした",
        body: `E2E口座の名義が違います${r}（残高に戻しました）`,
      });
      await page.goto(`/admin/users/${u.id}`);
      await expect(page.locator(".adm-statline").filter({ hasText: "売上の残高" }).locator("b")).toHaveText("¥3,000");
    } finally {
      await closePayout(p.id);
    }
  });
});

test.describe("操作の記録・検索・ダッシュボード", () => {
  test("操作の記録は1ページ50件までで、ID でない言葉で探すと案内が出る", async ({ page, context }) => {
    await asAdmin(context);
    await page.goto("/admin/logs");
    const items = page.locator(".activity-item");
    await expect(items.first()).toBeVisible();
    expect(await items.count()).toBeLessThanOrEqual(50);

    await page.getByRole("searchbox", { name: "ユーザーID・対象IDで検索" }).fill("山田");
    await page.getByRole("button", { name: "絞り込む" }).click();
    await expect(page.getByText("検索は ID（ユーザー詳細などに出ている英数字の列）で入れてください。")).toBeVisible();
  });

  test("メールの控えではあて先を伏せて出し、本文は出さない", async ({ page, context }) => {
    const r = rid();
    const to = `dmask${r}@example.test`;
    const ids = await sql<{ id: number | string }>(`
      insert into public.mail_outbox (user_id, to_address, kind, subject, body, mode, sent)
      values (null, ${lit(to)}, 'e2e.mask', ${lit(`E2E件名${r}`)}, ${lit(`E2E本文${r}`)}, 'mock', true)
      returning id`);
    try {
      await asAdmin(context);
      await page.goto("/admin/logs?tab=mail");
      const row = rowOf(page, `E2E件名${r}`);
      await expect(row).toContainText("d***@example.test");
      await expect(row).not.toContainText(to);
      await expect(page.locator("body")).not.toContainText(`E2E本文${r}`);
    } finally {
      await sql(`delete from public.mail_outbox where id = ${ids[0].id}`);
    }
  });

  test("検索の画面で、名前・商品名・注文番号から利用者・商品・注文が見つかる", async ({ page, context }) => {
    const r = rid();
    const key = `D検索${r}`;
    const seller = await freshUser("d-srch", { role: "seller", nickname: key });
    const buyer = await freshUser("d-srcb", { role: "buyer", kyc: "approved" });
    const address = { name: "E2E宛名", postal: "100-0001", prefecture: "東京都", address1: "千代田区1-1", address2: "", phone: "09011112222" };
    const { orderId, listingId } = await seedOrder(seller, buyer, `${key}の品`, address);
    const no = await one<number>(`select order_no from public.orders where id = ${lit(orderId)}`);
    await asAdmin(context);

    await page.goto("/admin/search");
    await page.getByRole("searchbox", { name: "名前・商品名・注文番号・ID" }).fill(key);
    await page.getByRole("button", { name: "絞り込む" }).click();
    await expect(page.locator(`a[href="/admin/users/${seller.id}"]`)).toBeVisible();
    await expect(page.locator(`a[href="/admin/items?q=${listingId}"]`)).toBeVisible();
    await expect(page.locator(`a[href="/admin/orders/${orderId}"]`)).toBeVisible();

    // 注文番号でも
    await page.goto(`/admin/search?q=${encodeURIComponent(`#${no}`)}`);
    await expect(page.locator(`a[href="/admin/orders/${orderId}"]`)).toBeVisible();
    // ID でも
    await page.goto(`/admin/search?q=${seller.id}`);
    await expect(page.locator(`a[href="/admin/users/${seller.id}"]`)).toBeVisible();
  });

  test("ダッシュボードに売上・利用者数・取引数・平均評価が出て、数は集計の関数と合う", async ({ page, context }) => {
    const adm = await asAdmin(context);
    const dash = async () => {
      const { data, error } = await admin().rpc("admin_dashboard", { p_admin: adm.id, p_months: 6 });
      expect(error).toBeNull();
      return data as Record<string, unknown>;
    };
    const before = await dash();
    await page.goto("/admin");
    const after = await dash();
    const kpi = (label: string) => page.locator(".kpi-card").filter({ hasText: label }).locator(".kpi-num");
    const digits = (s: string) => Number(s.replace(/[^\d]/g, ""));

    await expect(kpi("💰 今月の総売上")).toHaveText(/^¥[\d,]+$/);
    await expect(kpi("👥 総ユーザー数")).toHaveText(/^[\d,]+$/);
    await expect(kpi("📦 今月の取引数")).toHaveText(/^[\d,]+件$/);
    await expect(kpi("⭐ 平均評価")).toHaveText(/^(-|\d\.\d\d)$/);

    // ほかの試験が同時に人を作るので、読む前後の値の間にあればよい
    const users = digits(await kpi("👥 総ユーザー数").innerText());
    expect(users).toBeGreaterThanOrEqual(Number(before.users_total));
    expect(users).toBeLessThanOrEqual(Number(after.users_total));
    const sales = digits(await kpi("💰 今月の総売上").innerText());
    expect(sales).toBeGreaterThanOrEqual(Math.min(Number(before.sales_month), Number(after.sales_month)));
    expect(sales).toBeLessThanOrEqual(Math.max(Number(before.sales_month), Number(after.sales_month)));
  });
});
