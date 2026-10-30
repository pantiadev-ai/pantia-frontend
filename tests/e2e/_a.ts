/* 担当 A（公開の画面・ログイン・設定・プロフィール・スマホ）の下ごしらえ。
   ・名前に入れる乱数は16進だけ（検索の safeSearch が外す記号を含めない）
   ・回数の上限は、台帳（rate_limit_hits）に先に数を入れておき、少ない操作で上限の手前まで進める
   ・画像は sharp でその場で作る（ファイルを置かない） */
import { randomBytes } from "node:crypto";
import type { BrowserContext, Locator, Page } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { RULES, bucketKey, type LimitRule } from "../../lib/rate-limit-rules";
import { admin, lit, resetPassword, seedImage, sql, type Cast } from "./_db";
import { e2eEnv } from "./_env";

export { RULES };

/** 名前に入れる乱数（16進。検索で外される記号を含まない） */
export const tok = (bytes = 4): string => randomBytes(bytes).toString("hex");

/** 回数の上限の枠を、ほかの試験と分けるための IP（100.64.0.0/10 の中で乱数） */
export function uniqueIp(): string {
  const b = randomBytes(3);
  return `100.${64 + (b[0]! % 64)}.${b[1]}.${b[2]}`;
}

/** 回数の台帳に、今の窓（と、境目をまたいだときの次の窓）の数を先に入れる */
export async function prefillHits(rule: LimitRule, kind: "ip" | "email" | "user", id: string, hits: number): Promise<void> {
  const bucket = bucketKey({ rule, kind, id });
  const w = rule.windowSec;
  const start = `floor(extract(epoch from now()) / ${w}) * ${w}`;
  await sql(`
    insert into public.rate_limit_hits (bucket, window_start, expires_at, hits)
    values (${lit(bucket)}, to_timestamp(${start}), to_timestamp(${start} + ${w}), ${hits}),
           (${lit(bucket)}, to_timestamp(${start} + ${w}), to_timestamp(${start} + ${w} * 2), ${hits})
    on conflict (bucket, window_start) do update set hits = excluded.hits`);
}

/** ログインしていない人の Supabase（RLS で見えないことを確かめる） */
export function anonClient() {
  const env = e2eEnv();
  return createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

type BulkOpts = { price?: (i: number) => number; category?: (i: number) => string; publishedAt?: string };

/** 同じ出品者の公開中の出品を、1回の SQL でまとめて作る（画像は1枚を使い回す）。作った id を新しい順で返す */
export async function bulkListings(seller: Cast, titleOf: (i: number) => string, n: number, opts: BulkOpts = {}): Promise<string[]> {
  const img = await seedImage("listing-images", seller.id);
  const values = Array.from({ length: n }, (_, i) => {
    const price = opts.price ? opts.price(i) : 1000 + i * 100;
    const cat = opts.category ? opts.category(i) : "panty";
    // published_at を1秒ずつずらして、新着順の並びを決める（i が大きいほど新しい）
    const at = `${opts.publishedAt ?? "now()"} + interval '${i} seconds'`;
    return `(${lit(seller.id)}, ${lit(titleOf(i))}, 'E2E の一覧の試験です。', ${lit(cat)}, 2, ${price}, array[${lit(img)}], 'published', ${at})`;
  });
  const rows = await sql<{ id: string }>(`
    insert into public.listings (seller_id, title, description, category, worn_days, price, image_paths, status, published_at)
    values ${values.join(",\n")}
    returning id`);
  return rows.map((r) => r.id).reverse();
}

/** つぶやきを直に作る（created_at を先にずらすと、新しい順の先頭に来る） */
export async function seedPost(author: Cast, body: string, opts: { createdAt?: string; status?: "visible" | "held" | "hidden" } = {}): Promise<string> {
  const rows = await sql<{ id: string }>(`
    insert into public.posts (author_id, body, status, created_at)
    values (${lit(author.id)}, ${lit(body)}, ${lit(opts.status ?? "visible")}, ${opts.createdAt ?? "now()"})
    returning id`);
  return rows[0]!.id;
}

/** パスワードを知った上でログインした状態にする（使い捨ての人だけ）。
    loginAs のあとに resetPassword すると、そのログインが Supabase 側で切れるので、
    先にパスワードを決めてから、そのパスワードでクッキーを作る（loginAs と同じ形）。パスワードを返す */
export async function loginKnowingPassword(context: BrowserContext, user: Cast): Promise<string> {
  const env = e2eEnv();
  const password = await resetPassword(user);
  const jar = new Map<string, string>();
  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => {
        for (const c of list) {
          if (c.value) jar.set(c.name, c.value);
          else jar.delete(c.name);
        }
      },
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email: user.email, password });
  if (error) throw new Error(`ログインできませんでした（${user.key}）: ${error.message}`);
  await context.clearCookies();
  await context.addCookies(
    [...jar].map(([name, value]) => ({ name, value, domain: "localhost", path: "/", httpOnly: false, secure: false, sameSite: "Lax" as const })),
  );
  return password;
}

/* 下の2つは管理 API（sql。並べて流すと 429 が出る）を使わず、service role の REST で替える */

/** 出品の状態を直に替える（後片付け・下ごしらえ用） */
export async function setListingStatus(ids: string[], status: string): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await admin().from("listings").update({ status }).in("id", ids);
  if (error) throw new Error(`setListingStatus: ${error.message}`);
}

/** つぶやきを隠す（後片付け用） */
export async function hidePosts(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await admin().from("posts").update({ status: "hidden" }).in("id", ids);
  if (error) throw new Error(`hidePosts: ${error.message}`);
}

/** 利用者の状態・本人確認を直に替える（freshUser の人にだけ使う） */
export async function setProfile(user: Cast, set: Record<string, string | null>): Promise<void> {
  const { error } = await admin().from("profiles").update(set).eq("id", user.id);
  if (error) throw new Error(`setProfile: ${error.message}`);
}

/** 画面が横にはみ出していないか（はみ出している要素の手がかりも返す）。
    スマホの真似では、中身がはみ出すと window.innerWidth まで広がる（Pixel 7 で 412 → 445）ので、
    比べる幅は端末の幅（documentElement.clientWidth）にする */
export async function overflowOf(page: Page): Promise<{ scrollWidth: number; innerWidth: number; culprits: string[] }> {
  return page.evaluate(() => {
    const innerWidth = document.documentElement.clientWidth;
    const culprits: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= innerWidth + 1) continue;
      // 横に流す入れ物の中身（自分では見えない所にある）は数えない
      let p: HTMLElement | null = el.parentElement;
      let clipped = false;
      while (p && p !== document.body) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") {
          clipped = true;
          break;
        }
        p = p.parentElement;
      }
      if (clipped) continue;
      const cls = typeof el.className === "string" && el.className ? `.${el.className.trim().split(/\s+/).join(".")}` : "";
      culprits.push(`${el.tagName.toLowerCase()}${cls}（右端 ${Math.round(r.right)}px）`);
      if (culprits.length >= 5) break;
    }
    return { scrollWidth: document.documentElement.scrollWidth, innerWidth, culprits };
  });
}

/** 枠（nav など）の外に出て切れているリンク・ボタンの文字（全部見えていれば空）。
    overflow: hidden の枠では、外に出た項目は人には見えないのに toBeVisible も overflowOf も通るので、枠との位置で比べる */
export async function clippedItems(box: Locator): Promise<string[]> {
  return box.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return Array.from(el.querySelectorAll<HTMLElement>("a, button"))
      .filter((a) => {
        const b = a.getBoundingClientRect();
        return b.left < r.left - 1 || b.right > r.right + 1 || b.top < r.top - 1 || b.bottom > r.bottom + 1;
      })
      .map((a) => a.textContent?.trim() ?? "");
  });
}

/** server action（next-action の見出し付きの POST）を数える。止めたいときは block を true に */
export async function watchActions(page: Page, opts: { block?: boolean } = {}): Promise<{ count: () => number }> {
  let n = 0;
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (req.method() === "POST" && (await req.headerValue("next-action"))) {
      n++;
      if (opts.block) return route.abort();
    }
    return route.continue();
  });
  return { count: () => n };
}

/* ───────── 試験用の画像（その場で作る） ───────── */

const color = { r: 230, g: 120, b: 160 };

export const pngBuffer = (w = 64, h = 64) => sharp({ create: { width: w, height: h, channels: 3, background: color } }).png().toBuffer();
export const webpBuffer = (w = 64, h = 64) => sharp({ create: { width: w, height: h, channels: 3, background: color } }).webp().toBuffer();

/** EXIF（説明・著作者の欄）に印の文字を入れた JPEG */
export const jpegWithExif = (marker: string) =>
  sharp({ create: { width: 96, height: 96, channels: 3, background: color } })
    .jpeg()
    .withExif({ IFD0: { ImageDescription: marker, Artist: marker, Copyright: marker } })
    .toBuffer();

/** 乱数の模様の PNG（縮まないので大きくなる。1600×1600 で約7MB） */
export async function noisyPng(side = 1600): Promise<Buffer> {
  const raw = randomBytes(side * side * 3);
  return sharp(raw, { raw: { width: side, height: side, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
}
