"use server";
/* キャラを最初から作る（管理画面の「キャラ」→「キャラを新しく作る」）。
   代理登録で作った人は本人のアカウントなのでキャラにできない（0017）。キャラは運営そのものなので、ここで作る。

   ▼守り（28 §B1・§B6）
   ・すべて actionAdminStrict()（管理者＋二段階認証）と回数の上限から始める（lib/actions/proxy.ts と同じ）。
   ・売手のアカウントを作り（createUser）、すぐ admin_create_character で印を付ける。印を付けられなければ作った人を消す。
   ・パスワードは運営がリンクを開いて決める。リンクは画面に1回だけ出し、DB にもログにも残さない（代理登録と同じ）。
     パスワードを決めたら（updatePassword → character_mark_password_set）、ここからはリンクを作れなくなる。 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActionError, runAction, type ActionResult } from "@/lib/auth";
import { actionAdminStrict, adminLimit, adminThrowDb, ADMIN_RULES } from "@/lib/admin";
import { discardUnmarked } from "@/lib/character";
import { dbCode } from "@/lib/db-errors";
import { publicEnv } from "@/lib/env";
import { isUuid } from "@/lib/search";
import { getSettings } from "@/lib/settings";
import { createServiceClient } from "@/lib/supabase/service";
import { hasControlChar } from "@/components/auth/rules";

type Service = ReturnType<typeof createServiceClient>;

/** 管理の操作の入口（管理者＋aal2＋回数の上限） */
async function begin() {
  const v = await actionAdminStrict();
  await adminLimit(ADMIN_RULES.op, v.id);
  return v;
}

function refresh() {
  revalidatePath("/admin", "layout");
}

function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (!r.success) throw new ActionError(r.error.issues[0]?.message ?? "入力の内容を確かめてください。");
  return r.data;
}

const Id = z.string().refine((s) => isUuid(s), "対象が見つかりません。画面を読み込み直してください。");

/** パスワードを決めるリンク（generateLink はメールを送らない）。作れなければ null。
   /auth/callback に直接つながず /auth/start を通すのは、リンクのプレビューが先に開いてトークンを使ってしまうため（proxy.ts と同じ） */
async function passwordLink(service: Service, email: string): Promise<string | null> {
  const { data, error } = await service.auth.admin.generateLink({ type: "recovery", email });
  const token = data?.properties?.hashed_token;
  if (error || !token) {
    console.error("[character] リンクを作れませんでした", error?.code ?? error?.status);
    return null;
  }
  return `${publicEnv.siteUrl}/auth/start?${new URLSearchParams({ token_hash: token }).toString()}`;
}

/* ───────────── キャラを作る ───────────── */

const CreateInput = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "メールアドレスが長すぎます。")
    .pipe(z.email({ error: "メールアドレスの形を確かめてください。" })),
  nickname: z
    .string()
    .trim()
    .min(1, "キャラの名前を入力してください。")
    .max(20, "キャラの名前は20文字以内で入力してください。")
    .refine((s) => !hasControlChar(s), "キャラの名前に使えない文字があります。"),
  age: z.number().int().min(18, "年齢は18〜99で入力してください。").max(99, "年齢は18〜99で入力してください。").nullable(),
  note: z.string().trim().max(200, "メモは200文字以内で入力してください。"),
});

/** 戻り値の url はパスワードを決めるリンク（作れなかったときは null。一覧の「パスワードのリンク」から作り直せる） */
type Created = { id: string; url: string | null; count: number };

export async function createCharacter(input: unknown): Promise<ActionResult<Created>> {
  return runAction<Created>(async () => {
    const me = await begin();
    const v = parse(CreateInput, input);
    // DB（handle_new_user）でも止まるが、先に確かめてわかる文を出す
    if (!(await getSettings()).registrationOpen) {
      throw new ActionError("新規登録の受付を止めているため登録できません。サイト設定で受付を再開してから行ってください。");
    }

    // handle_new_user が読む名前。パスワードは付けない（リンクから決める）。email_confirm: true で確認のメールは送られない
    const meta: Record<string, string> = { nickname: v.nickname, role: "seller" };
    if (v.age !== null) meta.age = String(v.age);
    const service = createServiceClient();
    const { data, error } = await service.auth.admin.createUser({ email: v.email, email_confirm: true, user_metadata: meta });
    if (error || !data.user) {
      if (error?.code === "email_exists" || error?.code === "user_already_exists") {
        throw new ActionError("このメールアドレスはもう登録されています。");
      }
      if (error?.code === "email_address_invalid") throw new ActionError("このメールアドレスは使えません。");
      console.error("[character] アカウントを作れませんでした", error?.code ?? error?.status);
      throw new ActionError("アカウントを作れませんでした。時間をおいて、もう一度お試しください。");
    }

    const id = data.user.id;
    const { error: markError } = await service.rpc("admin_create_character", { p_admin: me.id, p_user: id, p_note: v.note });
    if (markError) {
      // 印の無い売手を残さない（作ったばかりで、まだ何も持っていない）。消せなければ、運営が片づけられる文を出す
      const left = await discardUnmarked(() => service.auth.admin.deleteUser(id), { id, nickname: v.nickname });
      if (left) throw new ActionError(left);
      adminThrowDb(markError);
    }
    refresh();

    // キャラはもうできている。ここから先が失敗しても作り直さず、一覧から作れるようにする
    const later = "キャラを作りました。ただし、パスワードを決めるリンクを作れませんでした。リンクはキャラの一覧から作り直せます。";
    const { data: count, error: countError } = await service.rpc("admin_character_link_issued", { p_admin: me.id, p_user: id });
    if (countError) {
      console.error("[character] リンクの回数を残せませんでした", dbCode(countError) ?? countError.code);
      return { ok: true, data: { id, url: null, count: 0 }, message: later };
    }
    const url = await passwordLink(service, v.email);
    if (!url) return { ok: true, data: { id, url: null, count: count ?? 1 }, message: later };
    return {
      ok: true,
      data: { id, url, count: count ?? 1 },
      message: "キャラを作りました。リンクを開いて、パスワードを決めてください。",
    };
  });
}

/* ───────────── パスワードを決めるリンク（作り直し） ───────────── */

/** リンクは戻り値で1回だけ渡す。新しく作ると、前に作ったリンクは使えなくなる */
export async function characterIssueLink(userId: unknown): Promise<ActionResult<{ url: string; count: number }>> {
  return runAction(async () => {
    const me = await begin();
    const id = parse(Id, userId);
    const service = createServiceClient();
    const { data: found, error: findError } = await service.auth.admin.getUserById(id);
    const email = found?.user?.email;
    if (findError || !email) throw new ActionError("この利用者が見つかりません。画面を読み込み直してください。");

    // 先に DB で「この道で作った・まだパスワードを決めていない・利用中」を確かめて回数を残す（ここで止まればリンクは作らない）
    const { data: count, error } = await service.rpc("admin_character_link_issued", { p_admin: me.id, p_user: id });
    if (error) {
      if (dbCode(error) === "bad_state") {
        throw new ActionError("このキャラは、もうパスワードが決まっています（ログイン画面の「パスワードを忘れた方」から変えられます）。");
      }
      adminThrowDb(error);
    }
    const url = await passwordLink(service, email);
    if (!url) throw new ActionError("リンクを作れませんでした。時間をおいて、もう一度お試しください。");
    refresh();
    return { ok: true, data: { url, count: count ?? 1 } };
  });
}
