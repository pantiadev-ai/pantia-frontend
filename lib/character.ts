/* キャラ（運営で入れた売手）の決まりのうち、画面で使う物。
   node:test から読めるよう、import は持たない（相対パスだけ）。 */

export type CharacterCandidate = {
  role: string;
  status: string;
  /** 相手が管理者か */
  isAdmin: boolean;
  /** 相手が操作する管理者自身か */
  isSelf: boolean;
  /** もうキャラの印が付いているか */
  marked: boolean;
};

/** 「キャラにする」を出してよい相手か。DB の admin_mark_character と同じ条件（利用中の売手・管理者でも自分でもない・印がまだ無い） */
export function canMarkCharacter(c: CharacterCandidate): boolean {
  return c.role === "seller" && c.status === "active" && !c.isAdmin && !c.isSelf && !c.marked;
}
