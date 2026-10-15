import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP, Plus_Jakarta_Sans } from "next/font/google";
import RevealOnScroll from "@/components/RevealOnScroll";
import SiteNotice from "@/components/SiteNotice";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import "./globals.css";

// デザイン見本の書体。Google から読まず、ビルドのときに取り込んで自分のサイトから配る（CSP で外のフォントを許さない）
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], weight: ["500", "700", "800"] });
const noto = Noto_Sans_JP({ variable: "--font-noto", subsets: ["latin"], weight: ["400", "500", "700", "900"], preload: false });

export const metadata: Metadata = {
  title: { default: `${SITE_NAME} - ${SITE_TAGLINE}`, template: `%s - ${SITE_NAME}` },
  description: "18歳以上・本人確認済みの方だけが使える、リユースインナーのフリマです。",
  // 18歳以上向けのサイト。検索結果に写真が出ないようにする
  robots: { index: true, follow: true, "max-image-preview": "none" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FF4B91" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${jakarta.variable} ${noto.variable}`}>
      <body>
        <SiteNotice />
        {children}
        <RevealOnScroll />
      </body>
    </html>
  );
}
