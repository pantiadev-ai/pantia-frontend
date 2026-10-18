/* /robots.txt。ログインが要る画面と、管理・決済・API は検索に出さない */
import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";

/** 検索エンジンに回らせない場所（/api/ と /listings/ は依頼の一覧に足した物。仮） */
const PRIVATE_PATHS = ["/admin", "/mypage", "/messages", "/settings", "/kyc", "/checkout", "/cart", "/orders", "/payout", "/notifications", "/timeline", "/api/", "/listings/"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: PRIVATE_PATHS }],
    sitemap: `${publicEnv.siteUrl}/sitemap.xml`,
  };
}
