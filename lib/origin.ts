/* クッキーで認証する route handler の POST・PUT・PATCH・DELETE は、Origin を自分で確かめる（28 §N1）。
   server action は Next.js が Origin を見るので、ここを通さなくてよい。
   webhook（Stripe・KYC）は Origin ではなく署名で確かめる。 */
import "server-only";
import { publicEnv } from "@/lib/env";

export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const allowed = new Set([new URL(publicEnv.siteUrl).origin]);
    const host = req.headers.get("host");
    // 手元の next dev とプレビューは、受けたホスト自身も許す（https・http は受けた側に合わせる）
    if (host && process.env.VERCEL_ENV !== "production") {
      allowed.add(`https://${host}`);
      allowed.add(`http://${host}`);
    }
    return allowed.has(new URL(origin).origin);
  } catch {
    return false;
  }
}
