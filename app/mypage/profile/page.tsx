/* プロフィールの編集。本人の値は my_profile() で読む（本人だけの列を含む） */
import type { Metadata } from "next";
import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { avatarImage } from "@/lib/storage";
import MypageShell from "@/components/mypage/MypageShell";
import ProfileForm, { type ProfileInitial } from "@/components/mypage/ProfileForm";
import { getMyProfile } from "@/components/mypage/data";

export const metadata: Metadata = { title: "プロフィールの編集", robots: { index: false, follow: false } };

function image(path: string | null) {
  const url = avatarImage(path);
  return path && url ? { path, url } : null;
}

export default async function ProfilePage() {
  const viewer = await requireViewer("/mypage/profile");
  const me = await getMyProfile();
  const isSeller = viewer.role === "seller";

  const initial: ProfileInitial = {
    nickname: me?.nickname ?? viewer.nickname,
    bio: me?.bio ?? "",
    avatar: image(me?.avatar_path ?? null),
    cover: image(me?.cover_path ?? null),
    age: me?.age ?? null,
    occupation: me?.occupation ?? "",
    heightCm: me?.height_cm ?? null,
    bodyType: me?.body_type ?? null,
    shipEstimate: me?.ship_estimate ?? null,
    supportedOptions: me?.supported_options ?? [],
    ngNote: me?.ng_note ?? "",
    acceptMessages: me?.accept_messages ?? true,
  };

  return (
    <MypageShell active="profile">
      <div className="mp-section-head">
        <h1 className="mp-section-title">
          <span className="icon-pill">🌸</span> プロフィールの編集
        </h1>
        {isSeller && (
          <Link href={`/sellers/${viewer.id}`} className="mp-more">
            公開中のページを見る →
          </Link>
        )}
      </div>
      {!me ? (
        <div className="mp-empty">プロフィールを読み込めませんでした。時間をおいて、もう一度お試しください。</div>
      ) : (
        <ProfileForm isSeller={isSeller} initial={initial} />
      )}
    </MypageShell>
  );
}
