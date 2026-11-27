/* 担当 A: スマホ（Pixel 7 の 412px と iPhone 12 mini の 375px）での見た目。
   主な画面が横にはみ出さないこと・右上の「☰ メニュー」から主な画面へ行けること・
   貼り付く欄が中身に重ならないこと・入力欄で iPhone が拡大しないこと（2026-11-03 に運営から指摘） */
import type { Locator, Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { admin, freshUser, lit, loginAs, seedListing, sql, type Cast } from "./_db";
import { expect, test } from "./_fixtures";
import { clippedItems, coverGaps, overflowOf, setListingStatus, tok } from "./_a";
import { seedBank } from "./_b";
import { seedThread } from "./_c";
import { asAdmin } from "./_d";

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

// プロフィールの板がカバーの下の端に 48px かぶさっていた。客先から「重ねないで並べて」（2026-11-10）
test("出品者のページのプロフィールの板は、カバーに重ならず、少し間を空けて下に並ぶ", async ({ page }) => {
  const seller = await freshUser("mob-cov", { role: "seller" });
  await page.goto(`/sellers/${seller.id}`);
  const g = await coverGaps(page);
  expect(g.card, "カバーと板の間").toBeGreaterThanOrEqual(8);
  expect(g.card, "カバーと板の間").toBeLessThanOrEqual(40);
  expect(g.main, "カバーと右の中身の間").toBeGreaterThanOrEqual(8);
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

  test("管理画面のキャラの一覧と、キャラの名前で出品する画面は、スマホでも横にはみ出さない", async ({ page, context }) => {
    const adm = await asAdmin(context);
    const chara = await freshUser("mob-chr", { role: "seller" });
    const { error } = await admin().rpc("admin_mark_character", { p_admin: adm.id, p_user: chara.id, p_note: "E2E のスマホの試験" });
    // 前の回で印が付いたまま（bad_state）なら、そのまま使う
    if (error && !error.message.includes("bad_state")) throw new Error(`キャラの印を付けられませんでした: ${error.message}`);
    await expectNoOverflow(page, "/admin/characters");
    await expectNoOverflow(page, `/admin/characters/${chara.id}/new`);
    await expect(page.getByText("このキャラの名前で出品します")).toBeVisible();
  });
});

/** 右上の「☰ メニュー」を開き、開いた板を返す */
async function openMenu(page: Page) {
  await page.getByRole("button", { name: "メニュー", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "メニュー" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("スマホのメニュー", () => {
  test("ログインしていないとき、右上の「☰ メニュー」から女の子・商品・つぶやき・ランキング・ログインへ行け、行ったら板は閉じる", async ({ page }) => {
    const links: [string, RegExp][] = [
      ["女の子", /\/sellers$/],
      ["商品", /\/items$/],
      ["つぶやき", /\/tweets$/],
      ["ランキング", /\/ranking$/],
      ["ログイン", /\/auth/],
    ];
    for (const [name, url] of links) {
      await page.goto("/help");
      const dialog = await openMenu(page);
      await dialog.getByRole("navigation", { name: "スマホのメニュー" }).getByRole("link", { name, exact: true }).click();
      await expect(page, name).toHaveURL(url);
      await expect(dialog, name).toBeHidden();
    }
  });

  test("メニューの板は画面いっぱいの不透明な白で、下のページが透けず、✕ と Esc で閉じる", async ({ page, context }) => {
    await loginAs(context, await freshUser("mob-menu", { role: "buyer" }));
    await page.goto("/mypage");
    const dialog = await openMenu(page);
    const look = await dialog.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      const hit = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 20);
      return {
        box: [r.left, r.top, r.width, r.height].map(Math.round),
        view: [window.innerWidth, window.innerHeight],
        bg: s.backgroundColor,
        hitInside: !!hit && el.contains(hit),
      };
    });
    expect(look.box).toEqual([0, 0, ...look.view]);
    expect(look.bg, "透けない白").toBe("rgb(255, 255, 255)");
    expect(look.hitInside, "板の下の方を押しても、下のページに届かない").toBe(true);

    await dialog.getByRole("button", { name: "閉じる" }).click();
    await expect(dialog).toBeHidden();
    await openMenu(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "メニュー" })).toBeHidden();
  });

  test("ログアウトはメニューの下にあり、幅いっぱいで高さ44px以上あって、押すとログアウトできる", async ({ page, context }) => {
    await loginAs(context, await freshUser("mob-out", { role: "buyer" }));
    await page.goto("/mypage");
    const dialog = await openMenu(page);
    const button = dialog.getByRole("button", { name: "ログアウト" });
    const box = (await button.boundingBox())!;
    const width = page.viewportSize()!.width;
    expect(box.height, "高さ").toBeGreaterThanOrEqual(44);
    expect(box.width, "幅").toBeGreaterThanOrEqual(width * 0.8);
    await button.click();
    await expect(page).toHaveURL("http://localhost:3100/");
    await expect(page.locator("nav.pt-nav").getByRole("link", { name: "ログイン" })).toBeVisible();
  });

  test("ログイン中も、ヘッダーは1行のままで、項目が縦に折れたり枠の外に切れたりしない（約款の画面も）", async ({ page, context }) => {
    await loginAs(context, await freshUser("mob-head", { role: "buyer", admin: true }));
    for (const path of ["/items", "/mypage", "/timeline", "/tweets", "/help", "/terms", "/contact"]) {
      await page.goto(path);
      const header = page.locator("header").first();
      const h = (await header.boundingBox())!.height;
      expect(h, `${path} のヘッダーの高さ`).toBeLessThanOrEqual(72);
      const nav = page.getByRole("navigation", { name: "メインメニュー" });
      expect(await clippedItems(nav), `${path} で枠の外に切れた項目`).toEqual([]);
      const tall = await header.evaluate((el) =>
        Array.from(el.querySelectorAll<HTMLElement>("a, button"))
          .filter((a) => a.getClientRects().length > 0 && a.getBoundingClientRect().height > 48)
          .map((a) => a.textContent?.trim() ?? ""),
      );
      expect(tall, `${path} で縦に伸びた項目`).toEqual([]);
    }
  });

  // ㉑㉒ 売手の会話の頭には「交渉中」のボタンが1つ増える。札も名前の下に出る
  test("売手の会話の画面は、交渉中のボタンと札が増えても、頭の項目が枠の外に切れず、横にはみ出さない", async ({ page, context }) => {
    const seller = await freshUser("mob-neg", { role: "seller", kyc: "approved" });
    const buyer = await freshUser("mob-neg", { role: "buyer", kyc: "approved", messageConsent: true });
    const tid = await seedThread(seller, buyer);
    await loginAs(context, seller);
    await page.goto(`/messages/${tid}`);
    const head = page.locator(".chat-header");
    await expect(page.getByRole("button", { name: "交渉中にする" })).toBeVisible();
    await page.getByRole("button", { name: "交渉中にする" }).click();
    await expect(head.locator(".chat-nego-badge")).toHaveText("交渉中");
    expect(await clippedItems(head), "会話の頭で枠の外に切れた項目").toEqual([]);
    const o = await overflowOf(page);
    expect(o.scrollWidth, `会話の画面が横にはみ出している: ${o.culprits.join(" / ")}`).toBeLessThanOrEqual(o.innerWidth + 1);
    expect((await head.boundingBox())!.height, "会話の頭の高さ").toBeLessThanOrEqual(72);
  });

  // 購入者の側は、状態の文が「2026/11/01にログイン」のように長くなる。札と並ぶと2行になり、頭が 78px になっていた（2026-11-18 の点検）
  test("購入者の会話の画面は、交渉中の札と長い日付が並んでも、状態の文が1行で、頭が 72px を超えない", async ({ page, context }) => {
    const seller = await freshUser("mob-neg-b", { role: "seller", kyc: "approved" });
    const buyer = await freshUser("mob-neg-b", { role: "buyer", kyc: "approved", messageConsent: true });
    const tid = await seedThread(seller, buyer);
    await sql(`update public.threads set negotiating = true where id = ${lit(tid)}`);
    await sql(`update public.profiles set last_seen_at = now() - interval '30 days' where id = ${lit(seller.id)}`);
    // 長い「○○にログイン」は、ログイン中の表示を出す設定のときだけ出る（改修リスト 行9。既定は隠す）。この試験の中だけ出し、終わったら戻す
    await sql(`update public.site_settings set show_presence = true where id`);
    try {
      await loginAs(context, buyer);
      await page.goto(`/messages/${tid}`);
      const head = page.locator(".chat-header");
      await expect(head.locator(".chat-nego-badge")).toHaveText("交渉中");
      await expect(head.locator(".ch-status")).toContainText("にログイン");
      expect((await head.locator(".ch-status").boundingBox())!.height, "状態の文の高さ（1行）").toBeLessThanOrEqual(20);
      expect((await head.boundingBox())!.height, "会話の頭の高さ").toBeLessThanOrEqual(72);
      const o = await overflowOf(page);
      expect(o.scrollWidth, `会話の画面が横にはみ出している: ${o.culprits.join(" / ")}`).toBeLessThanOrEqual(o.innerWidth + 1);
    } finally {
      await sql(`update public.site_settings set show_presence = false where id`);
    }
  });

  // 320px（初代 iPhone SE など）では、どの種類のヘッダーも右端から「☰ メニュー」が 3〜26px はみ出していた（2026-11-16 の点検）。
  // 360px 以上は収まっていた。360px より狭いときだけ ☰ だけにする（ボタンの名前は「メニュー」のまま）
  test("320px の画面でも、ログインの有無にかかわらず、どの種類のヘッダーも項目が枠の外に出ず、メニューを開ける", async ({ page, context }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const seller = await freshUser("mob-320", { role: "seller" });
    const id = await seedListing(seller);
    const outside = () =>
      page.locator("header").first().evaluate((el) => {
        const vw = document.documentElement.clientWidth;
        return Array.from(el.querySelectorAll<HTMLElement>("a, button"))
          .filter((a) => a.getClientRects().length > 0)
          .filter((a) => {
            const b = a.getBoundingClientRect();
            return b.left < -1 || b.right > vw + 1;
          })
          .map((a) => a.getAttribute("aria-label") || a.textContent?.trim() || "");
      });
    try {
      // ログインしていない: トップ（左右 16px）・一覧・約款・商品・出品者（左右 28px）
      for (const path of ["/", "/items", "/privacy", `/items/${id}`, `/sellers/${seller.id}`]) {
        await page.goto(path);
        expect(await outside(), `ログインしていない ${path} で枠の外に出た項目`).toEqual([]);
      }
      // ログイン中は 💬 🔔 が足される。マイページ・タイムライン・つぶやき・出品・カート（app の型）・チャットの頭も
      await loginAs(context, seller);
      for (const path of ["/", "/items", `/items/${id}`, "/mypage", "/timeline", "/tweets", "/listings/new", "/cart", "/messages"]) {
        await page.goto(path);
        expect(await outside(), `ログイン中 ${path} で枠の外に出た項目`).toEqual([]);
      }
      // ☰ だけになっても、名前は「メニュー」のままで開ける
      await page.goto("/items");
      await expect((await openMenu(page)).getByRole("link", { name: "マイページ", exact: true })).toBeVisible();
    } finally {
      await setListingStatus([id], "deleted");
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

  test("ログイン中は、ヘッダーの 💬 🔔 からメッセージ・お知らせへ、メニューからマイページ・商品一覧・タイムラインへ行け、マイページのメニューから設定へ行ける", async ({ page, context }) => {
    const user = await freshUser("mob-nav", { role: "buyer" });
    await loginAs(context, user);
    // メッセージの画面はチャット用の見出し（メインメニューが無い）なので、毎回 /items から押す
    for (const [name, url] of [
      [/^メッセージ/, /\/messages$/],
      [/^お知らせ/, /\/notifications$/],
    ] as const) {
      await page.goto("/items");
      await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name }).click();
      await expect(page, String(name)).toHaveURL(url);
    }
    for (const [name, url] of [
      ["マイページ", /\/mypage$/],
      ["商品一覧", /\/items$/],
      ["タイムライン", /\/timeline$/],
    ] as const) {
      await page.goto("/tweets");
      const dialog = await openMenu(page);
      await dialog.getByRole("link", { name, exact: true }).click();
      await expect(page, name).toHaveURL(url);
    }
    // メッセージの画面（チャット用の見出し）にも、同じメニューがある
    await page.goto("/messages");
    await expect((await openMenu(page)).getByRole("button", { name: "ログアウト" })).toBeVisible();
    await page.goto("/mypage");
    const side = page.getByRole("navigation", { name: "マイページのメニュー" });
    await side.getByRole("link", { name: "設定" }).click();
    await expect(page).toHaveURL(/\/settings$/);
  });
});

test.describe("マイページの中の画面", () => {
  test("設定などの中の画面は、上に「‹ マイページ」と中身だけが出て、プロフィールと左のメニューは出ない（最初の画面には出る）", async ({ page, context }) => {
    const buyer = await freshUser("mob-sub", { role: "buyer" });
    const seller = await freshUser("mob-sub", { role: "seller" });
    for (const [user, paths] of [
      // /orders はマイページの枠（MypageShell）を使わない画面なので、ここには入れない
      [buyer, ["/settings", "/mypage/following", "/mypage/profile", "/mypage/favorites", "/notifications"]],
      [seller, ["/mypage/items", "/mypage/sales", "/payout", "/settings"]],
    ] as const) {
      await loginAs(context, user);
      for (const path of paths) {
        await page.goto(path);
        const back = page.getByRole("link", { name: "マイページに戻る" });
        await expect(back, path).toBeVisible();
        await expect(page.getByRole("navigation", { name: "マイページのメニュー" }), path).toBeHidden();
        await expect(page.locator(".pm-name"), path).toBeHidden();
        // 中身が画面の上の方から始まる（前は、プロフィールとメニューの下に押し下げられていた）
        const top = (await page.locator(".main .panel").boundingBox())!.y;
        expect(top, `${path} の中身の上端`).toBeLessThan(page.viewportSize()!.height * 0.4);
      }
      await page.goto("/mypage");
      await expect(page.getByRole("navigation", { name: "マイページのメニュー" })).toBeVisible();
      await expect(page.getByRole("link", { name: "マイページに戻る" })).toBeHidden();
    }
    await page.goto("/settings");
    await page.getByRole("link", { name: "マイページに戻る" }).click();
    await expect(page).toHaveURL(/\/mypage$/);
  });

  // 2026-11-09 に運営から「出品管理の表示が見にくい。テキストの表記ずれがある」
  test("出品管理の行は、長い題名でも、題名に幅があり、数字・値段・ボタンが行の中で重ならない", async ({ page, context }) => {
    const seller = await freshUser("mob-items", { role: "seller" });
    const ids = [
      await seedListing(seller, { title: `E2E出品管理の長い題名${"い".repeat(28)}` }),
      await seedListing(seller, { title: `E2E下書き${tok()}`, status: "draft" }),
    ];
    try {
      await loginAs(context, seller);
      await page.goto("/mypage/items");
      const rows = page.locator(".my-item");
      await expect(rows).toHaveCount(2);
      const problems = await rows.evaluateAll((els) =>
        els.flatMap((row, i) => {
          const out: string[] = [];
          const r = row.getBoundingClientRect();
          const name = row.querySelector(".my-item-name")!.getBoundingClientRect();
          if (name.width < r.width * 0.4) out.push(`${i + 1}行目: 題名の幅が狭い（${Math.round(name.width)}px／行 ${Math.round(r.width)}px）`);
          /** 文字の箱（飾りの箱は含めない） */
          const textBoxes = (el: HTMLElement) => {
            const boxes: DOMRect[] = [];
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            for (let n = walker.nextNode(); n; n = walker.nextNode()) {
              if (!n.textContent?.trim()) continue;
              const range = document.createRange();
              range.selectNodeContents(n);
              boxes.push(...Array.from(range.getClientRects()).filter((b) => b.width > 0));
            }
            return boxes;
          };
          // 文字が何行に分かれているか。文字の箱だけを見て、縦に重ならない所で行を分ける
          // （余白で高さが変わっても、公開の札の丸い点のような飾りがあっても、数は変わらない）
          const lines = (el: HTMLElement) => {
            const boxes = textBoxes(el).sort((a, b) => a.top - b.top);
            let count = 0;
            let bottom = -Infinity;
            for (const b of boxes) {
              if (b.top >= bottom - 1) {
                count++;
                bottom = b.bottom;
              } else bottom = Math.max(bottom, b.bottom);
            }
            return count;
          };
          const parts = Array.from(row.querySelectorAll<HTMLElement>(".my-item-name, .my-item-meta > span, .my-item-price, .ia-btn"))
            .filter((el) => el.getClientRects().length > 0)
            .map((el) => ({ label: el.textContent?.trim() ?? "", b: el.getBoundingClientRect(), lines: lines(el), oneLine: !el.classList.contains("my-item-name") }));
          for (const p of parts) {
            if (p.b.left < r.left - 1 || p.b.right > r.right + 1) out.push(`${i + 1}行目:「${p.label}」が行からはみ出す`);
            // 数字・値段・ボタンは1行（文字の途中で折り返すと読みにくい）
            if (p.oneLine && p.lines > 1) out.push(`${i + 1}行目:「${p.label}」が ${p.lines} 行に折り返されている`);
          }
          // ボタンは、文字が真ん中にあり、字体が揃っている（リンクの「編集」だけ左に寄り、字体も違っていた）
          const buttons = Array.from(row.querySelectorAll<HTMLElement>(".ia-btn")).filter((el) => el.getClientRects().length > 0);
          for (const el of buttons) {
            const b = el.getBoundingClientRect();
            const t = textBoxes(el);
            const mid = (Math.min(...t.map((x) => x.left)) + Math.max(...t.map((x) => x.right))) / 2;
            if (Math.abs(mid - (b.left + b.right) / 2) > 3) out.push(`${i + 1}行目:「${el.textContent?.trim()}」の文字が真ん中にない`);
          }
          const fonts = new Set(buttons.map((el) => getComputedStyle(el).fontFamily));
          if (fonts.size > 1) out.push(`${i + 1}行目: ボタンの字体が揃っていない（${[...fonts].join(" ／ ")}）`);
          for (let a = 0; a < parts.length; a++)
            for (let c = a + 1; c < parts.length; c++) {
              const x = parts[a].b;
              const y = parts[c].b;
              const w = Math.min(x.right, y.right) - Math.max(x.left, y.left);
              const h = Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top);
              if (w > 1 && h > 1) out.push(`${i + 1}行目:「${parts[a].label}」と「${parts[c].label}」が重なる`);
            }
          return out;
        }),
      );
      expect(problems).toEqual([]);
    } finally {
      await setListingStatus(ids, "deleted");
    }
  });
  // 2026-11-27 の点検: 同意の行の状態文（右）が長いと縮まず、説明文の欄が1文字の幅に潰れて縦に何千 px も伸び、
  // 「取り消す」が画面の右の外に出て押せなかった（.setting-val が flex-shrink: 0）
  test("設定の行は、右の文が長くても説明の欄が潰れず、ボタンが画面の中に収まる", async ({ page, context }) => {
    const buyer = await freshUser("mob-row", { role: "buyer" });
    await sql(`update public.message_consents set version = 1 where user_id = ${lit(buyer.id)}`);
    const seller = await freshUser("mob-row", { role: "seller" });
    await seedBank(seller); // 口座があると /payout に「登録口座」の行が出る
    for (const [user, paths] of [
      [buyer, ["/settings"]],
      [seller, ["/settings", "/kyc", "/payout", "/mypage/profile"]],
    ] as const) {
      await loginAs(context, user);
      for (const path of paths) {
        await page.goto(path);
        const rows = page.locator(".setting-row");
        await expect(rows.first(), path).toBeVisible();
        const problems = await rows.evaluateAll((els) => {
          const vw = document.documentElement.clientWidth;
          const out: string[] = [];
          els.forEach((row, i) => {
            const rb = row.getBoundingClientRect();
            if (rb.width === 0) return;
            const name = row.querySelector(".setting-name")?.textContent?.trim() ?? `${i + 1}行目`;
            const info = row.querySelector(".setting-info");
            if (info) {
              const w = info.getBoundingClientRect().width;
              if (w < Math.min(160, rb.width * 0.5)) out.push(`「${name}」の説明の欄が ${Math.round(w)}px に潰れている`);
            }
            for (const b of Array.from(row.querySelectorAll("button, a"))) {
              const r = b.getBoundingClientRect();
              if (r.width === 0) continue;
              if (r.left < 0 || r.right > vw + 1) out.push(`「${name}」の「${b.textContent?.trim()}」が画面の外（${Math.round(r.left)}〜${Math.round(r.right)}px）`);
            }
          });
          return out;
        });
        expect(problems, path).toEqual([]);
        await expectNoOverflow(page, path);
      }
    }
  });

});

test.describe("貼り付く欄と入力欄", () => {
  /** 画面の4分の1より高いのに、position: sticky / fixed で画面に貼り付く物（スマホでは中身に重なって読めなくなる） */
  const tallStuck = (page: Page) =>
    page.evaluate(() => {
      const limit = window.innerHeight * 0.25;
      return Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .filter((el) => {
          const p = getComputedStyle(el).position;
          if (p !== "sticky" && p !== "fixed") return false;
          if (el.closest("header, dialog")) return false;
          return el.getBoundingClientRect().height > limit;
        })
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/).join(".")}`);
    });

  test("スマホでは、画面の4分の1より高い欄が上に貼り付いたまま中身に重ならない", async ({ page, context }) => {
    const seller = await freshUser("mob-stk", { role: "seller" });
    const id = await seedListing(seller, { title: `E2E貼り付き${tok()}` });
    try {
      for (const path of ["/items", "/tweets", `/items/${id}`, `/sellers/${seller.id}`]) {
        await page.goto(path);
        expect(await tallStuck(page), path).toEqual([]);
      }
      await loginAs(context, seller);
      for (const path of ["/mypage", "/settings", "/mypage/items", "/listings/new", "/timeline"]) {
        await page.goto(path);
        expect(await tallStuck(page), path).toEqual([]);
      }
    } finally {
      await setListingStatus([id], "deleted");
    }
  });

  /** 見えている入力欄のうち、文字が 16px より小さい物（iPhone の Safari は、押すと拡大して戻らない） */
  const smallInputs = (page: Page) =>
    page.evaluate(() => {
      const all = Array.from(document.querySelectorAll<HTMLElement>("input, textarea, select")).filter((el) => {
        const t = (el as HTMLInputElement).type;
        if (["checkbox", "radio", "hidden", "submit", "button", "file", "range", "color"].includes(t)) return false;
        return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
      });
      return {
        count: all.length,
        small: all
          .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
          .map((el) => `${el.tagName.toLowerCase()}[${el.getAttribute("name") ?? el.getAttribute("aria-label") ?? ""}] ${getComputedStyle(el).fontSize}`),
      };
    });

  test("入力欄の文字は 16px 以上で、iPhone で押しても画面が拡大されない", async ({ page, context }) => {
    for (const path of ["/auth", "/auth?tab=register", "/contact", "/items"]) {
      await page.goto(path);
      if (path === "/items") await page.getByRole("button", { name: /^絞り込み/ }).click();
      // 新規登録の1段目は役割を選ぶだけで文字の欄が無いので、2段目（メール・パスワード）まで進める
      if (path === "/auth?tab=register") {
        await page.locator("label.role-card", { hasText: "購入者" }).click();
        await page.getByRole("button", { name: "次へ進む →" }).click();
        await page.locator("#regEmail").waitFor();
      }
      const r = await smallInputs(page);
      expect(r.count, `${path} の入力欄の数`).toBeGreaterThan(0);
      expect(r.small, path).toEqual([]);
    }
    const seller = await freshUser("mob-inp", { role: "seller", kyc: "approved" });
    const buyer = await freshUser("mob-inp", { role: "buyer", kyc: "approved", messageConsent: true });
    const tid = await seedThread(seller, buyer);
    await loginAs(context, buyer);
    for (const path of ["/mypage/profile", "/settings", "/messages", `/messages/${tid}`]) {
      await page.goto(path);
      // 設定の欄（メール・パスワード・お届け先など）は「変更」「登録」を押すとその場に開くので、全部開いてから数える
      if (path === "/settings") {
        const closed = page.locator("button.setting-btn[aria-expanded='false']");
        while ((await closed.count()) > 0) await closed.first().click();
      }
      const r = await smallInputs(page);
      expect(r.count, `${path} の入力欄の数`).toBeGreaterThan(0);
      expect(r.small, path).toEqual([]);
    }
  });

  // 管理画面の入力欄の指定は 12〜13px（2026-11-10 の点検で指摘）。768px 以下は globals.css の指定で 16px になるが、
  // 大きい iPhone の横向き（814px）はその幅を超える
  test("管理画面の入力欄の文字も 16px 以上で、縦でも大きい iPhone の横向き（814px）でも、押して拡大されない", async ({ page, context }) => {
    const seller = await freshUser("mob-ainp", { role: "seller" });
    await asAdmin(context);
    for (const size of [page.viewportSize()!, { width: 814, height: 380 }]) {
      await page.setViewportSize(size);
      for (const path of ["/admin/users", `/admin/users/${seller.id}`, "/admin/items", "/admin/proxy", "/admin/settings"]) {
        await page.goto(path);
        const r = await smallInputs(page);
        expect(r.count, `${size.width}px ${path} の入力欄の数`).toBeGreaterThan(0);
        expect(r.small, `${size.width}px ${path}`).toEqual([]);
      }
    }
  });
});

test.describe("選ぶ欄と有料オプションの行", () => {
  // iPhone の Safari は、暗い地の色を付けても作りが明るいままだと選ぶ欄を白く塗り、白い文字の値が読めなくなる（2026-11-09 に写真で見つけた）
  test("管理の画面の選ぶ欄は暗い地の作りで出て、iPhone でも値が白く抜けない", async ({ page, context }) => {
    const seller = await freshUser("mob-sel", { role: "seller" });
    await asAdmin(context);
    for (const path of [`/admin/users/${seller.id}`, "/admin/proxy", "/admin/settings"]) {
      await page.goto(path);
      const r = await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll<HTMLSelectElement>("select")).filter((el) => el.getClientRects().length > 0);
        return {
          count: all.length,
          light: all.filter((el) => !getComputedStyle(el).colorScheme.includes("dark")).map((el) => el.id || el.name || el.getAttribute("aria-label") || ""),
        };
      });
      expect(r.count, `${path} の選ぶ欄の数`).toBeGreaterThan(0);
      expect(r.light, path).toEqual([]);
    }
  });

  test("有料オプションの行の「+¥」は1行に収まり、「+」と「¥」が2行に割れない", async ({ page, context }) => {
    const seller = await freshUser("mob-po", { role: "seller" });
    await loginAs(context, seller);
    await page.goto("/listings/new");
    await page.getByRole("group", { name: "有料オプションの候補" }).getByRole("button", { name: "＋ おもらし" }).click();
    const r = await page.locator(".lf-po-price > span").first().evaluate((el) => ({ h: el.getBoundingClientRect().height, fs: parseFloat(getComputedStyle(el).fontSize) }));
    expect(r.h, `「+¥」の高さ ${r.h}px（文字 ${r.fs}px）`).toBeLessThanOrEqual(r.fs * 1.6);
  });

  // 写真の下の「← → ×」の帯は高さが約21pxで、外す（×）が後ろへ（→）のすぐ隣にあり押し間違えやすかった（2026-11-09 の点検）。
  // 44px にする指定が 768px 以下だけで、スマホの横向き（812px など）では 21〜23px に戻っていた（2026-11-16 の点検）
  test("写真の「前へ」「後ろへ」「外す」のボタンは、スマホの縦でも横向き（812px）でも高さ44px以上ある", async ({ page, context }) => {
    const seller = await freshUser("mob-up", { role: "seller" });
    const paths = [0, 1].map(() => `${seller.id}/${randomUUID()}.webp`);
    await sql(`update public.profiles set photo_paths = array[${paths.map(lit).join(",")}] where id = ${lit(seller.id)}`);
    await loginAs(context, seller);
    for (const size of [page.viewportSize()!, { width: 812, height: 375 }]) {
      await page.setViewportSize(size);
      await page.goto("/mypage/profile");
      const field = page.locator(".mp-field", { hasText: "プロフィール写真" });
      await expect(field.getByRole("button", { name: "外す" })).toHaveCount(2);
      for (const name of ["前へ", "後ろへ", "外す"]) {
        const h = await field.getByRole("button", { name }).first().evaluate((el) => el.getBoundingClientRect().height);
        expect(h, `${size.width}px の「${name}」の高さ`).toBeGreaterThanOrEqual(44);
      }
    }
  });

  // 有料オプションを1つの文としてつないでいたので、スマホで名前の途中で行が変わっていた（2026-11-09 の点検）。
  // iPhone mini では値の欄が約180pxで「ストッキング同梱（+¥1,000）」が1行に入らないので、折れてよいのは名前と値段の間だけ
  test("商品のページの有料オプションの行は、名前も値段も途中で割れない", async ({ page }) => {
    const seller = await freshUser("mob-pol", { role: "seller" });
    const opts = [
      { id: "stk", name: "ストッキング同梱", price: 1000 },
      { id: "book", name: "着用写真集", price: 800 },
      { id: "omo", name: "おもらし", price: 500 },
      { id: "glv", name: "使用済みの手袋", price: 1500 },
    ];
    const id = await seedListing(seller, { set: `paid_options = ${lit(JSON.stringify(opts))}::jsonb` });
    try {
      await page.goto(`/items/${id}`);
      const value = page.locator(".detail-row", { hasText: "有料オプション" }).locator(".dv");
      await expect(value).toBeVisible();
      const items = opts.flatMap((o) => [o.name, `（+¥${o.price.toLocaleString("ja-JP")}）`]);
      const lines = await value.evaluate(linesOf, items);
      items.forEach((s, i) => expect(lines[i], `「${s}」の行の数`).toBe(1));
    } finally {
      await setListingStatus([id], "deleted");
    }
  });

  // 理由の窓のボタンは共通の .adm-btn のままで約39px、文も2文を1つの行にしていて語の途中で割れていた。
  // 見出しも「直し／ますか？」と割れた（2026-11-09 の点検。呼び名はそのときの長さに合わせる）
  test("管理者がプロフィールを直す理由の窓は、スマホでボタンが44px以上あり、見出しと文が語の途中で割れない", async ({ page, context }) => {
    const seller = await freshUser("mob-apf", { role: "seller", nickname: "みく1e16ac" });
    await asAdmin(context);
    await page.goto(`/admin/users/${seller.id}`);
    await page.getByRole("form", { name: "プロフィールの編集" }).getByRole("button", { name: "プロフィールを保存する" }).click();
    const dialog = page.getByRole("dialog", { name: /のプロフィールを直しますか？$/ });
    await expect(dialog).toBeVisible();
    for (const name of ["やめる", "直す"]) {
      const h = await dialog.getByRole("button", { name, exact: true }).evaluate((el) => el.getBoundingClientRect().height);
      expect(h, `「${name}」の高さ`).toBeGreaterThanOrEqual(44);
    }
    const sentences = ["本人の画面と公開のページにすぐ出ます。", "本人には知らせません。", "直した理由は操作の記録に残ります。"];
    const lines = await dialog.locator(".adm-pre").first().evaluate(linesOf, sentences);
    sentences.forEach((s, i) => expect(lines[i], `「${s}」の行の数`).toBe(1));
    // 名前は最大20字で1行に入らないことがあるので、折ってよいのは名前の側だけ
    const [head] = await dialog.getByRole("heading").evaluate(linesOf, ["プロフィールを直しますか？"]);
    expect(head, "見出しの「プロフィールを直しますか？」の行の数").toBe(1);
  });

  test("出品一覧の「出品日を変える」の窓は、スマホで横にはみ出さず、欄も窓の中に収まり、ボタンが44px以上ある", async ({ page, context }) => {
    const seller = await freshUser("mob-pubat", { role: "seller" });
    const title = `E2E出品日の窓${tok()}`;
    await seedListing(seller, { title });
    await asAdmin(context);
    await page.goto(`/admin/items?q=${encodeURIComponent(title)}`);
    await page.getByRole("row").filter({ hasText: title }).getByRole("button", { name: "出品日を変える", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "出品日を変える" });
    await expect(dialog).toBeVisible();
    const width = page.viewportSize()!.width;
    const box = (await dialog.boundingBox())!;
    expect(box.x, "窓の左").toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, "窓の右").toBeLessThanOrEqual(width + 1);
    const input = (await dialog.getByLabel("出品日（日本時間）").boundingBox())!;
    expect(input.x + input.width, "欄の右").toBeLessThanOrEqual(box.x + box.width + 1);
    for (const name of ["やめる", "変える"]) {
      const h = await dialog.getByRole("button", { name, exact: true }).evaluate((el) => el.getBoundingClientRect().height);
      expect(h, `「${name}」の高さ`).toBeGreaterThanOrEqual(44);
    }
    const o = await overflowOf(page);
    expect(o.scrollWidth, `窓を開いた画面が横にはみ出している: ${o.culprits.join(" / ")}`).toBeLessThanOrEqual(o.innerWidth + 1);
  });

  // 代理登録の人の「キャラにする」の窓は、注意の文が長い（2026-11-27 に足した）
  test("代理登録の人の「キャラにする」の窓は、スマホで横にはみ出さず、理由の欄も窓の中に収まり、ボタンが44px以上ある", async ({ page, context }) => {
    const adm = await asAdmin(context);
    const nickname = `E2E代理窓${tok()}`.slice(0, 20);
    const email = `e2e-proxy-mob-${Date.now().toString(36)}${tok()}@example.test`.toLowerCase();
    const { data, error } = await admin().auth.admin.createUser({ email, email_confirm: true, user_metadata: { nickname, role: "seller", age: "25" } });
    if (error || !data.user) throw new Error(`代理登録の人を作れませんでした: ${error?.message}`);
    const reg = await admin().rpc("admin_proxy_register", { p_admin: adm.id, p_user: data.user.id, p_note: "E2E のスマホの試験" });
    if (reg.error) throw new Error(`代理登録の印を付けられませんでした: ${reg.error.message}`);
    await page.goto(`/admin/users/${data.user.id}`);
    await page.getByRole("button", { name: "キャラにする", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: /をキャラにする$/ });
    await expect(dialog).toContainText(/本人から頼まれて代理で登録した人には、\s*使わないでください。/);
    // 本文は短く区切って行を分け、どの行も1行に収まる＝語の途中で割れない（2026-11-28 の点検で「アカウ／ント」「戻せ／ます。」と割れていた）
    const pre = dialog.locator(".adm-pre").first();
    const sentences = (await pre.textContent())!.split("\n").filter((s) => s.trim());
    const lines = await pre.evaluate(linesOf, sentences);
    const fit = await pre.evaluate((el) => `幅 ${el.clientWidth}px・字 ${getComputedStyle(el).fontSize}`);
    sentences.forEach((s, i) => expect(lines[i], `「${s}」の行の数（${fit}）`).toBe(1));
    const width = page.viewportSize()!.width;
    const box = (await dialog.boundingBox())!;
    expect(box.x, "窓の左").toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, "窓の右").toBeLessThanOrEqual(width + 1);
    const input = (await dialog.getByLabel(/^キャラにする理由/).boundingBox())!;
    expect(input.x + input.width, "理由の欄の右").toBeLessThanOrEqual(box.x + box.width + 1);
    for (const name of ["やめる", "キャラにする"]) {
      const h = await dialog.getByRole("button", { name, exact: true }).evaluate((el) => el.getBoundingClientRect().height);
      expect(h, `「${name}」の高さ`).toBeGreaterThanOrEqual(44);
    }
    const o = await overflowOf(page);
    expect(o.scrollWidth, `窓を開いた画面が横にはみ出している: ${o.culprits.join(" / ")}`).toBeLessThanOrEqual(o.innerWidth + 1);
    await dialog.getByRole("button", { name: "やめる", exact: true }).click();
  });

  // 改修 ㉘（2026-11-27）: «» を足すとボタンが9つ（32px）になり、375px を超える。
  // 2026-11-28: ボタンを44pxにすると7つ（約340px）も入らない（iPhone 12 mini の表の下は約253px）。スマホでは今のページの番号だけを残す（隣の番号は ‹ › と同じ）
  test("ページ送りは、スマホで今のページの番号だけを残して5つにし、どのボタンも44px四方以上で横にはみ出さない", async ({ page, context }) => {
    // 決まった対象 ID の記録を260件（50件ずつで6ページ）入れて、その ID で絞った3ページ目を見る
    const target = randomUUID();
    await sql(`
      insert into public.audit_logs (action, target_type, target_id, detail, created_at)
      select 'e2e.pager', 'e2e', ${lit(target)}, '{}'::jsonb, now() - interval '400 days' - make_interval(secs => g)
      from generate_series(1, 260) as g`);
    try {
      await asAdmin(context);
      await page.goto(`/admin/logs?q=${target}&page=3`);
      const nav = page.getByRole("navigation", { name: "ページ送り" });
      await expect(nav.getByRole("link", { name: "3", exact: true })).toHaveAttribute("aria-current", "page");
      // 1・2・4・5 は隠れ、« ‹ 3 › » の5つが見える
      for (const n of ["1", "2", "4", "5"]) await expect(nav.getByRole("link", { name: n, exact: true })).toBeHidden();
      await expect(nav.locator(".pg-btn:visible")).toHaveCount(5);
      for (const name of ["最初のページ", "前のページ", "次のページ", "最後のページ"]) await expect(nav.getByRole("link", { name })).toBeVisible();
      const width = page.viewportSize()!.width;
      const box = (await nav.boundingBox())!;
      expect(box.x, "ページ送りの左").toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, "ページ送りの右").toBeLessThanOrEqual(width + 1);
      // 2026-11-28 に決めた: スマホでは指で押せるよう、どのボタンも44px四方以上にする（32pxだった）
      const room = await nav.evaluate((el) => {
        const f = el.closest(".table-footer")!;
        const cs = getComputedStyle(f);
        return `表の下の中の幅 ${f.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)}px`;
      });
      for (const b of await nav.locator(".pg-btn:visible").all()) {
        const bb = (await b.boundingBox())!;
        const label = (await b.getAttribute("aria-label")) ?? (await b.textContent());
        expect(Math.min(bb.width, bb.height), `「${label}」の大きさ ${bb.width}×${bb.height}（${room}）`).toBeGreaterThanOrEqual(44);
        expect(bb.x + bb.width, `「${label}」の右（${room}）`).toBeLessThanOrEqual(width + 1);
      }
      const o = await overflowOf(page);
      expect(o.scrollWidth, `ログの画面が横にはみ出している: ${o.culprits.join(" / ")}`).toBeLessThanOrEqual(o.innerWidth + 1);
      // 320px の古い小さい機種でも、ボタンは横にはみ出さない（入らなければ折り返す）
      await page.setViewportSize({ width: 320, height: 640 });
      for (const b of await nav.locator(".pg-btn:visible").all()) {
        const bb = (await b.boundingBox())!;
        const label = (await b.getAttribute("aria-label")) ?? (await b.textContent());
        expect(bb.x, `320px で「${label}」の左`).toBeGreaterThanOrEqual(0);
        expect(bb.x + bb.width, `320px で「${label}」の右`).toBeLessThanOrEqual(321);
      }
    } finally {
      await sql(`delete from public.audit_logs where target_id = ${lit(target)}`);
    }
  });

  test("キャラの一覧の「キャラを新しく作る」の欄と、パスワードのリンクの窓は、スマホで横にはみ出さず、ボタンが44px以上ある", async ({ page, context }) => {
    const adm = await asAdmin(context);
    const name = `E2E窓${tok()}`.slice(0, 20);
    const email = `e2e-chara-mob-${Date.now().toString(36)}${tok()}@example.test`.toLowerCase();
    const { data, error } = await admin().auth.admin.createUser({ email, email_confirm: true, user_metadata: { nickname: name, role: "seller" } });
    if (error || !data.user) throw new Error(`キャラを作れませんでした: ${error?.message}`);
    const made = await admin().rpc("admin_create_character", { p_admin: adm.id, p_user: data.user.id, p_note: "" });
    if (made.error) throw new Error(`キャラの印を付けられませんでした: ${made.error.message}`);

    await expectNoOverflow(page, `/admin/characters?q=${encodeURIComponent(name)}`);
    const width = page.viewportSize()!.width;
    // 作成の欄は画面の中に収まる
    for (const label of [/^メールアドレス/, /^キャラの名前/, /^年齢/, /^運営のメモ/]) {
      const b = (await page.getByLabel(label).boundingBox())!;
      expect(b.x, `${label} の左`).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, `${label} の右`).toBeLessThanOrEqual(width + 1);
    }
    const save = await page.getByRole("button", { name: "キャラを作る", exact: true }).evaluate((el) => el.getBoundingClientRect().height);
    expect(save, "「キャラを作る」の高さ").toBeGreaterThanOrEqual(44);

    await page.getByRole("row").filter({ hasText: name }).getByRole("button", { name: "パスワードのリンク", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "作る", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "リンクを作りました" })).toBeVisible();
    const box = (await dialog.boundingBox())!;
    expect(box.x, "窓の左").toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, "窓の右").toBeLessThanOrEqual(width + 1);
    const link = (await dialog.getByLabel(/^パスワードを決めるリンク/).boundingBox())!;
    expect(link.x + link.width, "リンクの欄の右").toBeLessThanOrEqual(box.x + box.width + 1);
    for (const n of ["リンクをコピー", "閉じる"]) {
      const h = await dialog.getByRole("button", { name: n, exact: true }).evaluate((el) => el.getBoundingClientRect().height);
      expect(h, `「${n}」の高さ`).toBeGreaterThanOrEqual(44);
    }
    const o = await overflowOf(page);
    expect(o.scrollWidth, `窓を開いた画面が横にはみ出している: ${o.culprits.join(" / ")}`).toBeLessThanOrEqual(o.innerWidth + 1);
  });

  // 確認の窓はメールを <strong> で出す。長いメールは語の切れ目が無く、窓の中で横に流れて読めなかった（2026-11-24 のレビュー）
  test("キャラを作る確認の窓は、長いメールアドレスでも窓の中で折り返し、横に流れない", async ({ page, context }) => {
    await asAdmin(context);
    await page.goto("/admin/characters");
    // ハイフンがあるとそこで折り返せてしまうので、英数字だけの長いメールにする
    const email = `e2echaraconfirmverylongaddress${tok()}foriphonemini@example.test`;
    await page.getByLabel(/^メールアドレス/).fill(email);
    await page.getByLabel(/^キャラの名前/).fill("E2E長いメール");
    await page.getByRole("button", { name: "キャラを作る", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "キャラを作りますか？" });
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    const mail = (await dialog.getByText(email, { exact: true }).boundingBox())!;
    expect(mail.x + mail.width, "メールの右が窓の右を越えている").toBeLessThanOrEqual(box.x + box.width + 1);
    const inner = await dialog.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(inner.scroll, "窓の中が横に流れている").toBeLessThanOrEqual(inner.client + 1);
    await dialog.getByRole("button", { name: "やめる", exact: true }).click();
  });

  // 「対応できるオプション」の札のボタンは高さ36pxで、指で押しにくかった（2026-11-10 の点検）
  test("管理者のプロフィールの編集の「対応できるオプション」の札は、高さ44px以上ある", async ({ page, context }) => {
    const seller = await freshUser("mob-chip", { role: "seller" });
    await asAdmin(context);
    await page.goto(`/admin/users/${seller.id}`);
    const chips = page.getByRole("group", { name: "対応できるオプション" }).getByRole("button");
    await expect(chips.first()).toBeVisible();
    const hs = await chips.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
    hs.forEach((h, i) => expect(h, `${i + 1}つ目の札の高さ`).toBeGreaterThanOrEqual(44));
  });

  // パンくずの各項目が縮められて、「トッ／プ」「パン／ティ」と語の途中で割れていた（2026-11-10 の点検）。
  // 折れてよいのは項目の間と、長い題名・名前の中だけ
  test("商品と出品者のページのパンくずは、長い題名・名前でも、各項目が語の途中で割れない", async ({ page }) => {
    const seller = await freshUser("mob-bc", { role: "seller", nickname: `E2E${"あ".repeat(17)}` });
    const id = await seedListing(seller, { title: `E2Eパンくず${"い".repeat(30)}` });
    try {
      const cases: [string, string[]][] = [
        [`/items/${id}`, ["トップ", "商品一覧", "パンティ"]],
        [`/sellers/${seller.id}`, ["トップ", "女の子一覧"]],
      ];
      for (const [path, items] of cases) {
        await page.goto(path);
        const lines = await page.locator(".breadcrumb").evaluate(linesOf, items);
        items.forEach((s, i) => expect(lines[i], `${path} の「${s}」の行の数`).toBe(1));
      }
    } finally {
      await setListingStatus([id], "deleted");
    }
  });

  // 出品の編集画面のパンくずは折り返さない作りで、320px では4つの項目がどれも縮められて2行に割れていた（2026-11-16 の点検）
  test("出品と出品の編集の画面のパンくずは、320px でも各項目が語の途中で割れない", async ({ page, context }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const seller = await freshUser("mob-fbc", { role: "seller" });
    const id = await seedListing(seller);
    await loginAs(context, seller);
    try {
      const cases: [string, string[]][] = [
        [`/listings/${id}/edit`, ["トップ", "マイページ", "出品管理", "出品を編集する"]],
        ["/listings/new", ["トップ", "マイページ", "商品を出品する"]],
      ];
      for (const [path, items] of cases) {
        await page.goto(path);
        const lines = await page.locator(".breadcrumb").evaluate(linesOf, items);
        items.forEach((s, i) => expect(lines[i], `${path} の「${s}」の行の数`).toBe(1));
      }
    } finally {
      await setListingStatus([id], "deleted");
    }
  });
});

/** el の中の文字をつないだ文から、各 text が何行に渡って描かれているか（見つからなければ -1）。
    字の形の違い（和文と欧文）で同じ行でも上端がずれるので、行は縦の中心が文字の大きさの6割より離れたら別とみなす */
function linesOf(el: Element, texts: string[]): number[] {
  const segs: { n: Text; start: number }[] = [];
  let all = "";
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    segs.push({ n, start: all.length });
    all += n.data;
  }
  const at = (off: number): [Text, number] => {
    for (let i = segs.length - 1; i >= 0; i--) if (segs[i]!.start <= off) return [segs[i]!.n, off - segs[i]!.start];
    return [segs[0]!.n, 0];
  };
  const fs = parseFloat(getComputedStyle(el).fontSize);
  return texts.map((t) => {
    const a = all.indexOf(t);
    if (a < 0) return -1;
    const r = document.createRange();
    r.setStart(...at(a));
    r.setEnd(...at(a + t.length));
    const mids = Array.from(r.getClientRects()).filter((q) => q.width > 0).map((q) => (q.top + q.bottom) / 2).sort((x, y) => x - y);
    let count = mids.length > 0 ? 1 : 0;
    for (let i = 1; i < mids.length; i++) if (mids[i]! - mids[i - 1]! > fs * 0.6) count++;
    return count;
  });
}

/* 管理画面の表は .adm-scroll の中で横に動く。スマホでは右端の「操作」が画面の外にあって、横に送らないと押せなかった。
   行のボタンも高さ約25pxで押しにくく、保存ボタンの紫（#C455E8）と白い字の比は約3.6で足りなかった（2026-11-25 の点検） */
test.describe("管理画面の表と保存ボタン", () => {
  /** 表の右端の列: 中のボタンが画面の中に見え、列は表の見える幅の半分まで。表は横に動いたまま、貼り付いた列の地は透けない */
  async function expectLastColumnPinned(page: Page, row: Locator, label: string) {
    const width = page.viewportSize()!.width;
    const scroll = row.locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' adm-scroll ')][1]");
    const s = await scroll.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(s.scroll, `${label}: 表が横に動かなくなっている`).toBeGreaterThan(s.client);
    const cell = row.locator("td").last();
    const buttons = await cell.locator("a, button").all();
    expect(buttons.length, `${label}: 操作のボタンが無い`).toBeGreaterThan(0);
    for (const b of buttons) {
      const box = (await b.boundingBox())!;
      const name = (await b.innerText()).trim();
      expect(box.x, `${label}: 「${name}」の左`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${label}: 「${name}」が画面の右の外にある`).toBeLessThanOrEqual(width + 1);
    }
    const c = (await cell.boundingBox())!;
    expect(c.width, `${label}: 操作の列が表の見える幅の半分より広く、表の中身を隠している`).toBeLessThanOrEqual(s.client / 2);
    for (const [where, el] of [["行", cell], ["見出し", scroll.locator("thead th").last()]] as const) {
      const alpha = await el.evaluate((e) => {
        const m = getComputedStyle(e).backgroundColor.match(/[\d.]+/g)?.map(Number) ?? [];
        return m.length === 4 ? m[3]! : m.length === 3 ? 1 : 0;
      });
      expect(alpha, `${label}: 貼り付いた列の${where}の地が透けて、下を流れる列の字が重なって見える`).toBe(1);
    }
  }

  /** 白い字と地の色の比（WCAG）。地が透けているときは 0 を返す（下の色で変わるので、比が決まらない） */
  function contrastOf(el: Element): number {
    const cs = getComputedStyle(el);
    const rgb = (s: string) => s.match(/[\d.]+/g)?.map(Number) ?? [];
    const fg = rgb(cs.color);
    const bg = rgb(cs.backgroundColor);
    if (bg.length === 4 && bg[3]! < 1) return 0;
    const lum = (c: number[]) => {
      const [r, g, b] = c.slice(0, 3).map((v) => {
        const x = v / 255;
        return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  }

  test("出品一覧と利用者の一覧は、表が横に動いても、右端の「操作」のボタンが画面の中に見えている", async ({ page, context }) => {
    const seller = await freshUser("mob-tbl", { role: "seller", nickname: `表${tok()}`.slice(0, 20) });
    const title = `E2E操作の列${tok()}`;
    await seedListing(seller, { title });
    await asAdmin(context);
    await page.goto(`/admin/items?q=${encodeURIComponent(title)}`);
    await expectLastColumnPinned(page, page.getByRole("row").filter({ hasText: title }), "出品一覧");
    await page.goto(`/admin/users?q=${encodeURIComponent(seller.nickname)}`);
    await expectLastColumnPinned(page, page.getByRole("row").filter({ hasText: seller.nickname }), "利用者の一覧");
  });

  // 「メールの控え」の表は右端が「結果」で、操作のボタンが無い。貼り付けると結果の字が他の列に重なるだけなので、貼り付けない
  test("メールの控えの表は、右端の「結果」の列を貼り付けない", async ({ page, context }) => {
    const subject = `E2E控え${tok()}`;
    await sql(`insert into public.mail_outbox (to_address, kind, subject, body, mode, sent)
      values ('e2e-log@example.test', 'e2e', ${lit(subject)}, 'e2e', 'mock', true)`);
    await asAdmin(context);
    await page.goto("/admin/logs?tab=mail");
    const cell = page.getByRole("row").filter({ hasText: subject }).locator("td").last();
    expect(await cell.evaluate((e) => getComputedStyle(e).position)).not.toBe("sticky");
    expect(await page.locator("thead th").last().evaluate((e) => getComputedStyle(e).position)).not.toBe("sticky");
  });

  test("表の行の操作のボタンは、高さ44px以上ある", async ({ page, context }) => {
    const seller = await freshUser("mob-rowbtn", { role: "seller", nickname: `行${tok()}`.slice(0, 20) });
    const title = `E2E行のボタン${tok()}`;
    await seedListing(seller, { title });
    await asAdmin(context);
    for (const [path, text] of [
      [`/admin/items?q=${encodeURIComponent(title)}`, title],
      [`/admin/users?q=${encodeURIComponent(seller.nickname)}`, seller.nickname],
    ] as const) {
      await page.goto(path);
      const buttons = page.getByRole("row").filter({ hasText: text }).locator(".action-btn");
      await expect(buttons.first()).toBeVisible();
      for (const b of await buttons.all()) {
        const name = (await b.innerText()).trim();
        const h = await b.evaluate((el) => el.getBoundingClientRect().height);
        expect(h, `${path} の「${name}」の高さ`).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test("保存ボタンと、確認の窓の確定のボタンは、紫の地と白い字の比が4.5以上ある", async ({ page, context }) => {
    await asAdmin(context);
    await page.goto("/admin/characters");
    const save = page.getByRole("button", { name: "キャラを作る", exact: true });
    expect(await save.evaluate(contrastOf), "保存ボタン（.adm-save）の比").toBeGreaterThanOrEqual(4.5);
    await page.getByLabel(/^メールアドレス/).fill(`e2e-contrast-${tok()}@example.test`.toLowerCase());
    await page.getByLabel(/^キャラの名前/).fill("E2E色の比");
    await save.click();
    const dialog = page.getByRole("dialog", { name: "キャラを作りますか？" });
    await expect(dialog).toBeVisible();
    const ok = dialog.getByRole("button", { name: "作る", exact: true });
    expect(await ok.evaluate(contrastOf), "確定のボタン（.adm-btn.primary）の比").toBeGreaterThanOrEqual(4.5);
    await dialog.getByRole("button", { name: "やめる", exact: true }).click();
  });
});

test.describe("商品一覧の絞り込み", () => {
  test("スマホでは絞り込みが畳まれていて、「絞り込み」を押すとその場（検索の上）に開き、もう一度押すと畳まれる", async ({ page }) => {
    await page.goto("/items");
    const toggle = page.getByRole("button", { name: /^絞り込み/ });
    const price = page.getByLabel("価格の下限（円）");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(price).toBeHidden();
    // 畳んでいる間は、検索の欄が画面の上の方にある
    const search = page.getByRole("searchbox", { name: "キーワード" });
    expect((await search.boundingBox())!.y).toBeLessThan(page.viewportSize()!.height * 0.5);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(price).toBeVisible();
    // 重ねて出すのではなく、ページの流れの中に開く（検索の欄は、開いた絞り込みの下に下がる）
    const card = (await page.locator(".filter-card").boundingBox())!;
    expect((await search.boundingBox())!.y).toBeGreaterThanOrEqual(card.y + card.height - 1);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(price).toBeHidden();
  });

  test("絞り込み中は、畳んでいても「絞り込み」の横に、効いている条件の数が出る", async ({ page }) => {
    await page.goto("/items?price_min=2000");
    await expect(page.getByRole("button", { name: /^絞り込み/ })).toHaveText(/絞り込み.*1/);
  });
});
