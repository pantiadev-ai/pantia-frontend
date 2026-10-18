/* E2E（画面を通した試験）。検証用の Supabase に流す（本番の ref だと tests/e2e/_env.ts で止まる）。
   使い方（README の「E2E」を参照）:
     1. 検証用の Supabase に migration を流す
     2. 検証用の値で .env を用意して npm run build
     3. SUPABASE_ACCESS_TOKEN・TEST_PROJECT_REF も入れて npx playwright test
   サーバーは next start（:3100）を使う。決済・メールは mock、本人確認は manual で動かす。 */
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  // 同じ人・同じ設定を使う試験があるので、1本ずつ順に流す
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "pc", use: { ...devices["Desktop Chrome"] }, testIgnore: /\.mobile\.spec\.ts$/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /\.mobile\.spec\.ts$/ },
  ],
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}/robots.txt`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
