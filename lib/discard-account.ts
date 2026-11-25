/* 管理画面で作ったばかりのアカウントを、次の段で失敗したときに消す後始末（キャラの作成・代理登録）。
   node:test から読むので、外の import を持たない。

   ユーザー管理の一覧はメールを出さず、ID か名前でしか探せないので、消せなかったときの文には、その2つを入れる。
   ボタンの名前は app/admin/users/[id]/page.tsx（「キャラにする」「⛔ 利用を停止」）に合わせる */

type RemoveResult = { error: { code?: string | undefined; status?: number | undefined } | null };
type Who = { id: string; nickname: string };

/** 消せたら true。消せなければ、記録に失敗の印（code・status・例外の名前。中身は出さない）を残して false */
export async function removeNewAccount(remove: () => Promise<RemoveResult>, tag: string): Promise<boolean> {
  let failure: unknown = null;
  try {
    const { error } = await remove();
    if (!error) return true;
    failure = error.code ?? error.status ?? "unknown";
  } catch (e) {
    failure = e instanceof Error ? e.name : "unknown";
  }
  console.error(`[${tag}] 作ったアカウントを消せませんでした`, failure);
  return false;
}

/** 代理登録の台帳（admin_proxy_register）に載せられなかったとき（lib/actions/proxy.ts）。
   消せたら null（もとの失敗の文を出す）。消せなければ、本人確認の済んでいない普通の利用者が残るので、止め方を返す。
   同じメールアドレスで代理登録をやり直すと「もう登録されています」で断られるので、その先も書く */
export async function discardUnregistered(remove: () => Promise<RemoveResult>, who: Who): Promise<string | null> {
  if (await removeNewAccount(remove, "proxy")) return null;
  return (
    `代理登録の台帳に載せられませんでした。作ったアカウント（ID: ${who.id}）も消せずに残っています。` +
    `ユーザー管理でこの ID か名前「${who.nickname}」を探し、「利用を停止」で止めてください` +
    `（同じメールアドレスでは代理登録をやり直せません。やり直すときは、Supabase の Authentication でこのアカウントを消してからにしてください）。`
  );
}
