/* フォロー中の出品者の行（マイページの先頭と /mypage/following で使う） */
import Link from "next/link";
import { FollowButton } from "@/components/ToggleButtons";
import { displayName, num, presence, ratingAvg } from "@/lib/format";
import { avatarImage } from "@/lib/storage";
import type { FollowingRow } from "./data";

export default function FollowingList({ rows }: { rows: FollowingRow[] }) {
  return (
    <div className="mp-user-list">
      {rows.map((r) => {
        const name = displayName(r.name);
        const img = avatarImage(r.avatarPath);
        const meta = [presence(r.lastSeenAt), `フォロワー ${num(r.followerCount)}`, `販売 ${num(r.salesCount)}`, `評価 ${ratingAvg(r.ratingSum, r.ratingCount)}`]
          .filter(Boolean)
          .join("・");
        return (
          <div className="mp-user-row" key={r.id}>
            <Link href={`/sellers/${r.id}`} className="mp-user-avatar" aria-label={name}>
              {img ? <img src={img} alt="" loading="lazy" /> : (Array.from(name)[0] ?? "♡")}
            </Link>
            <div className="mp-user-info">
              <Link href={`/sellers/${r.id}`} className="mp-user-name">
                {name}
              </Link>
              <div className="mp-user-meta">{meta}</div>
            </div>
            <FollowButton
              id={r.id}
              initial
              loggedIn
              className="mp-follow-btn"
              activeClassName="active"
              labels={["＋ フォロー", "フォロー中"]}
              ariaLabel={`${name}をフォロー`}
            />
          </div>
        );
      })}
    </div>
  );
}
