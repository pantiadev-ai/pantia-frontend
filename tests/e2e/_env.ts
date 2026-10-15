/* E2E が使う値。検証用の Supabase でだけ動く（本番の ref なら、何も書き込む前に止める） */
const PRODUCTION_REFS = new Set(["swqrhatsooeqoqfzugaj"]);

function need(name: string): string {
  const v = (process.env[name] ?? "").trim();
  if (!v) throw new Error(`E2E: 環境変数 ${name} がありません（playwright.config.ts の頭を参照）`);
  return v;
}

export type E2eEnv = {
  url: string;
  ref: string;
  anonKey: string;
  serviceKey: string;
  accessToken: string;
  cronSecret: string;
};

let cached: E2eEnv | null = null;

export function e2eEnv(): E2eEnv {
  if (cached) return cached;
  const url = need("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
  const ref = (process.env.TEST_PROJECT_REF ?? process.env.PENTEST_REF ?? "").trim();
  const m = url.match(/^https:\/\/([a-z]{20})\.supabase\.co$/);
  if (!m || !/^[a-z]{20}$/.test(ref) || m[1] !== ref || PRODUCTION_REFS.has(ref)) {
    throw new Error("E2E: NEXT_PUBLIC_SUPABASE_URL が検証用の ref（TEST_PROJECT_REF）と一致しません。本番には流しません。");
  }
  cached = {
    url,
    ref,
    anonKey: need("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceKey: need("SUPABASE_SERVICE_ROLE_KEY"),
    accessToken: need("SUPABASE_ACCESS_TOKEN"),
    cronSecret: need("CRON_SECRET"),
  };
  return cached;
}
