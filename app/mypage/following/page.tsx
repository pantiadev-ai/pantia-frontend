/* フォロー中の出品者の一覧（本人だけが見られる） */
import type { Metadata } from "next";
import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import MypageShell from "@/components/mypage/MypageShell";
import FollowingList from "@/components/mypage/FollowingList";
import { getFollowingSellers } from "@/components/mypage/data";

export const metadata: Metadata = { title: "フォロー中", robots: { index: false, follow: false } };

const LIMIT = 200;

export default async function FollowingPage() {
  const viewer = await requireViewer("/mypage/following");
  const rows = await getFollowingSellers(viewer.id, LIMIT);

  return (
    <MypageShell active="following">
      <div className="mp-section-head">
        <h1 className="mp-section-title">
          <span className="icon-pill">👥</span> フォロー中
        </h1>
      </div>
      {rows.length === 0 ? (
        <div className="mp-empty">
          フォローしている出品者は、まだいません。
          <br />
          <Link href="/sellers">出品者を探す →</Link>
        </div>
      ) : (
        <>
          <FollowingList rows={rows} />
          {rows.length >= LIMIT && <p className="mp-hint">新しくフォローした順に {LIMIT} 人まで出しています。</p>}
        </>
      )}
    </MypageShell>
  );
}
