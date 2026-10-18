/* 本人確認（KYC）の受け方の切り替え。環境変数 KYC_MODE で決める。
     manual（既定）… 書類の写真をこちらで受け取って非公開の箱に置くだけ。運営が管理画面で見て判定する。
     trustdock    … TRUSTDOCK に回す。書類は TRUSTDOCK の画面で本人が撮る（こちらは写真を受け取らない）。
   ▼仮（契約前）
   TRUSTDOCK の API・webhook の仕様は契約後（NDA）に手に入る。今は「受付番号を kyc_set_provider_ref で結ぶ」
   ところまでの形だけを作り、本当の呼び出しは TODO にしてある。署名の見出しの名前・結果の中身の形も仮。 */
import "server-only";
import { z } from "zod";
import { verifyHmacSha256Hex } from "@/lib/hmac";
import { serverEnv } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/service";

export type KycProvider = "manual" | "trustdock";

/** 受付を止めているときの例外（画面には「ただいま受け付けていません」と出す） */
export class KycNotReadyError extends Error {}

/** 今の受け方。環境変数の形が違えば manual に倒さずに止める（env.ts が例外を投げる） */
export function kycProvider(): KycProvider {
  return serverEnv.kycMode;
}

/** TRUSTDOCK の鍵が全部そろっているか */
function trustdockKeysReady(): boolean {
  try {
    return Boolean(serverEnv.trustdockApiBase && serverEnv.trustdockApiToken && serverEnv.trustdockWebhookSecret);
  } catch {
    return false;
  }
}

/** 受付の前に呼ぶ（申請を作る前・写真を置く前）。trustdock なのに鍵が無いときは受け付けない。
    開発の環境では鍵が無くても通す（申請は残り、運営が手で判定できる）。 */
export function assertKycReady(): KycProvider {
  const mode = kycProvider();
  if (mode === "trustdock" && !trustdockKeysReady() && serverEnv.isProduction) {
    throw new KycNotReadyError("TRUSTDOCK の鍵が未設定です");
  }
  return mode;
}

/** TRUSTDOCK に確認を頼む。返すのは TRUSTDOCK 側の受付番号と、本人を案内する画面の URL（あれば）。
    TODO(TRUSTDOCK 契約後): 仕様書に合わせて書く。
      1. serverEnv.trustdockApiBase へ serverEnv.trustdockApiToken で「確認の依頼」を作る（こちらの申請の id を添える）
      2. 返ってきた受付番号（ref）と、本人が書類を撮る画面の URL を返す
      3. 結果は /api/webhooks/kyc に届く（署名の見出し・中身の形も仕様書に合わせて parseKycWebhook を直す）
    個人の情報（生年月日など）を送る項目が要るなら、送る物を最小にして SECURITY.md の表に書き足す。 */
async function requestTrustdock(input: { appId: string }): Promise<{ ref: string; nextUrl: string | null }> {
  void input;
  if (!trustdockKeysReady()) throw new Error("TRUSTDOCK の鍵が未設定です");
  throw new Error("TRUSTDOCK への受け渡しは、まだ作っていません（仮）");
}

/** 申請を作ったあとに呼ぶ。manual なら何もしない。trustdock なら依頼を作って、受付番号を申請に結ぶ。
    失敗したら例外（呼び手はログに残し、申請は運営が手で判定する）。 */
export async function startVerification(appId: string): Promise<{ nextUrl: string | null }> {
  if (kycProvider() !== "trustdock") return { nextUrl: null };
  const { ref, nextUrl } = await requestTrustdock({ appId });
  const { error } = await createServiceClient().rpc("kyc_set_provider_ref", { p_app: appId, p_ref: ref });
  if (error) throw new Error(`受付番号を結べませんでした: ${error.code ?? ""}`);
  // 本人を外の画面へ送るので、https の URL だけを通す
  if (nextUrl && !/^https:\/\/[^/\s]+\//.test(nextUrl)) return { nextUrl: null };
  return { nextUrl };
}

/* ---------------------------------------------------------------------------
   webhook（app/api/webhooks/kyc/route.ts）で使う。形は仮。
--------------------------------------------------------------------------- */

/** 署名の見出しの名前（仮。TRUSTDOCK の仕様に合わせて直す） */
export const KYC_SIGNATURE_HEADER = "x-pantia-signature";

/** 生の本文の HMAC-SHA256 と、見出しの16進の値を照らす（中身は lib/hmac.ts。単体試験あり） */
export const verifyKycSignature = verifyHmacSha256Hex;

const WebhookBody = z.object({
  event_id: z.string().min(1).max(200),
  ref: z.string().min(1).max(200),
  result: z.enum(["approved", "rejected"]),
  reason: z.string().max(200).optional(),
  underage: z.boolean().optional(),
});

export type KycWebhookResult = { eventId: string; ref: string; approve: boolean; reason: string; underage: boolean };

/** 結果の中身を確かめて取り出す（形は仮）。形が違えば null */
export function parseKycWebhook(body: unknown): KycWebhookResult | null {
  const parsed = WebhookBody.safeParse(body);
  if (!parsed.success) return null;
  const b = parsed.data;
  const underage = b.underage === true;
  return {
    eventId: b.event_id,
    ref: b.ref,
    // 18歳未満の印が付いていたら、承認の結果でも承認しない
    approve: b.result === "approved" && !underage,
    reason: (b.reason ?? "").trim(),
    underage,
  };
}
