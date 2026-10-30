/* 担当 A: スマホ（Pixel 7 の幅）での見た目。主な画面が横にはみ出さないこと・メニューから主な画面へ行けること */
import type { Page } from "@playwright/test";
import { freshUser, loginAs, seedListing, type Cast } from "./_db";
import { expect, test } from "./_fixtures";
import { clippedItems, overflowOf, setListingStatus, tok } from "./_a";

async function expectNoOverflow(page: Page, path: string) {
  const res = await page.goto(path);
  expect(res?.status(), path).toBeLessThan(400);
  const o = await overflowOf(page);
  expect(o.scrollWidth, `${path} が横にはみ出している: ${o.culprits.join(" / ")}`).toBeLessThanOrEqual(o.innerWidth + 1);
}

test.describe("横にはみ出さない（ログインしていない）", () => {
  for (const path of ["/", "/items", "/sellers", "/ranking", "/ranking?tab=listings", "/tweets", "/help", "/terms", "/privacy", "/legal", "/contact", "/auth", "/auth?tab=register", "/auth/reset"]) {
    test(`${path} をスマホで開くと、横にはみ出さない`, async ({ page }) => {
      await expectNoOverflow(page, path);
    });
  }

  test("商品の詳細と出品者のページをスマホで開くと、横にはみ出さない", async ({ page }) => {
    const seller = await freshUser("mob-pub", { role: "seller", nickname: `E2Eスマホ${tok()}` });
    // 長い題名・説明でも折り返されること
    const id = await seedListing(seller, {
      title: `E2Eスマホの商品${"あ".repeat(20)}`,
      description: `${"ながいせつめい".repeat(30)}https://example.test/${"x".repeat(80)}`,
    });
    try {
      await expectNoOverflow(page, `/items/${id}`);
      await expectNoOverflow(page, `/sellers/${seller.id}`);
    } finally {
      await setListingStatus([id], "deleted");
    }
  });
});

test.describe("横にはみ出さない（ログイン中）", () => {
  let seller: Cast;
  let buyer: Cast;
  test.beforeAll(async () => {
    seller = await freshUser("mob-sel", { role: "seller" });
    buyer = await freshUser("mob-buy", { role: "buyer" });
  });

  for (const path of ["/mypage", "/settings", "/mypage/profile", "/notifications", "/timeline", "/messages", "/mypage/items", "/mypage/sales", "/listings/new", "/orders", "/kyc", "/payout"]) {
    test(`出品者で ${path} をスマホで開くと、横にはみ出さない`, async ({ page, context }) => {
      await loginAs(context, seller);
      await expectNoOverflow(page, path);
    });
  }

  for (const path of ["/mypage", "/settings", "/mypage/profile", "/cart", "/orders", "/mypage/favorites", "/timeline"]) {
    test(`購入者で ${path} をスマホで開くと、横にはみ出さない`, async ({ page, context }) => {
      await loginAs(context, buyer);
      await expectNoOverflow(page, path);
    });
  }

  test("マイページとタイムラインの左のメニューは、スマホでも項目が全部枠の中に見える（出品者・購入者）", async ({ page, context }) => {
    for (const user of [seller, buyer]) {
      await loginAs(context, user);
      for (const [path, name] of [
        ["/mypage", "マイページのメニュー"],
        ["/timeline", "タイムラインの切り替え"],
      ] as const) {
        await page.goto(path);
        const nav = page.getByRole("navigation", { name });
        await expect(nav.getByRole("link").first()).toBeVisible();
        expect(await clippedItems(nav), `${user.role} ${path}`).toEqual([]);
      }
    }
  });
});

test.describe("スマホのメニュー", () => {
  test("ログインしていないとき、ヘッダーのメニューから女の子・商品・つぶやき・ランキング・ログインへ行ける", async ({ page }) => {
    const links: [string, RegExp][] = [
      ["女の子", /\/sellers$/],
      ["商品", /\/items$/],
      ["つぶやき", /\/tweets$/],
      ["ランキング", /\/ranking$/],
      ["ログイン", /\/auth/],
    ];
    for (const [name, url] of links) {
      await page.goto("/help");
      const nav = page.getByRole("navigation", { name: "メインメニュー" });
      const link = nav.getByRole("link", { name, exact: true });
      await expect(link, name).toBeVisible();
      await link.click();
      await expect(page, name).toHaveURL(url);
    }
  });

  test("トップの下のナビから、さがす・つぶやき・ログインへ行ける", async ({ page }) => {
    for (const [name, href, url] of [
      ["さがす", "/items", /\/items$/],
      ["つぶやき", "/tweets", /\/tweets$/],
      ["ログイン", "/auth", /\/auth/],
    ] as const) {
      await page.goto("/");
      const nav = page.getByRole("navigation", { name: "メニュー", exact: true });
      await expect(nav).toBeVisible();
      const link = nav.getByRole("link", { name });
      // 行き先が正しいことを先に確かめる（押せないときは、トップの横はみ出しが原因）
      await expect(link).toHaveAttribute("href", href);
      await link.click();
      await expect(page, name).toHaveURL(url);
    }
  });

  test("ログイン中は、ヘッダーからマイページ・メッセージ・お知らせへ行け、マイページのメニューから設定へ行ける", async ({ page, context }) => {
    const user = await freshUser("mob-nav", { role: "buyer" });
    await loginAs(context, user);
    // メッセージの画面はチャット用の見出し（メインメニューが無い）なので、毎回 /items から押す
    const links: [string | RegExp, RegExp][] = [
      [`${user.nickname}さん`, /\/mypage$/],
      [/^メッセージ/, /\/messages$/],
      [/^お知らせ/, /\/notifications$/],
    ];
    for (const [name, url] of links) {
      await page.goto("/items");
      await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name }).click();
      await expect(page, String(name)).toHaveURL(url);
    }
    await page.goto("/mypage");
    const side = page.getByRole("navigation", { name: "マイページのメニュー" });
    await side.getByRole("link", { name: "設定" }).click();
    await expect(page).toHaveURL(/\/settings$/);
  });
});
