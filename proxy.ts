/* すべての要求の前に通る所（Next.js 16 で middleware から proxy に名前が変わった。Node.js で動く）。
   1. Supabase のセッションを新しくする（クッキーの書き直し）
   2. ログインが要るページに、ログインなしで来たら /auth へ
   3. CSP（まず report-only。28 §B9）と、ほかのセキュリティ見出し

   ここでの確認は「入口の振り分け」だけ。権限の本当の確認は、各ページ・server action・RLS が受け持つ（28 §B1）。
   ログインなしで通すパスは最小にする（28 §B4）。一覧に無いパスは、ログインが要る側に倒す。 */
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { KEEP_COOKIE, sessionCookieOptions } from "@/lib/session-cookie";

/** ログインなしで見られるページ。前方一致は必ず「/」で区切る（"/items" だと "/itemsx" まで公開になる） */
const PUBLIC_EXACT = new Set([
  "/",
  "/auth",
  "/auth/reset",
  "/auth/update-password",
  "/auth/suspended",
  "/contact",
  "/items",
  "/sellers",
  "/ranking",
  "/tweets",
  "/terms",
  "/privacy",
  "/legal",
  "/help",
  "/robots.txt",
  "/sitemap.xml",
]);
const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const PUBLIC_PATTERNS = [
  new RegExp(`^/items/${UUID}$`),
  new RegExp(`^/sellers/${UUID}$`),
  new RegExp(`^/tweets/${UUID}$`),
  // メールのリンクの戻り先（確認・再設定）。中で code を Supabase に照合する
  /^\/auth\/callback$/,
  // webhook と cron は、ログインではなく署名・秘密で確かめる（route の中で。未設定なら拒否）
  /^\/api\/webhooks\/(stripe|paypay|kyc)$/,
  /^\/api\/cron\/[a-z-]+$/,
];

function isPublic(pathname: string): boolean {
  return PUBLIC_EXACT.has(pathname) || PUBLIC_PATTERNS.some((re) => re.test(pathname));
}

function buildCsp(nonce: string, supabaseUrl: string, dev: boolean): string {
  const supabase = new URL(supabaseUrl);
  const ws = `wss://${supabase.host}`;
  return [
    `default-src 'self'`,
    // Next のハイドレーション用のインラインスクリプトは nonce と strict-dynamic で許す。next dev は eval を使う
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""} https://js.stripe.com`,
    // 見本の CSS と React の style 属性のため、style はインラインを許す
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: ${supabase.origin}`,
    `font-src 'self'`,
    `connect-src 'self' ${supabase.origin} ${ws}${dev ? " ws: http://localhost:*" : ""} https://api.stripe.com`,
    `frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self' https://checkout.stripe.com`,
    `object-src 'none'`,
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    // 設定が無いまま動かさない（28 §C5）
    return new NextResponse("サーバーの設定が足りません。", { status: 503 });
  }

  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const csp = buildCsp(nonce, supabaseUrl, process.env.NODE_ENV === "development");
  // CSP は report-only で出す。本番で違反0件を数えてから enforce に替える（28 §B9。手順は SECURITY.md の 9）
  const cspHeader = process.env.CSP_ENFORCE === "1" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // 要求の側に CSP を載せると、Next.js が自分の <script> に nonce を付ける（report-only の名前では付かない）
  requestHeaders.set("content-security-policy", csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders } });
        const ephemeral = request.cookies.get(KEEP_COOKIE)?.value === "0";
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, sessionCookieOptions(options, ephemeral)));
      },
    },
  });

  // getUser は Supabase に問い合わせてトークンを確かめる（getSession はクッキーを信じるだけなので使わない）
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;
  if (!user && !isPublic(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/auth";
    url.search = "";
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  response.headers.set(cspHeader, csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=(), payment=(self)");
  if (process.env.VERCEL_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  return response;
}

export const config = {
  /* 静的な物（_next/static・_next/image・favicon・public 直下の1階層の画像）を除く全部に通す。
     「末尾が .png なら全部除外」にすると、保護ページの URL の末尾を .png にするだけで素通りできるので、
     除外は public 直下の1階層だけに絞る（hudousan-tool の proxy.ts と同じ考え）。 */
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|[^/\\\\%]+\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
