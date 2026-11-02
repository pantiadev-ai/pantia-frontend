"use client";
/* ログインの記録の心拍。ログイン中の画面（SiteHeader・チャットの頭・管理画面の枠）に置く。
   開いたとき、画面が見えている間の3分ごと、別のタブから戻ったときに touchLastSeen を呼ぶ。
   見えていない間は呼ばない。失敗しても画面には何も出さない（記録が少し遅れるだけ）。 */
import { useEffect } from "react";
import { touchLastSeen } from "@/lib/actions/presence";

const EVERY_MS = 3 * 60 * 1000;
// タイマーのずれで1回飛ばさないよう、少し早めでも呼ぶ（DB が3分に1回までに絞る）
const MIN_GAP_MS = EVERY_MS - 15 * 1000;

export default function Heartbeat() {
  useEffect(() => {
    let last = 0;
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - last < MIN_GAP_MS) return;
      last = now;
      touchLastSeen().catch(() => {});
    };
    beat();
    const timer = window.setInterval(beat, EVERY_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, []);
  return null;
}
