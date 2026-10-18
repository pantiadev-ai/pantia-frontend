/* ログインのあとに開く行き先を、このサイトの中だけに絞る（オープンリダイレクト対策）。

   next は URL に載ってくるので、誰でも書き換えられる。
   「/」で始まっていても、ブラウザが別のサイトとして開く形がある:
     //evil.com     … 先頭の「//」はホスト名の始まり
     /\evil.com     … ブラウザは「\」を「/」と読むので上と同じ
     /%5Cevil.com   … 符号化して隠したもの。ほどくと上と同じ
     /%09/evil.com  … タブや改行はブラウザが捨てるので「//」になる
   だから、ほどき切った形で「/ の次が / でも \ でもない」「\ と制御文字が無い」を確かめる。
   怪しいものは直さずに既定のページへ戻す（窓リノベPRO の safeNext と同じ考え）。

   ※ 検査（node --test）から直接読めるよう、ここには何も import しない。 */

const MAX_LENGTH = 2048;
/** 符号化を何重までほどくか。これより深く重ねてあるものは、わざとなので受け取らない */
const MAX_DECODE = 4;

/** 「/」1つで始まり、次の文字が「/」でも「\」でもない */
function startsWithSingleSlash(s: string): boolean {
  return s.charCodeAt(0) === 0x2f && s.charCodeAt(1) !== 0x2f && s.charCodeAt(1) !== 0x5c;
}

/** 「\」と制御文字（タブ・改行を含む）。ブラウザが読み替える・黙って捨てる文字 */
function hasForbiddenChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x1f || c === 0x7f || c === 0x5c) return true;
  }
  return false;
}

/** 開いてよい行き先ならそのまま、怪しければ fallback を返す */
export function safeNext(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || value === "" || value.length > MAX_LENGTH) return fallback;
  let current = value;
  for (let i = 0; i <= MAX_DECODE; i++) {
    if (!startsWithSingleSlash(current) || hasForbiddenChar(current)) return fallback;
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return fallback; // 壊れた符号化は受け取らない
    }
    // これ以上ほどけない＝確かめ終わった。渡された形のまま返す
    if (decoded === current) return value;
    current = decoded;
  }
  return fallback;
}
