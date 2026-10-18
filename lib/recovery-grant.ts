/* パスワードの再設定の「許可札」。ログイン中というだけでは、今のパスワードなしに変えさせない。
   再設定のメールのリンク（/auth/callback）を通った時だけ、署名つきの札を httpOnly の cookie に置き、
   新しいパスワードを決める時（updatePassword）にそれを確かめる。
   札は「人の id・期限」を HMAC-SHA256 で署名したもの。画面の JS からは読めず、手で作っても署名が合わない。
   server-only や環境変数に頼らないので、単体試験から直に呼べる（tests/unit/recovery-grant.test.ts） */
import { createHmac, timingSafeEqual } from "node:crypto";

export const RECOVERY_COOKIE = "pt_pw_reset";
/** 札の置き場（新しいパスワードの画面と、その server action だけに送られる） */
export const RECOVERY_COOKIE_PATH = "/auth";
/** 札が使える長さ（秒）。メールのリンクを開いてから、新しいパスワードを決めるまで */
export const RECOVERY_TTL_SEC = 15 * 60;

const GRANT_RE = /^([0-9a-f-]{36})\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/;

function mac(body: string, secret: string): Buffer {
  // 渡された鍵をそのまま使わず、この用途だけの鍵を作ってから署名する
  const key = createHmac("sha256", secret).update("pantia:password-recovery:v1").digest();
  return createHmac("sha256", key).update(body, "utf8").digest();
}

export function makeRecoveryGrant(userId: string, nowSec: number, secret: string): string {
  const body = `${userId}.${nowSec + RECOVERY_TTL_SEC}`;
  return `${body}.${mac(body, secret).toString("base64url")}`;
}

/** 札がこの人のもので、期限内で、署名が合うか（比べ方は時間が一定） */
export function checkRecoveryGrant(value: string | undefined, userId: string, nowSec: number, secret: string): boolean {
  if (!value || !secret) return false;
  const m = GRANT_RE.exec(value);
  if (!m) return false;
  const [, uid, exp, sig] = m as unknown as [string, string, string, string];
  const expSec = Number(exp);
  if (uid !== userId || expSec <= nowSec || expSec > nowSec + RECOVERY_TTL_SEC) return false;
  const given = Buffer.from(sig, "base64url");
  const expected = mac(`${uid}.${exp}`, secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** 今の時刻で確かめる（画面・server action から） */
export function hasRecoveryGrant(value: string | undefined, userId: string, secret: string): boolean {
  return checkRecoveryGrant(value, userId, Math.floor(Date.now() / 1000), secret);
}
