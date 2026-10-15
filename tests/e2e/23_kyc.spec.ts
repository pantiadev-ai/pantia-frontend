/* 本人確認の提出（担当 B）。KYC_MODE=manual（写真を送って運営が見る）。承認・却下の操作は担当 D。
   本人確認の状態を変えるので、必ず使い捨ての利用者で行う。 */
import type { Page } from "@playwright/test";
import { freshUser, lit, loginAs, sql, userClient, type Cast } from "./_db";
import { e2eEnv } from "./_env";
import { formAlert, jpegWithExif, pngImage } from "./_b";
import { expect, test } from "./_fixtures";

/** 書類の種類・生年月日・同意を入れる */
async function fillBasics(page: Page, birth: string, doc: "license" | "mynumber" | "passport" = "license") {
  await page.getByLabel("書類の種類").selectOption(doc);
  await page.getByLabel("生年月日").fill(birth);
  await page.getByRole("checkbox", { name: /プライバシーポリシー/ }).check();
}

async function choosePhotos(page: Page) {
  await page.getByLabel("書類の表").setInputFiles({ name: "front.jpg", mimeType: "image/jpeg", buffer: await jpegWithExif() });
  await page.getByLabel("本人と書類").setInputFiles({ name: "selfie.png", mimeType: "image/png", buffer: await pngImage("#c9f") });
}

async function applications(user: Cast) {
  return sql<{ status: string; provider: string; doc_type: string; document_paths: string[] }>(
    `select status, provider, doc_type, document_paths from public.kyc_applications where user_id = ${lit(user.id)}`,
  );
}

async function kycStatus(user: Cast): Promise<string> {
  const [r] = await sql<{ kyc_status: string }>(`select kyc_status from public.profiles where id = ${lit(user.id)}`);
  return r.kyc_status;
}

/** 今日から years 年前の日（YYYY-MM-DD） */
function yearsAgo(years: number, plusDays = 0): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() + plusDays);
  return d.toISOString().slice(0, 10);
}

test.describe("本人確認の提出", () => {
  test("書類と写真を出すと審査中になり、提出し直せず、書類の写真は外から見られない", async ({ page, context, request }) => {
    const seller = await freshUser("b-sel", { role: "seller", kyc: "unsubmitted" });
    await loginAs(context, seller);
    await page.goto("/kyc");
    await expect(page.getByText("📄 未提出")).toBeVisible();
    await fillBasics(page, "1990-01-01");
    await choosePhotos(page);
    await page.getByRole("button", { name: "提出する" }).click();

    await expect(page.getByText("⏳ 審査中")).toBeVisible();
    await expect(page.getByText(/審査中は、提出し直すことはできません。/)).toBeVisible();
    await expect(page.getByRole("button", { name: "提出する" })).toHaveCount(0);

    const [app] = await applications(seller);
    expect(app.status).toBe("pending");
    expect(app.provider).toBe("manual");
    expect(app.doc_type).toBe("license");
    expect(app.document_paths).toHaveLength(2);
    for (const p of app.document_paths) expect(p).toMatch(new RegExp(`^${seller.id}/[0-9a-f-]{36}\\.webp$`));
    expect(await kycStatus(seller)).toBe("pending");

    // 公開の URL では取れない
    for (const p of app.document_paths) {
      const res = await request.get(`${e2eEnv().url}/storage/v1/object/public/kyc-documents/${p}`);
      expect(res.status()).not.toBe(200);
    }
    // 本人のログインでも、書類の置き場・置き場所の列は読めない
    const db = await userClient(seller);
    const dl = await db.storage.from("kyc-documents").download(app.document_paths[0]);
    expect(dl.error).not.toBeNull();
    const signed = await db.storage.from("kyc-documents").createSignedUrl(app.document_paths[0], 60);
    expect(signed.error).not.toBeNull();
    const { error: colErr } = await db.from("kyc_applications").select("document_paths").eq("user_id", seller.id);
    expect(colErr).not.toBeNull();
    // 直に2件目の申請を作ることもできない
    const { error: insErr } = await db.from("kyc_applications").insert({ user_id: seller.id, provider: "manual", doc_type: "license" });
    expect(insErr).not.toBeNull();
    expect(await applications(seller)).toHaveLength(1);
  });

  test("生年月日が18歳未満だと、誤りが出て提出されない", async ({ page, context }) => {
    const buyer = await freshUser("b-buy", { role: "buyer", kyc: "unsubmitted" });
    await loginAs(context, buyer);
    await page.goto("/kyc");
    await fillBasics(page, yearsAgo(18, 5));
    await choosePhotos(page);
    await page.getByRole("button", { name: "提出する" }).click();
    await expect(formAlert(page)).toHaveText("18歳未満の方はご利用いただけません。");
    expect(await applications(buyer)).toHaveLength(0);
    expect(await kycStatus(buyer)).toBe("unsubmitted");
  });

  test("必須の写真を選ばないと、提出のボタンが押せない", async ({ page, context }) => {
    const buyer = await freshUser("b-buy", { role: "buyer", kyc: "unsubmitted" });
    await loginAs(context, buyer);
    await page.goto("/kyc");
    await fillBasics(page, "1990-01-01");
    const submit = page.getByRole("button", { name: "提出する" });
    await expect(submit).toBeDisabled();
    await page.getByLabel("書類の表").setInputFiles({ name: "front.png", mimeType: "image/png", buffer: await pngImage() });
    await expect(submit).toBeDisabled();
    await page.getByLabel("本人と書類").setInputFiles({ name: "selfie.png", mimeType: "image/png", buffer: await pngImage("#0c9") });
    await expect(submit).toBeEnabled();
  });

  test("マイナンバーカードを選ぶと、裏の写真の欄が消えて注意が出る", async ({ page, context }) => {
    const buyer = await freshUser("b-buy", { role: "buyer", kyc: "unsubmitted" });
    await loginAs(context, buyer);
    await page.goto("/kyc");
    await page.getByLabel("書類の種類").selectOption("license");
    await expect(page.getByLabel("書類の裏")).toHaveCount(1);
    await page.getByLabel("書類の種類").selectOption("mynumber");
    await expect(page.getByLabel("書類の裏")).toHaveCount(0);
    await expect(page.getByText(/裏面（12桁の個人番号がある面）は撮らない・送らないでください。/)).toBeVisible();
  });
});

test.describe("却下のあと", () => {
  async function rejected(resubmit: boolean): Promise<Cast> {
    const user = await freshUser("b-sel", { role: "seller", kyc: "rejected" });
    await sql(`
      insert into public.kyc_applications (user_id, provider, doc_type, status, reject_reason, resubmit_allowed, decided_at)
      values (${lit(user.id)}, 'manual', 'license', 'rejected', 'E2E 書類がぼやけています', ${resubmit}, now())`);
    return user;
  }

  test("再提出できる却下なら、理由と提出のフォームが出る", async ({ page, context }) => {
    const user = await rejected(true);
    await loginAs(context, user);
    await page.goto("/kyc");
    await expect(page.getByText("⚠️ 再提出が必要")).toBeVisible();
    await expect(page.getByText("確認できませんでした。理由: E2E 書類がぼやけています")).toBeVisible();
    await expect(page.getByRole("button", { name: "提出する" })).toBeVisible();
  });

  test("再提出を受け付けない却下なら、提出のフォームが出ない", async ({ page, context }) => {
    const user = await rejected(false);
    await loginAs(context, user);
    await page.goto("/kyc");
    await expect(page.getByText(/この申請は再提出を受け付けていません。/)).toBeVisible();
    await expect(page.getByRole("button", { name: "提出する" })).toHaveCount(0);
  });
});
