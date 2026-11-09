/* 担当 A: スマホ（Pixel 7 の 412px と iPhone 12 mini の 375px）での見た目。
   主な画面が横にはみ出さないこと・右上の「☰ メニュー」から主な画面へ行けること・
   貼り付く欄が中身に重ならないこと・入力欄で iPhone が拡大しないこと（2026-11-03 に運営から指摘） */
import type { Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { freshUser, lit, loginAs, seedListing, sql, type Cast } from "./_db";
import { expect, test } from "./_fixtures";
import { clippedItems, overflowOf, setListingStatus, tok } from "./_a";
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

  // 写真の下の「← → ×」の帯は高さが約21pxで、外す（×）が後ろへ（→）のすぐ隣にあり押し間違えやすかった（2026-11-09 の点検）
  test("写真の「前へ」「後ろへ」「外す」のボタンは、スマホで高さ44px以上ある", async ({ page, context }) => {
    const seller = await freshUser("mob-up", { role: "seller" });
    const paths = [0, 1].map(() => `${seller.id}/${randomUUID()}.webp`);
    await sql(`update public.profiles set photo_paths = array[${paths.map(lit).join(",")}] where id = ${lit(seller.id)}`);
    await loginAs(context, seller);
    await page.goto("/mypage/profile");
    const field = page.locator(".mp-field", { hasText: "プロフィール写真" });
    await expect(field.getByRole("button", { name: "外す" })).toHaveCount(2);
    for (const name of ["前へ", "後ろへ", "外す"]) {
      const h = await field.getByRole("button", { name }).first().evaluate((el) => el.getBoundingClientRect().height);
      expect(h, `「${name}」の高さ`).toBeGreaterThanOrEqual(44);
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
