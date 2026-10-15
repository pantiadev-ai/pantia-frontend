/* どの試験にも付く見張り: ブラウザのエラー（画面の例外・console.error・CSP の違反）が出たら落とす。
   わざと失敗させる試験は consoleAllow に、許す文の形を足す */
import { test as base, expect } from "@playwright/test";

type Fixtures = { consoleAllow: RegExp[]; browserErrors: string[] };

export const test = base.extend<Fixtures>({
  consoleAllow: [[], { option: true }],
  browserErrors: [
    async ({ page, consoleAllow }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(`画面の例外: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() !== "error") return;
        const text = m.text();
        const url = m.location()?.url ?? "";
        // 試験用の画像（1×1）は置き場に無いことがある
        if (/\/storage\/v1\/object\//.test(url)) return;
        if (consoleAllow.some((re) => re.test(text) || re.test(url))) return;
        errors.push(`console.error: ${text}${url ? `（${url}）` : ""}`);
      });
      await use(errors);
      expect(errors, "ブラウザにエラーが出ていない").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
