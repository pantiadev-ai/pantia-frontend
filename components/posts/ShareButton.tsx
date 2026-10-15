"use client";
/* つぶやきの URL を共有する（スマホは共有の画面、それ以外はコピー）。外の URL は取りに行かない */
import { useState } from "react";

export default function ShareButton({ postId, className }: { postId: string; className: string }) {
  const [done, setDone] = useState(false);

  async function share() {
    const url = `${window.location.origin}/tweets/${postId}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setDone(true);
      window.setTimeout(() => setDone(false), 2000);
    } catch {
      // 共有の画面を閉じた・コピーできない環境。何もしない
    }
  }

  return (
    <button type="button" className={className} onClick={share}>
      {done ? "✓ コピーしました" : "🔗 シェア"}
    </button>
  );
}
