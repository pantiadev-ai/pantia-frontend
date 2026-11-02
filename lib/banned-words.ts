/* メッセージの禁止ワード（site_settings.banned_words）。管理画面の設定で、1行に1語で入れる。
   決まりは DB の banned_words_ok・banned_word_key（supabase/migrations/20261103000012_message_safety.sql）と同じ。
   画面（設定のフォーム）と server action の両方で使うので、server-only にはしない。 */

export const BANNED_WORD_MAX = 30;
export const BANNED_WORDS_MAX = 200;

/** 制御文字（改行・タブを含む）が入っているか。DB の [[:cntrl:]] と同じ範囲 */
function hasCtrl(s: string): boolean {
  for (const ch of s) {
    const n = ch.codePointAt(0) ?? 0;
    if (n < 0x20 || (n >= 0x7f && n <= 0x9f)) return true;
  }
  return false;
}

/** 比べるときの鍵（全角半角・大文字小文字・空白の違いを無くす）。DB の banned_word_key と同じ */
export function bannedWordKey(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

/** 入力欄の文字（1行に1語）を語の並びに。空の行は消し、同じ鍵の語は最初の1つだけ残す */
export function parseBannedWords(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const w = line.trim();
    const key = bannedWordKey(w);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

/** 並びが決まりに合わなければ、直し方の文を返す（合えば null） */
export function bannedWordsError(list: string[]): string | null {
  if (list.length > BANNED_WORDS_MAX) return `禁止ワードは${BANNED_WORDS_MAX}語までです。`;
  for (const w of list) {
    if (hasCtrl(w)) return "禁止ワードに使えない文字が入っています。";
    if (w !== w.trim() || bannedWordKey(w) === "") return "空白だけの禁止ワードは使えません。";
    if (Array.from(w).length > BANNED_WORD_MAX) return `禁止ワードは1語${BANNED_WORD_MAX}字までです。（${w.slice(0, 10)}…）`;
  }
  return null;
}
