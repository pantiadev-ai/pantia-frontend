/* ログアウト。POST だけ受ける（GET で消せると、よそのページの画像1枚でログアウトさせられる）。
   よそのサイトから送られた POST は断る。 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/origin";
import { KEEP_COOKIE } from "@/lib/session-cookie";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  if (!sameOrigin(req)) {
    return new NextResponse("このページからはログアウトできません。", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const supabase = await createClient();
  // この端末だけ。ほかの端末はそのまま
  await supabase.auth.signOut({ scope: "local" });
  const jar = await cookies();
  jar.delete(KEEP_COOKIE);

  const res = NextResponse.redirect(new URL("/", req.url), 303);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
