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
