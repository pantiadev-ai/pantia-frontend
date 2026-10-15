/* 担当 A: ログイン・ログアウト・新規登録とパスワード再設定の入力の誤り・ログインの保持。
   画面からログイン・ログアウトするのは、使い捨ての人（freshUser）だけ（cast の人のログインは、ほかの試験と分け合っているので切らない）。
   新規登録・再設定の申込みは、本物のメールが飛ぶので送らない（server action を止めて、0回であることも確かめる） */
import type { BrowserContext, Page } from "@playwright/test";
import { admin, cast, freshUser, loginAs, resetPassword, type Cast } from "./_db";
import { expect, test } from "./_fixtures";
import { RULES, prefillHits, setProfile, uniqueIp, watchActions } from "./_a";

const BAD_LOGIN = "メールアドレスかパスワードが違います。";

/** 画面のログイン（IP は試験ごとに別にして、ほかの試験と回数の枠を分ける） */
async function formLogin(page: Page, email: string, password: string, opts: { next?: string; keep?: boolean } = {}) {
  await page.goto(opts.next === undefined ? "/auth" : `/auth?next=${encodeURIComponent(opts.next)}`);
  await page.locator("#loginEmail").fill(email);
  await page.locator("#loginPw").fill(password);
  if (opts.keep) await page.getByText("ログインしたままにする").click();
  await page.getByRole("button", { name: "🔑 ログイン" }).click();
}

async function readyUser(prefix: string, page: Page): Promise<{ user: Cast; pw: string }> {
  await page.setExtraHTTPHeaders({ "x-vercel-forwarded-for": uniqueIp() });
  const user = await freshUser(prefix, { role: "buyer" });
  return { user, pw: await resetPassword(user) };
}

const authCookies = async (context: BrowserContext) => (await context.cookies()).filter((c) => /^sb-.*auth-token/.test(c.name));

test.describe("ログイン", () => {
  test("?next= を付けてログインすると、その画面に戻る", async ({ page, context }) => {
    const { user, pw } = await readyUser("auth-next", page);
    await formLogin(page, user.email, pw, { next: "/settings" });
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.locator("nav.pt-nav")).toContainText(`${user.nickname}さん`);
    expect((await authCookies(context)).length).toBeGreaterThan(0);
  });

  test("パスワードが違っても、登録の無いメールでも、同じ文の誤りが出る（登録の有無が分からない）", async ({ page }) => {
    const { user } = await readyUser("auth-bad", page);
    await formLogin(page, user.email, "Wrong-password-123");
    await expect(page.locator("p.pt-msg.error")).toHaveText(BAD_LOGIN);
    await expect(page).toHaveURL(/\/auth/);
    await formLogin(page, `e2e-nobody-${Date.now()}@example.test`, "Wrong-password-123");
    await expect(page.locator("p.pt-msg.error")).toHaveText(BAD_LOGIN);
  });

  test("空のまま押すと、メールとパスワードの欄に入力の誤りが出て、送られない", async ({ page }) => {
    await page.goto("/auth");
    const actions = await watchActions(page, { block: true });
    await page.getByRole("button", { name: "🔑 ログイン" }).click();
    await expect(page.locator("#loginEmailErr")).toHaveClass(/show/);
    await expect(page.locator("#loginPwErr")).toHaveClass(/show/);
    expect(actions.count()).toBe(0);
  });

  test("同じメールで10回を超えて試すと、正しいパスワードでも回数の上限で止まる", async ({ page }) => {
    const { user, pw } = await readyUser("auth-limit", page);
    // 15分に10回まで。先に9回分を入れておき、10回目（違うパスワード）は通常の誤り、11回目は止まるのを見る
    await prefillHits(RULES.loginEmail, "email", user.email, 9);
    await formLogin(page, user.email, "Wrong-password-123");
    await expect(page.locator("p.pt-msg.error")).toHaveText(BAD_LOGIN);
    await formLogin(page, user.email, pw);
    await expect(page.locator("p.pt-msg.error")).toContainText("短い時間に操作が続いています");
    await expect(page).toHaveURL(/\/auth/);
  });

  for (const evil of ["//evil.example", "https://evil.example/x", "/\\evil.example", "/%5Cevil.example"]) {
    test(`?next=${evil} でログインしても、よそのサイトへは行かずトップに戻る`, async ({ page }) => {
      const { user, pw } = await readyUser("auth-open", page);
      await formLogin(page, user.email, pw, { next: evil });
      await expect(page).toHaveURL("http://localhost:3100/");
    });
  }

  test("停止中の人がログインすると、停止の案内のページへ回される", async ({ page }) => {
    const { user, pw } = await readyUser("auth-susp", page);
    await setProfile(user, { status: "suspended" });
    await formLogin(page, user.email, pw, { next: "/mypage" });
    await expect(page).toHaveURL(/\/auth\/suspended$/);
    await expect(page.getByRole("heading", { name: "利用を停止しています" })).toBeVisible();
    // 停止中は、ほかの画面も開けない
    await page.goto("/mypage");
    await expect(page).toHaveURL(/\/auth\/suspended$/);
  });

  test("ログイン中に /auth を開くと、?next= の行き先（無ければトップ）へ回される", async ({ page, context }) => {
    await loginAs(context, await cast("buyer"));
    await page.goto("/auth");
    await expect(page).toHaveURL("http://localhost:3100/");
    await page.goto("/auth?next=/settings");
    await expect(page).toHaveURL(/\/settings$/);
    await page.goto(`/auth?next=${encodeURIComponent("//evil.example")}`);
    await expect(page).toHaveURL("http://localhost:3100/");
  });
});

test.describe("ログインの保持", () => {
  test("「ログインしたままにする」を外してログインすると、ブラウザを閉じたら消えるクッキーになる", async ({ page, context }) => {
    const { user, pw } = await readyUser("auth-keep0", page);
    await formLogin(page, user.email, pw, { next: "/mypage" });
    await expect(page).toHaveURL(/\/mypage$/);
    const sb = await authCookies(context);
    expect(sb.length).toBeGreaterThan(0);
    for (const c of sb) expect(c.expires, c.name).toBe(-1);
    const keep = (await context.cookies()).find((c) => c.name === "pt_keep");
    expect(keep?.value).toBe("0");
    expect(keep?.httpOnly).toBe(true);
    // 画面を移っても（トークンの読み直しがあっても）期限は付かない
    await page.goto("/settings");
    for (const c of await authCookies(context)) expect(c.expires, c.name).toBe(-1);
  });

  test("「ログインしたままにする」に印を付けてログインすると、期限の長いクッキーになる", async ({ page, context }) => {
    const { user, pw } = await readyUser("auth-keep1", page);
    await formLogin(page, user.email, pw, { next: "/mypage", keep: true });
    await expect(page).toHaveURL(/\/mypage$/);
    const sb = await authCookies(context);
    expect(sb.length).toBeGreaterThan(0);
    const day = Date.now() / 1000 + 86400;
    for (const c of sb) expect(c.expires, c.name).toBeGreaterThan(day);
    expect((await context.cookies()).find((c) => c.name === "pt_keep")).toBeUndefined();
  });
});

test.describe("ログアウト", () => {
  test("ヘッダーのログアウトを押すと、トップに戻り、マイページはログインへ回される", async ({ page, context }) => {
    const user = await freshUser("auth-out", { role: "buyer" });
    await loginAs(context, user);
    await page.goto("/mypage");
    await expect(page).toHaveURL(/\/mypage$/);
    await page.locator('form[action="/auth/signout"]').getByRole("button", { name: "ログアウト" }).click();
    await expect(page).toHaveURL("http://localhost:3100/");
    await expect(page.locator("nav.pt-nav").getByRole("link", { name: "ログイン" })).toBeVisible();
    expect(await authCookies(context)).toEqual([]);
    await page.goto("/mypage");
    await expect(page).toHaveURL(/\/auth\?next=%2Fmypage/);
  });

  test("ログイン中に、GET や、よそのサイトからの POST でログアウトを呼んでも、断られてログインは続く", async ({ page, context }) => {
    const user = await freshUser("auth-so", { role: "buyer" });
    await loginAs(context, user);
    // context.request は、この画面と同じクッキーで送る
    const get = await context.request.get("/auth/signout", { maxRedirects: 0 });
    expect(get.status()).toBe(405);
    const cross = await context.request.post("/auth/signout", { headers: { origin: "https://evil.example" }, maxRedirects: 0 });
    expect(cross.status()).toBe(403);
    await page.goto("/mypage");
    await expect(page).toHaveURL(/\/mypage$/);
  });
});

test.describe("新規登録（入力の誤りまで。送らない）", () => {
  test("役割を選ばずに次へ進むと、選ぶように誤りが出る", async ({ page }) => {
    await page.goto("/auth?tab=register");
    const actions = await watchActions(page, { block: true });
    await page.getByRole("button", { name: "次へ進む →" }).click();
    await expect(page.getByText("出品者か購入者のどちらかを選んでください")).toBeVisible();
    expect(actions.count()).toBe(0);
  });

  test("誤った値で登録を押すと、メール・パスワード・確認・同意の欄に誤りが出て、送られない", async ({ page }) => {
    await page.goto("/auth?tab=register");
    const actions = await watchActions(page, { block: true });
    await page.locator("label.role-card", { hasText: "購入者" }).click();
    await page.getByRole("button", { name: "次へ進む →" }).click();
    await page.locator("#regEmail").fill("not-an-email");
    await page.locator("#regPw").fill("short");
    await expect(page.locator("#pwStrength")).toHaveClass(/ng/);
    await page.locator("#regPwConf").fill("different1");
    await page.locator("#regNick").fill("E2E登録");
    await page.getByRole("button", { name: "🎀 登録する" }).click();
    await expect(page.locator("#regEmailErr")).toHaveClass(/show/);
    await expect(page.locator("#regPwConfErr")).toHaveClass(/show/);
    await expect(page.getByText("3つすべてにチェックを入れてください")).toBeVisible();
    expect(actions.count()).toBe(0);
  });

  test("18歳未満の年齢を入れると、年齢の欄に誤りが出て、送られない", async ({ page }) => {
    await page.goto("/auth?tab=register");
    const actions = await watchActions(page, { block: true });
    await page.locator("label.role-card", { hasText: "出品者" }).click();
    await page.getByRole("button", { name: "次へ進む →" }).click();
    await page.locator("#regAge").fill("17");
    // ほかの欄も誤ったままにして、万一でも送られない形にしておく
    await page.locator("#regEmail").fill("bad");
    await page.getByRole("button", { name: "🎀 登録する" }).click();
    await expect(page.locator("#regAgeHint")).toHaveClass(/ng/);
    expect(actions.count()).toBe(0);
  });
});

test.describe("パスワードの再設定", () => {
  test("再設定のメールの欄が空・形が違うと、誤りが出て、送られない", async ({ page }) => {
    await page.goto("/auth/reset");
    const actions = await watchActions(page, { block: true });
    await page.getByRole("button", { name: "📩 再設定のメールを送る" }).click();
    await expect(page.locator("#resetEmailErr")).toHaveClass(/show/);
    await page.locator("#resetEmail").fill("ab");
    await page.getByRole("button", { name: "📩 再設定のメールを送る" }).click();
    await expect(page.locator("#resetEmailErr")).toHaveClass(/show/);
    expect(actions.count()).toBe(0);
  });

  test("ログインしていない人が新しいパスワードの画面を開くと、再設定の申込みの画面へ回される", async ({ page }) => {
    await page.goto("/auth/update-password");
    await expect(page).toHaveURL(/\/auth\/reset$/);
  });

  test("ログインしていても、再設定のメールのリンクを通っていなければ、パスワードは変えられない（案内だけ）", async ({ page, context }) => {
    const user = await freshUser("auth-upd-ng", { role: "buyer" });
    await loginAs(context, user);
    await page.goto("/auth/update-password");
    await expect(page.getByText("このページは、パスワードの再設定のメールのリンクから開いてください。", { exact: false })).toBeVisible();
    await expect(page.locator("#newPw")).toHaveCount(0);
    // 札を手で作っても（署名が合わないので）通らない
    const forged = `${user.id}.${Math.floor(Date.now() / 1000) + 600}.${"A".repeat(43)}`;
    await context.addCookies([{ name: "pt_pw_reset", value: forged, domain: "localhost", path: "/auth" }]);
    await page.reload();
    await expect(page.locator("#newPw")).toHaveCount(0);
  });

  test("新しいパスワードの画面で、弱い・確認と違うと誤りが出て、正しく入れると変わり、ほかの端末は切れる", async ({ page }) => {
    const user = await freshUser("auth-upd", { role: "buyer" });
    // 本物の再設定のリンクから入る（メールは送らずに、管理の API でリンクの中身だけ作る）
    const { data, error } = await admin().auth.admin.generateLink({ type: "recovery", email: user.email });
    expect(error).toBeNull();
    const hash = data.properties?.hashed_token ?? "";
    await page.goto(`/auth/callback?token_hash=${hash}&type=recovery&next=${encodeURIComponent("/auth/update-password")}`);
    await expect(page).toHaveURL(/\/auth\/update-password$/);
    await page.locator("#newPw").fill("short");
    await expect(page.locator("#newPwHint")).toHaveClass(/ng/);
    const strong = `E2e${Date.now().toString(36)}x9`;
    await page.locator("#newPw").fill(strong);
    await page.locator("#newPwConf").fill(`${strong}zz`);
    await page.getByRole("button", { name: "🔒 パスワードを変更する" }).click();
    await expect(page.locator("#newPwConfErr")).toHaveClass(/show/);

    await page.locator("#newPwConf").fill(strong);
    await page.getByRole("button", { name: "🔒 パスワードを変更する" }).click();
    await expect(page.getByText("パスワードを変更しました。ほかの端末からはログアウトしています。")).toBeVisible();
    await page.getByRole("link", { name: "マイページへ →" }).click();
    await expect(page).toHaveURL(/\/mypage$/);
    // 札は一度きり。もう一度開いても、フォームは出ない
    await page.goto("/auth/update-password");
    await expect(page.locator("#newPw")).toHaveCount(0);
  });
});
