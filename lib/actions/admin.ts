"use server";
/* 管理画面の操作（運営だけ）。

   ▼守り（28 §B1・§B6）
   ・すべての操作は actionAdminStrict()（管理者＋二段階認証まで済んだセッション）で始める。
     例外は二段階認証そのもの（mfaEnroll／mfaVerify）だけで、こちらは actionAdmin()＋回数の上限。
   ・受け取った値は zod で形を確かめ、DB には1つずつ選んで渡す（受け取った object をそのまま渡さない）。
   ・DB の admin_* 関数は service_role でだけ呼べる。p_admin には actionAdminStrict() で確かめた本人の id だけを入れる
     （DB 側でも assert_admin で管理者かを確かめ直す）。
   ・理由が要る操作（停止・退会・却下・キャンセルなど）は、ここでも DB でも理由を必須にする。 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { refundOrder } from "@/lib/adapters/payment";
import { actionAdmin, ActionError, runAction, type ActionResult } from "@/lib/auth";
import { actionAdminStrict, adminLimit, adminThrowDb, ADMIN_RULES } from "@/lib/admin";
import { isUuid } from "@/lib/search";
import { SITE_NAME } from "@/lib/site";
import { removeImages, signedUrls, type Bucket } from "@/lib/storage-server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/* ───────────── 共通の小道具 ───────────── */

/** 管理の操作の入口（管理者＋aal2＋回数の上限） */
async function begin() {
  const v = await actionAdminStrict();
  await adminLimit(ADMIN_RULES.op, v.id);
  return v;
}

/** 管理画面のどのページにも数字（未処理の件数など）が出るので、/admin の下をまとめて作り直す */
function refresh() {
  revalidatePath("/admin", "layout");
}

function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (!r.success) throw new ActionError(r.error.issues[0]?.message ?? "入力の内容を確かめてください。");
  return r.data;
}

const Id = z.string().refine((s) => isUuid(s), "対象が見つかりません。画面を読み込み直してください。");

/** 必須の理由（前後の空白を除いて1文字以上） */
const need = (max: number, label = "理由") =>
  z
    .string()
    .trim()
    .min(1, `${label}を入力してください。`)
    .max(max, `${label}は${max}文字以内で入力してください。`);

/** 任意の理由・メモ */
const optional = (max: number, label = "理由") => z.string().trim().max(max, `${label}は${max}文字以内で入力してください。`);

/** jsonb の戻り値から文字の配列を取り出す（形が違えば空） */
function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function record(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** 画像・書類を消す（1回に送る数を区切る）。消せなかった数を返す */
async function purge(bucket: Bucket, paths: string[]): Promise<number> {
  let failed = 0;
  for (let i = 0; i < paths.length; i += 500) {
    const chunk = paths.slice(i, i + 500);
    const r = await removeImages(bucket, chunk);
    if (r.error) {
      console.error("[admin] 画像を消せませんでした", bucket, r.error);
      failed += chunk.length;
    }
  }
  return failed;
}

/* ───────────── 二段階認証（/admin/mfa） ───────────── */

/** 認証アプリ（TOTP）の登録を始める。QR とシークレットを返す（まだ確定していない） */
export async function mfaEnroll(): Promise<ActionResult<{ factorId: string; qr: string; secret: string }>> {
  return runAction(async () => {
    const v = await actionAdmin();
    await adminLimit(ADMIN_RULES.mfa, v.id);
    const supabase = await createClient();
    const { data: list, error: listErr } = await supabase.auth.mfa.listFactors();
    if (listErr || !list) throw new ActionError("二段階認証の状態を読めませんでした。時間をおいて、もう一度お試しください。");
    if (list.totp.length > 0) {
      throw new ActionError("認証アプリはもう登録済みです。画面を読み込み直して、認証コードを入れてください。");
    }
    // 途中で止めた登録（未確認）が残っていると、同じ名前で登録できないので消しておく
    for (const f of list.all) {
      if (f.factor_type === "totp" && f.status !== "verified") {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `${SITE_NAME} 管理`,
      issuer: SITE_NAME,
    });
    if (error || !data) throw new ActionError("認証アプリの登録を始められませんでした。時間をおいて、もう一度お試しください。");
    // QR は SVG の文字（頭に <?xml …?> や注釈が付くことがある）。# などで途切れないよう、エンコードし直して data URL にする（画面では <img> で出すだけ）
    const raw = data.totp.qr_code;
    const comma = raw.indexOf(",");
    const svg = raw.startsWith("data:") && comma >= 0 ? raw.slice(comma + 1) : raw;
    if (!svg.includes("<svg")) throw new ActionError("QR コードを作れませんでした。");
    const qr = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    return { ok: true, data: { factorId: data.id, qr, secret: data.totp.secret } };
  });
}

const CodeSchema = z.object({
  factorId: Id,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "認証アプリに出ている6桁の数字を入れてください。"),
});

/** 6桁のコードを確かめて、セッションを aal2 に上げる。済んだら管理画面へ */
export async function mfaVerify(factorId: string, code: string): Promise<ActionResult> {
  return runAction(async () => {
    const v = await actionAdmin();
    await adminLimit(ADMIN_RULES.mfa, v.id);
    const input = parse(CodeSchema, { factorId, code });
    const supabase = await createClient();
    // 本人の TOTP の factor だけを受け付ける（画面から来た id をそのまま信じない）
    const { data: list, error: listErr } = await supabase.auth.mfa.listFactors();
    if (listErr || !list) throw new ActionError("二段階認証の状態を読めませんでした。時間をおいて、もう一度お試しください。");
    const factor = list.all.find((f) => f.id === input.factorId && f.factor_type === "totp");
    if (!factor) throw new ActionError("認証アプリの登録が見つかりません。画面を読み込み直してください。");
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: factor.id });
    if (chErr || !ch) throw new ActionError("認証を始められませんでした。時間をおいて、もう一度お試しください。");
    const { error } = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: ch.id, code: input.code });
    if (error) throw new ActionError("認証コードが違うか、時間切れです。アプリに出ている新しいコードを入れてください。");
    refresh();
    redirect("/admin");
  });
}

/* ───────────── 利用者 ───────────── */

/** 警告（記録が残り、本人に通知が届く） */
export async function warnUser(userId: string, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const v = await begin();
    const input = parse(z.object({ userId: Id, reason: need(300, "警告の内容") }), { userId, reason });
    const { error } = await createServiceClient().rpc("admin_warn_user", {
      p_admin: v.id,
      p_user: input.userId,
      p_reason: input.reason,
    });
    adminThrowDb(error);
    refresh();
    return { ok: true, message: "警告を送りました。" };
  });
}

/** 利用停止（理由は必須）／停止の解除（理由は任意） */
export async function setUserStatus(userId: string, status: string, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const v = await begin();
    const base = parse(z.object({ userId: Id, status: z.enum(["active", "suspended"], "操作が違います。") }), {
      userId,
      status,
    });
    const why = parse(base.status === "suspended" ? need(500, "停止の理由") : optional(500, "メモ"), reason);
    const { error } = await createServiceClient().rpc("admin_set_user_status", {
      p_admin: v.id,
      p_user: base.userId,
      p_status: base.status,
      p_reason: why,
    });
    adminThrowDb(error);
    refresh();
    return { ok: true, message: base.status === "suspended" ? "利用を停止しました。" : "停止を解除しました。" };
  });
}

/** 強制退会（停止中の人だけ）。画像・書類を消し、ログインも止める */
export async function withdrawUser(userId: string, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const v = await begin();
    const input = parse(z.object({ userId: Id, reason: need(500, "退会の理由") }), { userId, reason });
    const service = createServiceClient();
    const { data, error } = await service.rpc("admin_withdraw_user", {
      p_admin: v.id,
      p_user: input.userId,
      p_reason: input.reason,
    });
    adminThrowDb(error);

    // DB の記録は退会済みになった。ここから先は失敗しても退会は取り消さず、残った物を知らせる
    const paths = record(record(data).purge_paths);
    const buckets: Bucket[] = ["avatars", "listing-images", "post-images", "kyc-documents"];
    let failed = 0;
    for (const b of buckets) failed += await purge(b, strings(paths[b]));

    // Auth の利用者も止める（同じアカウントで入り直せないように）
    const { error: banErr } = await service.auth.admin.updateUserById(input.userId, { ban_duration: "876000h" });
    if (banErr) console.error("[admin] ログインを止められませんでした", banErr.message);

    refresh();
    const notes: string[] = [];
    if (failed > 0) notes.push(`画像・書類のうち ${failed} 件を消せませんでした（Supabase の Storage から手で消してください）`);
    if (banErr) notes.push("ログインの停止に失敗しました（Supabase の Authentication から手で止めてください）");
    return { ok: true, message: notes.length ? `退会にしました。ただし、${notes.join("。")}。` : "退会にしました。" };
  });
}

/** ロールの変更申請（出品者⇔購入者）の承認・却下。却下は理由が要る */
export async function decideRoleChange(requestId: string, approve: boolean, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const v = await begin();
    const base = parse(z.object({ requestId: Id, approve: z.boolean() }), { requestId, approve });
    const why = parse(base.approve ? optional(200) : need(200, "却下の理由"), reason);
    const { error } = await createServiceClient().rpc("admin_role_change_decide", {
      p_admin: v.id,
      p_req: base.requestId,
      p_approve: base.approve,
      p_reason: why,
    });
    adminThrowDb(error);
    refresh();
    return { ok: true, message: base.approve ? "ロールの変更を承認しました。" : "ロールの変更を却下しました。" };
  });
}

/* ───────────── 出品 ───────────── */

/** 出品の非表示（理由は必須。出品者に通知が届く）／公開・非公開に戻す */
export async function setListingStatus(listingId: string, status: string, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const v = await begin();
    const base = parse(
      z.object({ listingId: Id, status: z.enum(["hidden", "published", "private"], "操作が違います。") }),
      { listingId, status },
    );
    const why = parse(base.status === "hidden" ? need(200, "非表示の理由") : optional(200, "メモ"), reason);
    const { error } = await createServiceClient().rpc("admin_set_listing_status", {
      p_admin: v.id,
      p_listing: base.listingId,
      p_status: base.status,
      p_reason: why,
    });
    adminThrowDb(
      error,
      base.status === "published" ? "公開に戻せませんでした。出品者が停止中か、出品の内容がそろっていない可能性があります。" : undefined,
    );
    refresh();
    const label = base.status === "hidden" ? "非表示にしました。" : base.status === "published" ? "公開に戻しました。" : "非公開に戻しました。";
    return { ok: true, message: label };
  });
}

/* ───────────── 注文・返金 ───────────── */

/** 運営による注文のキャンセル。支払い済みなら、続けて返金を試す */
export async function cancelOrder(orderId: string, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const v = await begin();
    const input = parse(z.object({ orderId: Id, reason: need(200, "キャンセルの理由") }), { orderId, reason });
    const { data, error } = await createServiceClient().rpc("admin_cancel_order", {
      p_admin: v.id,
      p_order: input.orderId,
      p_reason: input.reason,
    });
    adminThrowDb(error);
    const out = record(data);
    const no = typeof out.order_no === "number" ? `#${out.order_no}` : "";
    if (out.needs_refund !== true) {
      refresh();
      return { ok: true, message: `注文 ${no} をキャンセルしました（未払いのため返金はありません）。` };
    }
    const r = await refundOrder(input.orderId);
    refresh();
    if (r.ok) return { ok: true, message: `注文 ${no} をキャンセルし、返金しました。` };
    return {
      ok: true,
      message: `注文 ${no} をキャンセルしました。ただし、返金の手続きが要る状態です（${r.error}）。「返金待ち」から返金をやり直してください。`,
    };
  });
}

/** 返金待ち（キャンセル済み・返金がまだ）の返金をやり直す */
export async function retryRefund(orderId: string): Promise<ActionResult> {
  return runAction(async () => {
    await begin();
    const input = parse(z.object({ orderId: Id }), { orderId });
    const { data: o, error } = await createServiceClient()
      .from("orders")
      .select("id, order_no, needs_refund, refunded_at")
      .eq("id", input.orderId)
      .maybeSingle();
    adminThrowDb(error);
    if (!o) throw new ActionError("注文が見つかりません。");
    if (o.refunded_at) throw new ActionError("この注文はもう返金済みです。");
    if (!o.needs_refund) throw new ActionError("この注文は返金待ちではありません。");
    const r = await refundOrder(o.id);
    refresh();
    if (!r.ok) throw new ActionError(`返金できませんでした（${r.error}）。返金の手続きが要る状態のままです。`);
    return { ok: true, message: `注文 #${o.order_no} を返金しました。` };
  });
}

/* ───────────── 振込・台帳 ───────────── */

/** 振込を「振込済み」にする（運営が銀行で振り込んだあとに押す） */
export async function payPayout(payoutId: string): Promise<ActionResult> {
  return runAction(async () => {
    const v = await begin();
    const input = parse(z.object({ payoutId: Id }), { payoutId });
    const { error } = await createServiceClient().rpc("admin_payout_pay", { p_admin: v.id, p_payout: input.payoutId });
    adminThrowDb(error);
    refresh();
    return { ok: true, message: "振込済みにしました。出品者に通知しました。" };
  });
}

/** 振込申請の却下（理由は必須。申請額は残高に戻る） */
export async function rejectPayout(payoutId: string, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const v = await begin();
    const input = parse(z.object({ payoutId: Id, reason: need(200, "却下の理由") }), { payoutId, reason });
    const { error } = await createServiceClient().rpc("admin_payout_reject", {
      p_admin: v.id,
      p_payout: input.payoutId,
      p_reason: input.reason,
    });
    adminThrowDb(error);
    refresh();
    return { ok: true, message: "振込申請を却下し、申請額を残高に戻しました。" };
  });
}

const LedgerSchema = z.object({
  userId: Id,
  amount: z
    .number("金額を数字で入れてください。")
    .int("金額は円単位の整数で入れてください。")
    .refine((n) => n !== 0, "0円の調整はできません。")
    .refine((n) => Math.abs(n) <= 1_000_000, "1回の調整は100万円までです。"),
  note: need(100, "調整の理由"),
  orderNo: z
    .string()
    .trim()
    .transform((s) => s.replace(/^#/, ""))
    .refine((s) => s === "" || /^\d{1,12}$/.test(s), "注文番号は数字で入れてください。"),
});

/** 台帳の手動の調整（返金のあとの差し引きなど）。理由は必須 */
export async function adjustLedger(userId: string, amount: number, note: string, orderNo: string): Promise<ActionResult> {
  return runAction(async () => {
    const v = await begin();
    const input = parse(LedgerSchema, { userId, amount, note, orderNo });
    const service = createServiceClient();
    let orderId: string | undefined;
    if (input.orderNo !== "") {
      // 注文番号は、この利用者が出品者か購入者の注文だけを受け付ける
      const { data: o, error } = await service
        .from("orders")
        .select("id, seller_id, buyer_id")
        .eq("order_no", Number(input.orderNo))
        .maybeSingle();
      adminThrowDb(error);
      if (!o || (o.seller_id !== input.userId && o.buyer_id !== input.userId)) {
        throw new ActionError("その注文番号は、この利用者の注文ではありません。");
      }
      orderId = o.id;
    }
    const { error } = await service.rpc("admin_ledger_adjust", {
      p_admin: v.id,
      p_user: input.userId,
      p_amount: input.amount,
      p_note: input.note,
      ...(orderId ? { p_order: orderId } : {}),
    });
    adminThrowDb(error);
    refresh();
    return { ok: true, message: `台帳に ${input.amount > 0 ? "+" : ""}${input.amount.toLocaleString("ja-JP")}円 の調整を記録しました。` };
  });
}

/* ───────────── 本人確認 ───────────── */

/** 審査を始める（書類を見る）。見たことは記録に残る。期限5分の URL を返す */
export async function kycStartReview(appId: string): Promise<ActionResult<{ urls: string[] }>> {
  return runAction(async () => {
    const v = await begin();
    const input = parse(z.object({ appId: Id }), { appId });
    const service = createServiceClient();
    const { data: app, error } = await service
      .from("kyc_applications")
      .select("id, document_paths")
      .eq("id", input.appId)
      .maybeSingle();
    adminThrowDb(error);
    if (!app) throw new ActionError("申請が見つかりません。");
    const { error: startErr } = await service.rpc("admin_kyc_start_review", { p_admin: v.id, p_app: input.appId });
    adminThrowDb(startErr);
    const paths = app.document_paths ?? [];
    if (paths.length === 0) throw new ActionError("書類はもう消してあります（審査が済んだ申請です）。");
    const map = await signedUrls("kyc-documents", paths);
    const urls = paths.map((p) => map[p]).filter((u): u is string => typeof u === "string");
    if (urls.length === 0) throw new ActionError("書類を開けませんでした。時間をおいて、もう一度お試しください。");
    refresh();
    return { ok: true, data: { urls } };
  });
}

const KycDecideSchema = z.object({
  appId: Id,
  approve: z.boolean(),
  underage: z.boolean(),
  allowResubmit: z.boolean(),
});

/** 承認・却下。却下は理由が要る。18歳未満なら却下＋利用停止（DB が行う）。済んだら書類を消す */
export async function kycDecide(
  appId: string,
  approve: boolean,
  reason: string,
  underage: boolean,
  allowResubmit: boolean,
): Promise<ActionResult> {
  return runAction(async () => {
    const v = await begin();
    const base = parse(KycDecideSchema, { appId, approve, underage, allowResubmit });
    if (base.approve && base.underage) throw new ActionError("18歳未満にチェックを入れたまま承認はできません。");
    const why = parse(base.approve ? optional(200) : need(200, "却下の理由"), reason);
    const service = createServiceClient();
    const { data, error } = await service.rpc("admin_kyc_decide", {
      p_admin: v.id,
      p_app: base.appId,
      p_approve: base.approve,
      p_reason: why,
      p_underage: base.underage,
      p_allow_resubmit: base.allowResubmit && !base.underage,
    });
    adminThrowDb(error);

    // 審査が済んだ書類は残さない（消せたら印を付ける。消せなければ印は付けず、あとで消せるように残す）
    const failed = await purge("kyc-documents", strings(record(data).purge_paths));
    if (failed === 0) {
      const { error: markErr } = await service.rpc("kyc_mark_purged", { p_app: base.appId });
      if (markErr) console.error("[admin] 書類を消した印を付けられませんでした", markErr.message);
    }
    refresh();
    const head = base.approve ? "承認しました。" : base.underage ? "却下し、18歳未満のため利用を停止しました。" : "却下しました。";
    return {
      ok: true,
      message: failed > 0 ? `${head}ただし、書類 ${failed} 件を消せませんでした（Supabase の Storage から手で消してください）。` : `${head}書類は消しました。`,
    };
  });
}

/** 却下した申請の再申請を受け付ける */
export async function kycAllowResubmit(appId: string): Promise<ActionResult> {
  return runAction(async () => {
    const v = await begin();
    const input = parse(z.object({ appId: Id }), { appId });
    const { error } = await createServiceClient().rpc("admin_kyc_allow_resubmit", { p_admin: v.id, p_app: input.appId });
    adminThrowDb(error);
    refresh();
    return { ok: true, message: "再申請を受け付けるようにしました。本人に通知しました。" };
  });
}

/* ───────────── 通報・モデレーション ───────────── */

/** 通報の状態を変える（対応中・対応済み・問題なし・未対応に戻す） */
export async function updateReport(reportId: string, status: string, note: string): Promise<ActionResult> {
  return runAction(async () => {
    const v = await begin();
    const input = parse(
      z.object({
        reportId: Id,
        status: z.enum(["open", "reviewing", "resolved", "dismissed"], "操作が違います。"),
        note: optional(500, "対応のメモ"),
      }),
      { reportId, status, note },
    );
    const { error } = await createServiceClient().rpc("admin_report_update", {
      p_admin: v.id,
      p_report: input.reportId,
      p_status: input.status,
      p_note: input.note,
    });
    adminThrowDb(error);
    refresh();
    return { ok: true, message: "通報の状態を変えました。" };
  });
}

/** 保留（自動で止めた投稿・コメント・メッセージ・レビュー）の公開・非表示 */
export async function moderate(type: string, id: string, action: string): Promise<ActionResult> {
  return runAction(async () => {
    const v = await begin();
    const input = parse(
      z.object({
        type: z.enum(["message", "post", "comment", "review"], "種類が違います。"),
        id: Id,
        action: z.enum(["approve", "hide"], "操作が違います。"),
      }),
      { type, id, action },
    );
    const { error } = await createServiceClient().rpc("admin_moderate", {
      p_admin: v.id,
      p_type: input.type,
      p_id: input.id,
      p_action: input.action,
    });
    adminThrowDb(error);
    refresh();
    return { ok: true, message: input.action === "approve" ? "公開しました。" : "非表示にしました。" };
  });
}

/* ───────────── サイト設定 ───────────── */

const yen = (min: number, max: number, label: string) =>
  z
    .number(`${label}を数字で入れてください。`)
    .int(`${label}は整数で入れてください。`)
    .min(min, `${label}は${min.toLocaleString("ja-JP")}以上にしてください。`)
    .max(max, `${label}は${max.toLocaleString("ja-JP")}以下にしてください。`);

const SettingsSchema = z.object({
  feePercent: z
    .number("手数料率を数字で入れてください。")
    .min(0, "手数料率は0%以上にしてください。")
    .max(49.9, "手数料率は49.9%以下にしてください。")
    .refine((n) => Math.abs(n * 10 - Math.round(n * 10)) < 1e-6, "手数料率は小数第1位までで入れてください。"),
  anonymousFee: yen(0, 5000, "匿名配送の手数料"),
  videoFee: yen(0, 10000, "動画オプションの料金"),
  extendFeePerDay: yen(0, 10000, "着用日数の延長料金"),
  minPayout: yen(1, 1_000_000, "最低振込額"),
  payoutFee: yen(0, 1000, "振込手数料"),
  autoCompleteDays: yen(1, 30, "自動で取引完了にするまでの日数"),
  registrationOpen: z.boolean(),
  maintenance: z.boolean(),
  notice: optional(500, "お知らせ"),
  mailOrder: z.boolean(),
  mailKyc: z.boolean(),
  mailPayout: z.boolean(),
  modSpamFilter: z.boolean(),
  forwardingAddress: optional(300, "匿名配送の転送先"),
});

export type SettingsInput = z.input<typeof SettingsSchema>;

/** サイト設定の保存（決まった項目だけ。手数料率は % で受けて小数に直す） */
export async function updateSettings(raw: SettingsInput): Promise<ActionResult> {
  return runAction(async () => {
    const v = await begin();
    const s = parse(SettingsSchema, raw);
    // 列を1つずつ選んで渡す（受け取った object をそのまま渡さない）
    const patch = {
      fee_rate: Math.round(s.feePercent * 10) / 1000,
      anonymous_fee: s.anonymousFee,
      video_fee: s.videoFee,
      extend_fee_per_day: s.extendFeePerDay,
      min_payout: s.minPayout,
      payout_fee: s.payoutFee,
      auto_complete_days: s.autoCompleteDays,
      registration_open: s.registrationOpen,
      maintenance: s.maintenance,
      notice: s.notice,
      mail_order: s.mailOrder,
      mail_kyc: s.mailKyc,
      mail_payout: s.mailPayout,
      mod_spam_filter: s.modSpamFilter,
      forwarding_address: s.forwardingAddress,
    };
    const { error } = await createServiceClient().rpc("admin_update_settings", { p_admin: v.id, p_patch: patch });
    adminThrowDb(error);
    refresh();
    // お知らせ・メンテナンスの帯はすべてのページに出るので、全体も作り直す
    revalidatePath("/", "layout");
    return { ok: true, message: "設定を保存しました。" };
  });
}
