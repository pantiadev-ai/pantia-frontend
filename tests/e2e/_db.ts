/* E2E の下ごしらえ: 検証用 DB への SQL・試験用の利用者・ログイン状態（クッキー）。
   ・SQL は Supabase の管理 API で流す（postgres の権限。RLS・画面の確認を通らないので、下ごしらえだけに使う）
   ・ログインは毎回フォームを通さない。Supabase Auth の回数の上限（IP ごと）に当たらないよう、
     作ったセッションを tests/e2e/.auth/ に置いて、期限まで使い回す。フォームのログインは auth の試験で別に確かめる
   ・パスワードは保存しない。ログインし直すときに、その場で新しい乱数に替える */
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BrowserContext } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { e2eEnv } from "./_env";
import { freshTotp } from "./_totp";

const AUTH_DIR = join(process.cwd(), "tests", "e2e", ".auth");
export const BASE_URL = "http://localhost:3100";

/** SQL の文字列にする（' を重ねる） */
export const lit = (v: string | number | boolean | null): string =>
  v === null ? "null" : typeof v === "string" ? `'${v.replace(/'/g, "''")}'` : String(v);

/** 検証用 DB に SQL を流す。最後の文の結果を返す */
export async function sql<T = Record<string, unknown>>(query: string): Promise<T[]> {
  const env = e2eEnv();
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${env.ref}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const text = await res.text();
    // 管理 API の回数の上限・一時的な失敗は、間を広げながら6回までやり直す（試験を並べて流すと 429 が出る）。
    // 待ち時間に揺らぎを足して、並んだ試験が同じ時刻にそろってやり直さないようにする
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt + Math.random() * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`E2E sql ${res.status}: ${text.slice(0, 400)}`);
    return JSON.parse(text) as T[];
  }
}

/** service_role の Supabase（Auth の管理・画像の置き場だけに使う） */
export function admin() {
  const env = e2eEnv();
  return createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type Role = "seller" | "buyer";
export type Kyc = "approved" | "unsubmitted" | "pending" | "rejected";
export type Cast = { key: string; id: string; email: string; nickname: string; role: Role };
type UserOpts = { role: Role; nickname?: string; kyc?: Kyc; admin?: boolean };

const emailOf = (key: string) => `e2e-${key}@example.test`;

/** 試験用の利用者を用意する（無ければ作る）。毎回、役割・本人確認・状態を指定どおりに戻す */
export async function ensureUser(key: string, opts: UserOpts): Promise<Cast> {
  if (!/^[a-z0-9-]{1,40}$/.test(key)) throw new Error(`利用者の key の形が違います: ${key}`);
  const email = emailOf(key);
  const nickname = opts.nickname ?? key.slice(0, 20);
  let id = (await sql<{ id: string }>(`select id from auth.users where email = ${lit(email)}`))[0]?.id;
  if (!id) {
    const { data, error } = await admin().auth.admin.createUser({
      email,
      password: randomBytes(24).toString("base64url"),
      email_confirm: true,
      user_metadata: { nickname, role: opts.role, age: "25" },
    });
    if (error || !data.user) throw new Error(`利用者を作れませんでした（${key}）: ${error?.message}`);
    id = data.user.id;
  }
  await sql(`
    update public.profiles set role = ${lit(opts.role)}, kyc_status = ${lit(opts.kyc ?? "approved")}, status = 'active', nickname = ${lit(nickname)}
    where id = ${lit(id)};
    ${opts.admin ? `insert into public.admin_users (user_id, note) values (${lit(id)}, 'e2e') on conflict (user_id) do nothing;` : ""}
  `);
  return { key, id, email, nickname, role: opts.role };
}

/** その試験だけで使う使い捨ての利用者（停止・退会など、ほかの試験に響く操作に使う） */
export async function freshUser(prefix: string, opts: UserOpts): Promise<Cast> {
  return ensureUser(`${prefix}-${Date.now().toString(36)}${randomBytes(2).toString("hex")}`, opts);
}

/** パスワードを新しい乱数に替えて返す（フォームのログインを試すときだけ使う。値は表示しない） */
export async function resetPassword(user: Cast): Promise<string> {
  const password = `E2e-${randomBytes(18).toString("base64url")}`;
  const { error } = await admin().auth.admin.updateUserById(user.id, { password });
  if (error) throw new Error(`パスワードを替えられませんでした: ${error.message}`);
  return password;
}

type SavedSession = { cookies: { name: string; value: string }[]; expiresAt: number };

function readJson<T>(file: string): T | null {
  try {
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : null;
  } catch {
    return null;
  }
}

/** クッキーを手元の入れ物に読み書きする Supabase（ブラウザに渡すクッキーを作る・確かめる） */
function jarClient(jar: Map<string, string>) {
  const env = e2eEnv();
  return createServerClient(env.url, env.anonKey, {
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
}

/** ログイン済みのクッキーを作る（aal2 = 二段階認証まで済ませる。管理画面用） */
export async function sessionCookies(user: Cast, opts: { aal2?: boolean } = {}): Promise<SavedSession["cookies"]> {
  mkdirSync(AUTH_DIR, { recursive: true });
  const file = join(AUTH_DIR, `${user.key}${opts.aal2 ? "-aal2" : ""}.json`);
  const saved = readJson<SavedSession>(file);
  // 期限の内でも、あとの操作（パスワードの変更・二段階認証の初回の確認）で Supabase 側が無効にしていることがあるので、
  // 使い回す前に1回確かめる（期限まで10分以上あるので、ここで更新は走らない）
  if (saved?.cookies && saved.expiresAt * 1000 > Date.now() + 10 * 60_000) {
    const { error } = await jarClient(new Map(saved.cookies.map((c) => [c.name, c.value]))).auth.getUser();
    if (!error) return saved.cookies;
  }

  const jar = new Map<string, string>();
  const supabase = jarClient(jar);
  const password = await resetPassword(user);
  let { data, error } = await supabase.auth.signInWithPassword({ email: user.email, password });
  // Supabase Auth の IP ごとの回数の上限に当たったら、少し待ってやり直す
  for (let i = 0; i < 4 && error && /rate limit/i.test(error.message); i++) {
    await new Promise((r) => setTimeout(r, 30_000));
    ({ data, error } = await supabase.auth.signInWithPassword({ email: user.email, password }));
  }
  if (error || !data.session) throw new Error(`ログインできませんでした（${user.key}）: ${error?.message}`);
  let expiresAt = data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600;

  if (opts.aal2) {
    const secretFile = join(AUTH_DIR, `${user.key}-totp.json`);
    let secret = readJson<{ secret: string }>(secretFile)?.secret ?? null;
    const factors = await supabase.auth.mfa.listFactors();
    let factor = factors.data?.totp.find((f) => f.status === "verified") ?? null;
    if (!factor || !secret) {
      // 秘密が手元に無い登録は使えないので、消して登録し直す
      const all = await admin().auth.admin.mfa.listFactors({ userId: user.id });
      for (const f of all.data?.factors ?? []) await admin().auth.admin.mfa.deleteFactor({ userId: user.id, id: f.id });
      const en = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `e2e-${randomUUID().slice(0, 8)}` });
      if (en.error || !en.data) throw new Error(`二段階認証を登録できませんでした: ${en.error?.message}`);
      secret = en.data.totp.secret;
      writeFileSync(secretFile, JSON.stringify({ secret }));
      factor = { id: en.data.id } as typeof factor;
    }
    const v = await supabase.auth.mfa.challengeAndVerify({ factorId: factor!.id, code: await freshTotp(secret!) });
    if (v.error) throw new Error(`二段階認証を通せませんでした: ${v.error.message}`);
    expiresAt = Math.floor(Date.now() / 1000) + (v.data.expires_in ?? 3600);
  }

  const cookies = [...jar].map(([name, value]) => ({ name, value }));
  writeFileSync(file, JSON.stringify({ cookies, expiresAt } satisfies SavedSession));
  return cookies;
}

/** その人としてログインした Supabase（RLS・関数の権限を、画面を通さず確かめるときに使う） */
export async function userClient(user: Cast, opts: { aal2?: boolean } = {}) {
  const cookies = await sessionCookies(user, opts);
  return jarClient(new Map(cookies.map((c) => [c.name, c.value])));
}

/** ブラウザの入れ物を、その人のログイン済みにする */
export async function loginAs(context: BrowserContext, user: Cast, opts: { aal2?: boolean } = {}): Promise<void> {
  await context.clearCookies();
  const cookies = await sessionCookies(user, opts);
  await context.addCookies(
    cookies.map((c) => ({ ...c, domain: "localhost", path: "/", httpOnly: false, secure: false, sameSite: "Lax" as const })),
  );
}

/** 保存したログイン状態を捨てる（停止・パスワード変更などで無効になったとき） */
export function forgetSession(user: Cast): void {
  for (const suffix of ["", "-aal2"]) {
    const file = join(AUTH_DIR, `${user.key}${suffix}.json`);
    if (existsSync(file)) writeFileSync(file, "{}");
  }
}

// 1×1 の WebP（出品・アバターの下ごしらえ用の画像）
const TINY_WEBP = Buffer.from("UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=", "base64");

/** 画像を置き場に置いて、そのパスを返す */
export async function seedImage(bucket: "listing-images" | "avatars" | "post-images", ownerId: string): Promise<string> {
  const path = `${ownerId}/${randomUUID()}.webp`;
  const { error } = await admin().storage.from(bucket).upload(path, TINY_WEBP, { contentType: "image/webp", upsert: false });
  if (error) throw new Error(`画像を置けませんでした: ${error.message}`);
  return path;
}

type ListingOpts = {
  title?: string;
  price?: number;
  status?: "draft" | "published" | "private" | "sold" | "hidden";
  category?: string;
  description?: string;
  set?: string; // 追加で入れる列（例: "opt_video = true"）
};

/** 出品を直に作る（画面の確認を通らない。一覧・購入などの下ごしらえ用） */
export async function seedListing(seller: Cast, opts: ListingOpts = {}): Promise<string> {
  const img = await seedImage("listing-images", seller.id);
  const rows = await sql<{ id: string }>(`
    insert into public.listings (seller_id, title, description, category, worn_days, price, image_paths, status)
    values (${lit(seller.id)}, ${lit(opts.title ?? `E2E商品 ${randomBytes(3).toString("hex")}`)}, ${lit(opts.description ?? "E2E の試験用の商品です。")},
            ${lit(opts.category ?? "panty")}, 2, ${opts.price ?? 3000}, array[${lit(img)}], ${lit(opts.status ?? "published")})
    returning id`);
  const id = rows[0].id;
  if (opts.set) await sql(`update public.listings set ${opts.set} where id = ${lit(id)}`);
  return id;
}

/** 試験の土台になる顔ぶれ（global-setup で作る。中身を壊す操作には freshUser を使うこと） */
export const CAST = {
  seller: { key: "seller1", role: "seller", nickname: "E2Eみさき" },
  seller2: { key: "seller2", role: "seller", nickname: "E2Eゆい" },
  buyer: { key: "buyer1", role: "buyer", nickname: "E2Eたろう" },
  buyer2: { key: "buyer2", role: "buyer", nickname: "E2Eじろう" },
  admin: { key: "admin1", role: "buyer", nickname: "E2E運営", admin: true },
} as const;

export async function cast(name: keyof typeof CAST): Promise<Cast> {
  const c = CAST[name];
  return ensureUser(c.key, { role: c.role, nickname: c.nickname, admin: "admin" in c ? c.admin : false });
}
