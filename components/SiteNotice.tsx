/* 運営からのお知らせ・メンテナンス中の帯（管理画面の設定で出す）。全ページの一番上 */
import { getSettings } from "@/lib/settings";

export default async function SiteNotice() {
  const s = await getSettings();
  if (s.maintenance) {
    return (
      <div className="pt-banner danger" role="status">
        ただいまメンテナンス中です。新しい購入の手続きを一時的に止めています。
        {s.notice ? ` ${s.notice}` : ""}
      </div>
    );
  }
  if (!s.notice) return null;
  return (
    <div className="pt-banner" role="status">
      {s.notice}
    </div>
  );
}
