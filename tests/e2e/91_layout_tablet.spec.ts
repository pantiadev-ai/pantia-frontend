/* PC とスマホの間の幅（iPad の縦置き・横置きなど 769〜1180px）。
   ヘッダーの文字のメニューが入りきらない幅では「☰ メニュー」にまとめ、横にはみ出さない。
   名前は上限の20文字でも崩れないこと（2026-11-03、769〜1024px で「ログアウト」と名前が画面の外に出ていた） */
import { freshUser, loginAs } from "./_db";
import { expect, test } from "./_fixtures";
import { clippedItems, overflowOf } from "./_a";

const LONG_NAME = "あ".repeat(20);

test.describe("間の幅のヘッダー", () => {
  test("名前が20文字の出品者でも、769〜1180px でヘッダーが横にはみ出さず、項目が切れない", async ({ page, context }) => {
    await loginAs(context, await freshUser("tab-hdr", { role: "seller", nickname: LONG_NAME }));
    for (const width of [769, 820, 900, 1024, 1025, 1100, 1180]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/items", "/mypage", "/tweets", "/timeline", "/messages"]) {
        await page.goto(path);
        const o = await overflowOf(page);
        expect(o.scrollWidth, `${width}px ${path} が横にはみ出している: ${o.culprits.join(" / ")}`).toBeLessThanOrEqual(o.innerWidth + 1);
        expect(await clippedItems(page.locator("header").first()), `${width}px ${path} で切れている項目`).toEqual([]);
      }
    }
  });

  test("1024px 以下は「☰ メニュー」の中に、1025px 以上はヘッダーにログアウトがあり、どちらでも押せる", async ({ page, context }) => {
    await loginAs(context, await freshUser("tab-out", { role: "buyer", nickname: LONG_NAME }));
    const menuBtn = page.getByRole("button", { name: "メニュー", exact: true });
    const navOut = page.getByRole("navigation", { name: "メインメニュー" }).getByRole("button", { name: "ログアウト" });

    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("/items");
    await expect(navOut).toBeHidden();
    await menuBtn.click();
    await expect(page.getByRole("dialog", { name: "メニュー" }).getByRole("button", { name: "ログアウト" })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 1025, height: 900 });
    await page.goto("/items");
    await expect(menuBtn).toBeHidden();
    await expect(navOut).toBeVisible();
  });

  test("ヘッダーの名前は長いと「…」で縮め、マウスを重ねると全部が見える", async ({ page, context }) => {
    await loginAs(context, await freshUser("tab-name", { role: "buyer", nickname: LONG_NAME }));
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/items");
    const name = page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name: `${LONG_NAME}さん` });
    await expect(name).toBeVisible();
    await expect(name).toHaveAttribute("title", `${LONG_NAME}さん`);
    const fit = await name.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth, ellipsis: getComputedStyle(el).textOverflow }));
    expect(fit.ellipsis).toBe("ellipsis");
    expect(fit.scroll).toBeGreaterThan(fit.client);
  });
});
