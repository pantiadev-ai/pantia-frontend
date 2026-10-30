/* 本人確認がまだの出品者に、つぶやきの投稿欄の代わりに出す案内（/tweets・/timeline・/mypage/tweets）。
   欄が無いだけだと「つぶやく所が無い」と思われるので、理由と次の一歩を出す。文は本人確認の状態で替える */
import Link from "next/link";
import type { KycStatus } from "@/lib/auth";

export default function PostKycGuide({ status, className }: { status: KycStatus; className?: string }) {
  const [text, link] =
    status === "pending"
      ? ["本人確認の結果が出ると、ここからつぶやけます。", "状況を見る →"]
      : status === "rejected"
        ? ["本人確認の書類を出し直すと、つぶやけるようになります。", "再提出する →"]
        : ["つぶやきの投稿には、本人確認（18歳以上の確認）が必要です。", "本人確認へ →"];
  return (
    <div className={className ? `pp-kyc-guide ${className}` : "pp-kyc-guide"} role="note">
      <p>{text}</p>
      <Link href="/kyc" className="tweet-act-btn">
        {link}
      </Link>
    </div>
  );
}
