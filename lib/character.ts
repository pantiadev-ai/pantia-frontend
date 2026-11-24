/* キャラ（運営で入れた売手）の決まりのうち、画面で使う物。
   node:test から読めるよう、import は持たない（相対パスだけ）。 */

export type CharacterCandidate = {
  role: string;
  status: string;
  /** 本人確認の状態（unsubmitted・pending・approved・rejected） */
  kycStatus: string;
  /** 運営が代理で登録した人か（proxy_registrations に行がある） */
  isProxy: boolean;
  /** 相手が管理者か */
  isAdmin: boolean;
  /** 相手が操作する管理者自身か */
  isSelf: boolean;
  /** もうキャラの印が付いているか */
  marked: boolean;
};

/** 「キャラにする」を出してよい相手か。DB の admin_mark_character と同じ条件
   （利用中の売手・本人確認が未提出か済み・代理登録でない・管理者でも自分でもない・印がまだ無い）。
   本人確認を出した人（審査中・却下）と代理登録の人は本物の売手なので、印を付けると書類なしで「確認済み」になってしまう */
export function canMarkCharacter(c: CharacterCandidate): boolean {
  return (
    c.role === "seller" &&
    c.status === "active" &&
    (c.kycStatus === "unsubmitted" || c.kycStatus === "approved") &&
    !c.isProxy &&
    !c.isAdmin &&
    !c.isSelf &&
    !c.marked
  );
}

/** 「キャラにする」を出さない理由（運営の画面に出す文）。出せる相手と、もう印がある相手は null。
   どれにも当たらないのに出せないときは、いちばん近い理由を返す（canMarkCharacter と同じ順に見る） */
export function characterBlockReason(c: CharacterCandidate): string | null {
  if (c.marked || canMarkCharacter(c)) return null;
  if (c.isSelf) return "自分自身はキャラにできません。";
  if (c.isAdmin) return "管理者はキャラにできません。";
  if (c.isProxy) return "代理登録の人は本人のアカウントなので、キャラにできません。キャラは「キャラ」の画面の「キャラを新しく作る」で作ってください。";
  if (c.role !== "seller") return "購入者はキャラにできません（キャラにできるのは売手だけです）。";
  if (c.status !== "active") return "利用を止めている人はキャラにできません。";
  return "本人確認を出した売手はキャラにできません。";
}

type RemoveResult = { error: { code?: string | undefined; status?: number | undefined } | null };

/** キャラの印を付けられなかったとき、作ったばかりのアカウントを消す（lib/actions/character.ts）。
   消せたら null（もとの失敗の文を出す）。消せなかったら、印の無い売手が残るので、運営が探して片づけられる文を返す。
   ユーザー管理の一覧はメールを出さず、ID か名前でしか探せないので、その2つを文に入れる */
export async function discardUnmarked(remove: () => Promise<RemoveResult>, who: { id: string; nickname: string }): Promise<string | null> {
  let failure: unknown = null;
  try {
    const { error } = await remove();
    if (!error) return null;
    failure = error.code ?? error.status ?? "unknown";
  } catch (e) {
    failure = e instanceof Error ? e.name : "unknown";
  }
  console.error("[character] 作ったアカウントを消せませんでした", failure);
  return (
    `キャラの印を付けられませんでした。作ったアカウント（ID: ${who.id}）も消せずに残っています。` +
    `ユーザー管理でこの ID か名前「${who.nickname}」を探し、「キャラにする」で印を付けるか、「利用を止める」で止めてください` +
    `（印を付けたときのパスワードは、ログイン画面の「パスワードを忘れた方」から決められます）。`
  );
}
