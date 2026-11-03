/* どの試験にも付く見張り: ブラウザのエラー（画面の例外・console.error・CSP の違反）が出たら落とす。
   わざと失敗させる試験は consoleAllow に、許す文の形を足す */
import { test as base, expect } from "@playwright/test";

type Fixtures = { consoleAllow: RegExp[]; browserErrors: string[] };

export const test = base.extend<Fixtures>({
  consoleAllow: [[], { option: true }],
  browserErrors: [
    async ({ context, page, consoleAllow }, use) => {
      const errors: string[] = [];
      // 見張るだけ（Report-Only）の CSP の違反は console に出ないので、securitypolicyviolation を拾う
      await context.exposeBinding("__e2eCspViolation", (_source, v: string) => {
        if (consoleAllow.some((re) => re.test(v))) return;
        errors.push(`CSP の違反: ${v}`);
      });
      await context.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (e) => {
          const report = (window as unknown as { __e2eCspViolation?: (v: string) => void }).__e2eCspViolation;
          report?.(`${e.violatedDirective} ${e.blockedURI || "inline"}（${location.pathname}）`);
        });
      });
      page.on("pageerror", (e) => {
        // Safari（WebKit）は、画面を移るときに打ち切った読み込み（先読みの ?_rsc= も、画面の URL そのままも）をこの文で出す（画面の不具合ではない）。
        // 除くのは試験用サーバー自身（localhost:3100）の URL だけ。ほかの宛先は今までどおり落とす
        if (/localhost:3100\/\S* due to access control checks\.?$/.test(e.message)) return;
        errors.push(`画面の例外: ${e.message}`);
      });
      page.on("console", (m) => {
        if (m.type() !== "error") return;
        const text = m.text();
        const url = m.location()?.url ?? "";
        // 試験用の画像（1×1）は置き場に無いことがある
        if (/\/storage\/v1\/object\//.test(url)) return;
        // Safari（WebKit）は、見張るだけの CSP に報告先が無いと毎回これを出す（画面の不具合ではない）
        if (/was delivered in report-only mode, but does not specify a 'report-to'/.test(text)) return;
        // メッセージの画面を開いてすぐ移ると、つなぎかけのリアルタイム（Supabase）を画面が自分で閉じ、Safari がこれを出す（画面の不具合ではない）。
        // 「つなげなかった」側の誤り（handshake の失敗など）は今までどおり落とす
        if (/^WebSocket connection to 'wss:\/\/[a-z0-9]+\.supabase\.co\/realtime\/v1\/websocket\?[^']*' failed: WebSocket is closed before the connection is established\.$/.test(text)) return;
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
