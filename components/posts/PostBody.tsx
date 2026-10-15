/* つぶやき・コメントの本文。改行はそのまま（CSS の pre-wrap）。
   ハッシュタグだけを /tweets?tag= へのリンクにする（拾い方は DB の posts_guard と同じ）。URL は自動リンクにしない。 */
import Link from "next/link";
import type { ReactNode } from "react";

// DB: [#＃]([^[:space:]#＃　、。！？!?,.]{1,30})
const TAG_RE = /[#＃]([^\s#＃　、。！？!?,.]{1,30})/g;

export default function PostBody({ text, className, tags = true }: { text: string; className: string; tags?: boolean }) {
  if (!tags) return <div className={className}>{text}</div>;
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TAG_RE)) {
    const at = m.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    const tag = m[1]!;
    parts.push(
      <Link key={`${at}-${tag}`} className="hashtag" href={`/tweets?tag=${encodeURIComponent(tag.toLowerCase())}`}>
        {m[0]}
      </Link>,
    );
    last = at + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <div className={className}>{parts}</div>;
}
