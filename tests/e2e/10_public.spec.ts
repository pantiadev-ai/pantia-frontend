/* 担当 A: 公開の画面（トップ・商品の検索・出品者・ランキング・つぶやき・静的ページ・お問い合わせ・robots・sitemap）。
   ほかの人の物が混ざるので、件数・並びは「自分で作った、乱数入りの名前の物」だけで確かめる */
import { freshUser, lit, seedListing, sql, type Cast } from "./_db";
import { expect, test } from "./_fixtures";
import { RULES, anonClient, bulkListings, hidePosts, prefillHits, seedPost, setListingStatus, setProfile, tok, uniqueIp } from "./_a";

/** 公開している（本人確認済みの）出品者を、乱数入りの名前で作る */
async function publicSeller(prefix: string): Promise<Cast> {
  return freshUser(prefix, { role: "seller", nickname: `E2E公開${tok()}` });
}

/** /items の検索欄に入れて「検索」を押す */
async function searchItems(page: import("@playwright/test").Page, q: string) {
  await page.getByRole("searchbox", { name: "キーワード" }).fill(q);
  await page.locator("button.search-btn").click();
}

const itemNames = (page: import("@playwright/test").Page) => page.locator("a.item-name");

test.describe("トップページ", () => {
  test("新しく出品・つぶやきをすると、トップの新着と、みんなのつぶやきに出る", async ({ page }) => {
    const seller = await publicSeller("pub-top");
    const t = tok();
    const title = `E2Eトップ${t}`;
    const id = await seedListing(seller, { title, set: "published_at = now() + interval '2 minutes'" });
    const postId = await seedPost(seller, `E2Eトップのつぶやき ${t}`, { createdAt: "now() + interval '2 minutes'" });
    try {
      const res = await page.goto("/");
      expect(res?.status()).toBe(200);
      await expect(page.locator("a.item-title", { hasText: title })).toBeVisible();
      await expect(page.getByText(`E2Eトップのつぶやき ${t}`)).toBeVisible();
      // 数字の帯は DB の値（読めないと「-」になる）
      await expect(page.locator(".stat-item", { hasText: "公開中の商品" }).locator(".stat-num")).not.toHaveText("-");
      await expect(page.locator(".stat-item", { hasText: "登録出品者" }).locator(".stat-num")).not.toHaveText("-");
    } finally {
      await setListingStatus([id], "deleted");
      await hidePosts([postId]);
    }
  });
});

test.describe("商品の検索（/items）", () => {
  test("題名や説明の言葉で検索すると、その商品だけが出る", async ({ page }) => {
    const seller = await publicSeller("pub-q");
    const t = tok();
    const a = await seedListing(seller, { title: `E2E題名${t}` });
    const b = await seedListing(seller, { title: `E2E説明だけ ${tok()}`, description: `説明の中にだけ ${t}x を書きました。` });
    try {
      await page.goto("/items");
      await searchItems(page, t);
      await expect(page).toHaveURL(new RegExp(`[?&]q=${t}`));
      await expect(page.locator(".result-count")).toContainText("2 件の商品");
      await expect(itemNames(page).filter({ hasText: `E2E題名${t}` })).toHaveCount(1);
      await expect(itemNames(page).filter({ hasText: "E2E説明だけ" })).toHaveCount(1);

      await searchItems(page, `${t}x`);
      await expect(page.locator(".result-count")).toContainText("1 件の商品");
      await expect(itemNames(page)).toHaveText([/E2E説明だけ/]);

      await searchItems(page, `${t}zz`);
      await expect(page.getByText("検索結果が見つかりませんでした")).toBeVisible();
    } finally {
      await setListingStatus([a, b], "deleted");
    }
  });

  test("カテゴリの札を押すと、そのカテゴリの商品だけになる", async ({ page }) => {
    const seller = await publicSeller("pub-cat");
    const t = tok();
    const ids = await bulkListings(seller, (i) => `E2E分類${t} ${["panty", "bra", "set"][i]}`, 3, {
      category: (i) => ["panty", "bra", "set"][i]!,
    });
    try {
      await page.goto(`/items?q=${t}`);
      await expect(page.locator(".result-count")).toContainText("3 件の商品");
      await page.locator("label.fchip", { hasText: "ブラジャー" }).click();
      await expect(page).toHaveURL(/categories=bra/);
      await expect(page).toHaveURL(new RegExp(`q=${t}`));
      await expect(page.locator(".result-count")).toContainText("1 件の商品");
      await expect(itemNames(page)).toHaveText([`E2E分類${t} bra`]);
    } finally {
      await setListingStatus(ids, "deleted");
    }
  });

  test("価格の下限と上限を入れて絞り込むと、その間の商品だけになる", async ({ page }) => {
    const seller = await publicSeller("pub-price");
    const t = tok();
    const prices = [1000, 5000, 9000];
    const ids = await bulkListings(seller, (i) => `E2E価格${t} ${prices[i]}`, 3, { price: (i) => prices[i]! });
    try {
      await page.goto(`/items?q=${t}`);
      await expect(page.locator(".result-count")).toContainText("3 件の商品");
      await page.getByLabel("価格の下限（円）").fill("2000");
      await page.getByLabel("価格の上限（円）").fill("8000");
      await page.locator("button.cat-apply").click();
      await expect(page).toHaveURL(/price_min=2000/);
      await expect(page.locator(".result-count")).toContainText("1 件の商品");
      await expect(itemNames(page)).toHaveText([`E2E価格${t} 5000`]);
    } finally {
      await setListingStatus(ids, "deleted");
    }
  });

  test("並び替えで安い順・高い順を選ぶと、価格の順に並ぶ", async ({ page }) => {
    const seller = await publicSeller("pub-sort");
    const t = tok();
    const prices = [5000, 1000, 9000];
    const ids = await bulkListings(seller, (i) => `E2E並び${t} ${prices[i]}`, 3, { price: (i) => prices[i]! });
    try {
      await page.goto(`/items?q=${t}`);
      await page.getByLabel("並び替え").selectOption("price_asc");
      await expect(page).toHaveURL(/sort=price_asc/);
      await expect(itemNames(page)).toHaveText([`E2E並び${t} 1000`, `E2E並び${t} 5000`, `E2E並び${t} 9000`]);
      await page.getByLabel("並び替え").selectOption("price_desc");
      await expect(page).toHaveURL(/sort=price_desc/);
      await expect(itemNames(page)).toHaveText([`E2E並び${t} 9000`, `E2E並び${t} 5000`, `E2E並び${t} 1000`]);
      // 新着順（既定）は、あとから公開した物が先
      await page.getByLabel("並び替え").selectOption("new");
      // 既定の並びは URL から sort が外れる
      await expect(page).not.toHaveURL(/sort=/);
      await expect(itemNames(page)).toHaveText([`E2E並び${t} 9000`, `E2E並び${t} 1000`, `E2E並び${t} 5000`]);
    } finally {
      await setListingStatus(ids, "deleted");
    }
  });

  test("30件を検索すると、1ページ目は24件で、次のページに残りの6件が出る", async ({ page }) => {
    const seller = await publicSeller("pub-page");
    const t = tok();
    const ids = await bulkListings(seller, (i) => `E2E頁${t} ${String(i).padStart(2, "0")}`, 30, {
      publishedAt: "now() - interval '1 day'",
    });
    try {
      await page.goto(`/items?q=${t}`);
      await expect(page.locator(".result-count")).toContainText("30 件の商品");
      await expect(itemNames(page)).toHaveCount(24);
      const first = await itemNames(page).allTextContents();
      await page.getByRole("link", { name: "次のページ" }).click();
      await expect(page).toHaveURL(/page=2/);
      await expect(itemNames(page)).toHaveCount(6);
      const second = await itemNames(page).allTextContents();
      // 1ページ目と2ページ目に同じ物が出ない・合わせて30件
      expect(new Set([...first, ...second]).size).toBe(30);
      await page.getByRole("link", { name: "前のページ" }).click();
      await expect(itemNames(page)).toHaveCount(24);
    } finally {
      await setListingStatus(ids, "deleted");
    }
  });

  test("記号（% _ , ( ) \" ' \\）で検索しても、画面が壊れずに結果が出る", async ({ page }) => {
    await page.goto("/items");
    for (const q of ["%", "_", ",", "(", ")", '"', "'", "\\", `%_,()"'\\ 検索`, "a,b.c:d(e)"]) {
      await searchItems(page, q);
      // 件数か「見つかりませんでした」のどちらかが出れば、画面は壊れていない
      await expect(page.locator(".result-count").or(page.getByText("検索結果が見つかりませんでした")), q).toBeVisible();
      await expect(page.getByText("商品を読み込めませんでした")).toHaveCount(0);
    }
  });

  test("記号を含む題名を、その記号のまま検索すると見つかる", async ({ page }) => {
    const seller = await publicSeller("pub-sym");
    const t = tok();
    const title = `E2E記号${t} 50%_OFF(黒)`;
    const id = await seedListing(seller, { title });
    try {
      await page.goto("/items");
      await searchItems(page, `${t} 50%_OFF(黒)`);
      await expect(itemNames(page).filter({ hasText: title })).toHaveCount(1);
    } finally {
      await setListingStatus([id], "deleted");
    }
  });
});

test.describe("出してはいけない商品", () => {
  test.use({ consoleAllow: [/status of 404/] });

  test("下書き・非公開・運営の非表示は一覧に出ず詳細は404、売り切れは一覧に出ず詳細は売り切れと出る", async ({ page }) => {
    const seller = await publicSeller("pub-hide");
    const t = tok();
    const ids: Record<string, string> = {};
    for (const status of ["published", "draft", "private", "hidden", "sold"] as const) {
      ids[status] = await seedListing(seller, { title: `E2E状態${t} ${status}`, status });
    }
    try {
      await page.goto(`/items?q=${t}`);
      await expect(page.locator(".result-count")).toContainText("1 件の商品");
      await expect(itemNames(page)).toHaveText([`E2E状態${t} published`]);

      for (const status of ["draft", "private", "hidden"]) {
        const res = await page.goto(`/items/${ids[status]}`);
        expect(res?.status(), status).toBe(404);
        await expect(page.getByRole("heading", { name: "ページが見つかりません" })).toBeVisible();
      }
      const sold = await page.goto(`/items/${ids.sold}`);
      expect(sold?.status()).toBe(200);
      await expect(page.getByText("この商品は売り切れました。")).toBeVisible();

      // ログインしていない人の Supabase でも、下書き・非公開・非表示は読めない（RLS）
      const { data, error } = await anonClient()
        .from("listings")
        .select("id")
        .in("id", [ids.draft!, ids.private!, ids.hidden!]);
      expect(error).toBeNull();
      expect(data ?? []).toEqual([]);
    } finally {
      await setListingStatus(Object.values(ids), "deleted");
    }
  });

  test("フォロワー限定の商品は、ログインしていない人の一覧と sitemap に出ない", async ({ page, request }) => {
    const seller = await publicSeller("pub-fol");
    const t = tok();
    const id = await seedListing(seller, { title: `E2E限定${t}`, set: "followers_only = true" });
    try {
      await page.goto(`/items?q=${t}`);
      await expect(page.getByText("検索結果が見つかりませんでした")).toBeVisible();
      const xml = await (await request.get("/sitemap.xml")).text();
      expect(xml).not.toContain(`/items/${id}`);
    } finally {
      await setListingStatus([id], "deleted");
    }
  });
});

test.describe("止まった出品者は出さない", () => {
  test.use({ consoleAllow: [/status of 404/] });

  const STATES: { name: string; set: Record<string, string> }[] = [
    { name: "停止", set: { status: "suspended" } },
    { name: "退会", set: { status: "withdrawn" } },
    { name: "本人確認の審査中", set: { kyc_status: "pending" } },
  ];
  for (const s of STATES) {
    test(`出品者が${s.name}になると、出品者のページ・商品・つぶやき・検索・sitemap から消える`, async ({ page, request }) => {
      const seller = await publicSeller("pub-st");
      const t = tok();
      const id = await seedListing(seller, { title: `E2E止め${t}` });
      const postId = await seedPost(seller, `E2E止めのつぶやき ${t}`);
      try {
        // 前: 出ている
        expect((await page.goto(`/sellers/${seller.id}?tab=items`))?.status()).toBe(200);
        await expect(page.getByText(seller.nickname).first()).toBeVisible();
        await expect(page.getByRole("tabpanel").getByText(`E2E止め${t}`)).toBeVisible();
        expect(await (await request.get("/sitemap.xml")).text()).toContain(`/sellers/${seller.id}`);

        await setProfile(seller, s.set);

        expect((await page.goto(`/sellers/${seller.id}`))?.status()).toBe(404);
        expect((await page.goto(`/items/${id}`))?.status()).toBe(404);
        await page.goto(`/items?q=${t}`);
        await expect(page.getByText("検索結果が見つかりませんでした")).toBeVisible();
        await page.goto(`/sellers?q=${encodeURIComponent(seller.nickname)}`);
        await expect(page.getByText("その名前の女の子は見つかりませんでした")).toBeVisible();
        await page.goto(`/tweets?q=${t}`);
        await expect(page.locator("article.tweet-card")).toHaveCount(0);
        const xml = await (await request.get("/sitemap.xml")).text();
        expect(xml).not.toContain(`/sellers/${seller.id}`);
        expect(xml).not.toContain(`/items/${id}`);
      } finally {
        await setListingStatus([id], "deleted");
        await hidePosts([postId]);
      }
    });
  }
});

test.describe("出品者・ランキング・つぶやき", () => {
  test("出品者の名前で探すと一覧に出て、押すとその人のページに商品とつぶやきが出る", async ({ page }) => {
    const seller = await publicSeller("pub-sel");
    const t = tok();
    const id = await seedListing(seller, { title: `E2E出品者の商品${t}` });
    const postId = await seedPost(seller, `E2E出品者のつぶやき ${t}`);
    try {
      await page.goto("/sellers");
      await page.getByRole("searchbox", { name: "女の子の名前で検索" }).fill(seller.nickname);
      await page.getByRole("searchbox", { name: "女の子の名前で検索" }).press("Enter");
      await expect(page).toHaveURL(/\/sellers\?q=/);
      await expect(page.getByText("1 人の女の子")).toBeVisible();
      await page.locator("a.cat-seller-name", { hasText: seller.nickname }).click();
      await expect(page).toHaveURL(`/sellers/${seller.id}`);
      // 出品とつぶやきは、それぞれのタブを押すと出る
      await page.getByRole("tab", { name: /^出品中/ }).click();
      await expect(page.getByRole("tabpanel").getByText(`E2E出品者の商品${t}`)).toBeVisible();
      await page.getByRole("tab", { name: /つぶやき/ }).click();
      await expect(page.getByRole("tabpanel").getByText(`E2E出品者のつぶやき ${t}`)).toBeVisible();
    } finally {
      await setListingStatus([id], "deleted");
      await hidePosts([postId]);
    }
  });

  test("% や _ を入れて出品者を探しても、全員が出たりエラーになったりしない", async ({ page }) => {
    for (const q of ["%", "_", "%_%", '",()']) {
      const res = await page.goto(`/sellers?q=${encodeURIComponent(q)}`);
      expect(res?.status(), q).toBe(200);
      await expect(page.getByText("その名前の女の子は見つかりませんでした")).toBeVisible();
    }
  });

  test("トップの検索欄（商品・出品者を検索）に出品者の名前を入れると、その出品者の商品が出る", async ({ page }) => {
    const seller = await publicSeller("pub-hdr");
    const id = await seedListing(seller, { title: `E2Eヘッダー${tok()}` });
    try {
      await page.goto("/");
      const box = page.getByRole("searchbox", { name: "商品・出品者を検索" });
      await box.fill(seller.nickname);
      await box.press("Enter");
      await expect(page).toHaveURL(/\/items\?/);
      await expect(itemNames(page).filter({ hasText: "E2Eヘッダー" })).toHaveCount(1);
    } finally {
      await setListingStatus([id], "deleted");
    }
  });

  test("今週お気に入りが付いた商品は、商品のランキングに出る", async ({ page }) => {
    const seller = await publicSeller("pub-rank");
    const title = `E2Eランク${tok()}`;
    const id = await seedListing(seller, { title });
    const buyers: Cast[] = [];
    try {
      // 50位の点を見て、それを抜く数だけお気に入りを付ける（同点はこれまでのお気に入りの数で並ぶので、それを大きくする）
      const { data } = await anonClient().rpc("weekly_ranking", { p_kind: "listings", p_limit: 50 });
      const rows = (data ?? []) as { score: number }[];
      const need = rows.length >= 50 ? Number(rows[rows.length - 1]!.score) : 0;
      test.skip(need > 6, `50位の点が高すぎて、試験で抜けない（${need}点）`);
      for (let i = 0; i < need; i++) buyers.push(await freshUser("pub-rank-b", { role: "buyer" }));
      if (buyers.length) await sql(`insert into public.favorites (user_id, listing_id) values ${buyers.map((b) => `(${lit(b.id)}, ${lit(id)})`).join(",")}`);
      await sql(`update public.listings set like_count = 1000000 where id = ${lit(id)}`);

      await page.goto("/ranking");
      await page.locator("a.cat-tab", { hasText: "商品" }).click();
      await expect(page).toHaveURL(/tab=listings/);
      const row = page.locator("a.cat-rank-title", { hasText: title });
      await expect(row).toHaveAttribute("href", `/items/${id}`);
    } finally {
      if (buyers.length) await sql(`delete from public.favorites where listing_id = ${lit(id)}`);
      await setListingStatus([id], "deleted");
    }
  });

  test("出品者のランキングには、公開している出品者だけが DB と同じ数だけ並ぶ", async ({ page }) => {
    await page.goto("/ranking");
    const links = page.locator("a.cat-rank-title");
    const { data } = await anonClient().rpc("weekly_ranking", { p_kind: "sellers", p_limit: 50 });
    const expected = ((data ?? []) as unknown[]).length;
    await expect(links).toHaveCount(expected);
    const ids = (await links.evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href") ?? ""))).map((h) =>
      h.replace("/sellers/", ""),
    );
    if (ids.length > 0) {
      const ok = await sql<{ n: number }>(`
        select count(*)::int as n from public.profiles
        where id in (${ids.map(lit).join(",")}) and role = 'seller' and status = 'active' and kyc_status = 'approved'`);
      expect(ok[0]!.n).toBe(ids.length);
    }
  });

  test("つぶやきを本文の言葉やタグで絞ると、そのつぶやきだけが出る", async ({ page }) => {
    const seller = await publicSeller("pub-tw");
    const t = tok();
    const p1 = await seedPost(seller, `E2Eつぶやき本文 ${t} #e2e${t}`);
    const p2 = await seedPost(seller, `E2Eつぶやき別 ${t}`);
    try {
      await page.goto("/tweets");
      await page.getByRole("searchbox", { name: "つぶやきを検索" }).fill(t);
      await page.getByRole("searchbox", { name: "つぶやきを検索" }).press("Enter");
      await expect(page.getByText(`「${t}」を含むつぶやき`)).toBeVisible();
      await expect(page.locator("article.tweet-card")).toHaveCount(2);
      await page.goto(`/tweets?tag=e2e${t}`);
      await expect(page.getByText(`#e2e${t} のつぶやき`)).toBeVisible();
      await expect(page.locator("article.tweet-card")).toHaveCount(1);
      await expect(page.locator("article.tweet-card")).toContainText(`E2Eつぶやき本文 ${t}`);
    } finally {
      await hidePosts([p1, p2]);
    }
  });
});

test.describe("静的なページ", () => {
  const PAGES = [
    { path: "/help", h1: "ヘルプ" },
    { path: "/terms", h1: "利用規約" },
    { path: "/privacy", h1: "プライバシーポリシー" },
    { path: "/legal", h1: "特定商取引法に基づく表記" },
    { path: "/contact", h1: "お問い合わせ" },
  ];
  for (const p of PAGES) {
    test(`${p.path} を開くと、見出しと題名が出る`, async ({ page }) => {
      const res = await page.goto(p.path);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: new RegExp(p.h1) })).toBeVisible();
      await expect(page).toHaveTitle(`${p.h1} - パンティア`);
    });
  }

  test("特商法のページを開くと、手数料・支払い方法が DB の設定から出る", async ({ page }) => {
    await page.goto("/legal");
    await expect(page.getByText(/サービス手数料 \d+(\.\d)?%/)).toBeVisible();
    await expect(page.locator("tr", { hasText: "支払い方法" })).toBeVisible();
  });
});

test.describe("お問い合わせ（/contact）", () => {
  test("何も入れずに送ると、3つの欄に入力の誤りが出る", async ({ page }) => {
    await page.goto("/contact");
    await page.locator("#cEmail").fill("");
    await page.getByRole("button", { name: "📩 送信する" }).click();
    await expect(page.getByText("種類を選んでください")).toBeVisible();
    await expect(page.getByText("メールアドレスを入力してください")).toBeVisible();
    await expect(page.getByText("内容を入力してください")).toBeVisible();
  });

  test("正しく送ると受け付けられてメールの記録が残り、上限を超えると止まる", async ({ page }) => {
    const ip = uniqueIp();
    await page.setExtraHTTPHeaders({ "x-vercel-forwarded-for": ip });
    // 上限は1時間に5回。先に4回分を入れておき、5回目が通り6回目で止まるのを見る
    await prefillHits(RULES.contactIp, "ip", ip, 4);
    const t = tok();
    await page.goto("/contact");
    await page.locator("#cType").selectOption("bug");
    await page.locator("#cEmail").fill(`e2e-contact-${t}@example.test`);
    await page.locator("#cBody").fill(`E2E のお問い合わせです ${t}`);
    await expect(page.locator("#cBodyCount")).toContainText(`${`E2E のお問い合わせです ${t}`.length} / 2000`);
    await page.getByRole("button", { name: "📩 送信する" }).click();
    await expect(page.getByText("お問い合わせを受け付けました。")).toBeVisible();

    const mails = await sql<{ kind: string; subject: string; sent: boolean | null }>(`
      select kind, subject, sent from public.mail_outbox where body like ${lit(`%${t}%`)}`);
    expect(mails).toHaveLength(1);
    expect(mails[0]!.kind).toBe("contact");
    expect(mails[0]!.subject).toContain("お問い合わせ");

    await page.locator("#cType").selectOption("other");
    await page.locator("#cBody").fill(`E2E の2回目 ${t}`);
    await page.getByRole("button", { name: "📩 送信する" }).click();
    await expect(page.getByText(/短い時間に操作が続いています/)).toBeVisible();
    const after = await sql<{ n: number }>(`select count(*)::int as n from public.mail_outbox where body like ${lit(`%${t}%`)}`);
    expect(after[0]!.n).toBe(1);
  });

  test("見えない欄（ウェブサイト）に入れて送ると、受け付けたように見せてメールは出さない", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-vercel-forwarded-for": uniqueIp() });
    const t = tok();
    await page.goto("/contact");
    await page.locator("#cType").selectOption("other");
    await page.locator("#cEmail").fill(`e2e-bot-${t}@example.test`);
    await page.locator("#cBody").fill(`E2E のロボット ${t}`);
    await page.locator("#cWebsite").fill("https://spam.example", { force: true });
    await page.getByRole("button", { name: "📩 送信する" }).click();
    await expect(page.getByText("お問い合わせを受け付けました。")).toBeVisible();
    const n = await sql<{ n: number }>(`select count(*)::int as n from public.mail_outbox where body like ${lit(`%${t}%`)}`);
    expect(n[0]!.n).toBe(0);
  });
});

test.describe("robots.txt と sitemap.xml", () => {
  test("robots.txt は、ログインが要る場所を全部、検索に出さない", async ({ request }) => {
    const txt = await (await request.get("/robots.txt")).text();
    const disallow = txt
      .split(/\r?\n/)
      .filter((l) => /^disallow:/i.test(l))
      .map((l) => l.replace(/^disallow:\s*/i, "").trim());
    for (const p of ["/admin", "/mypage", "/messages", "/settings", "/kyc", "/checkout", "/cart", "/orders", "/api/", "/listings/", "/payout", "/notifications", "/timeline"]) {
      expect(disallow, p).toContain(p);
    }
    expect(txt).toMatch(/Sitemap: .*\/sitemap\.xml/);
  });

  test("sitemap.xml には、公開中の商品と公開している出品者だけが入る", async ({ request }) => {
    const seller = await publicSeller("pub-map");
    const hidden = await freshUser("pub-map-k", { role: "seller", kyc: "pending" });
    const buyer = await freshUser("pub-map-b", { role: "buyer" });
    const t = tok();
    const pub = await seedListing(seller, { title: `E2E地図${t} 公開` });
    const draft = await seedListing(seller, { title: `E2E地図${t} 下書き`, status: "draft" });
    const priv = await seedListing(seller, { title: `E2E地図${t} 非公開`, status: "private" });
    try {
      const res = await request.get("/sitemap.xml");
      expect(res.status()).toBe(200);
      const xml = await res.text();
      expect(xml).toContain(`/items/${pub}`);
      expect(xml).toContain(`/sellers/${seller.id}`);
      expect(xml).not.toContain(`/items/${draft}`);
      expect(xml).not.toContain(`/items/${priv}`);
      expect(xml).not.toContain(`/sellers/${hidden.id}`);
      expect(xml).not.toContain(`/sellers/${buyer.id}`);
      // ログインが要る場所の URL は入らない
      expect(xml).not.toMatch(/\/(mypage|settings|admin|messages|orders|cart|checkout|kyc)\b/);
    } finally {
      await setListingStatus([pub, draft, priv], "deleted");
    }
  });
});

