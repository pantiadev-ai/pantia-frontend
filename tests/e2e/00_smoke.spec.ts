/* 土台の確かめ: 公開の画面が開く・守りの見出し・ログインの省略・管理画面の二段階認証・cron の鍵 */
import { cast, loginAs, seedListing } from "./_db";
import { e2eEnv } from "./_env";
import { expect, test } from "./_fixtures";

const PUBLIC_PAGES = ["/", "/items", "/sellers", "/ranking", "/help", "/terms", "/privacy", "/legal", "/contact", "/auth", "/tweets"];

test.describe("公開の画面", () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} が開く`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.locator("body")).not.toContainText("Application error");
      await expect(page).toHaveTitle(/パンティア/);
    });
  }

  test("守りの見出し（CSP は1本・script には nonce）", async ({ page, request }) => {
    const res = await request.get("/");
    const headers = res.headersArray().filter((h) => /^content-security-policy(-report-only)?$/i.test(h.name));
    expect(headers.length, "CSP の見出しは1本").toBe(1);
    expect(res.headers()["x-frame-options"] ?? res.headers()["content-security-policy"]).toBeTruthy();
    await page.goto("/");
    const missing = await page.locator("script:not([nonce])").count();
    expect(missing, "nonce の無い script").toBe(0);
  });

  test("商品の詳細が開く", async ({ page }) => {
    const seller = await cast("seller");
    const id = await seedListing(seller, { title: "E2E スモークの商品" });
    const res = await page.goto(`/items/${id}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "E2E スモークの商品" })).toBeVisible();
  });
});

test.describe("ログインの省略と管理画面", () => {
  test("出品者としてマイページが開く", async ({ page, context }) => {
    const seller = await cast("seller");
    await loginAs(context, seller);
    const res = await page.goto("/mypage");
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(/\/mypage$/);
    await expect(page.locator("body")).toContainText(seller.nickname);
  });

  test("二段階認証の前の管理者は /admin/mfa へ回される", async ({ page, context }) => {
    const adm = await cast("admin");
    await loginAs(context, adm);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/mfa/);
  });

  test("二段階認証を済ませた管理者は管理画面が開く", async ({ page, context }) => {
    const adm = await cast("admin");
    await loginAs(context, adm, { aal2: true });
    const res = await page.goto("/admin");
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(/\/admin$/);
  });

});

test.describe("404", () => {
  // 404 の画面そのものの読み込みは console に出る
  test.use({ consoleAllow: [/status of 404/] });

  test("ログインなしで一覧に無いパスはログインへ回す（公開の範囲を広げない）", async ({ page }) => {
    await page.goto("/no-such-page");
    await expect(page).toHaveURL(/\/auth\?next=%2Fno-such-page$/);
  });

  test("ログインした人が存在しない画面を開くと 404", async ({ page, context }) => {
    await loginAs(context, await cast("buyer"));
    const res = await page.goto("/no-such-page");
    expect(res?.status()).toBe(404);
    await expect(page.locator("body")).toContainText("見つかりません");
  });

  test("存在しない商品・出品者は 404", async ({ page }) => {
    const none = "00000000-0000-4000-8000-000000000000";
    for (const path of [`/items/${none}`, `/sellers/${none}`, `/tweets/${none}`]) {
      expect((await page.goto(path))?.status(), path).toBe(404);
    }
  });

  test("管理者でない人には /admin は 404", async ({ page, context }) => {
    const buyer = await cast("buyer");
    await loginAs(context, buyer);
    const res = await page.goto("/admin");
    expect(res?.status()).toBe(404);
  });
});

test.describe("cron", () => {
  const CRONS = ["expire-orders", "auto-complete", "retry-refunds", "cleanup"];

  test("鍵なし・違う鍵は 401、正しい鍵なら走り、health が 200 になる", async ({ request }) => {
    for (const name of CRONS) {
      expect((await request.get(`/api/cron/${name}`)).status(), `${name} 鍵なし`).toBe(401);
      expect((await request.get(`/api/cron/${name}`, { headers: { authorization: "Bearer wrong-secret-0000000000" } })).status(), `${name} 違う鍵`).toBe(401);
    }
    for (const name of CRONS) {
      const res = await request.get(`/api/cron/${name}`, { headers: { authorization: `Bearer ${e2eEnv().cronSecret}` } });
      expect(res.status(), name).toBe(200);
      expect((await res.json()).ok, name).toBe(true);
    }
    const health = await request.get("/api/cron/health");
    expect(health.status()).toBe(200);
    expect(await health.json()).toEqual({ ok: true, stale: [] });
  });
});
