/* 管理画面（/admin の下）の共通の読み込み。見た目は styles/admin.css（見本のまま）＋ admin-extra.css（足りない分）。
   外枠（メニュー・上の帯）は各ページが AdminShell で描く（/admin/mfa だけは外枠なし）。
   操作の結果の知らせの中身はここで持つ（ページを移っても消えないように。components/admin/Flash）。
   検索エンジンには出さない。 */
import type { Metadata } from "next";
import { FlashProvider } from "@/components/admin/Flash";
import "@/styles/admin.css";
import "./admin-extra.css";

export const metadata: Metadata = {
  title: { default: "管理画面", template: "%s｜管理画面" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <FlashProvider>{children}</FlashProvider>;
}
