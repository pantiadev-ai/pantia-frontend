/* /sitemap.xml。公開中の商品と、公開している出品者を、それぞれ最大5000件。
   ログインしていない人と同じ権限（anonClient）で読むので、フォロワー限定・非公開・本人確認前の物は入らない */
import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";
import { anonClient } from "@/lib/catalogue";

export const dynamic = "force-dynamic";

const MAX = 5000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = publicEnv.siteUrl;
  const now = new Date();
  const supabase = anonClient();

  const [listings, sellers] = await Promise.all([
    supabase
      .from("listings")
      .select("id, updated_at")
      .eq("status", "published")
      .eq("followers_only", false)
      .order("updated_at", { ascending: false })
      .limit(MAX),
    supabase
      .from("profiles")
      .select("id")
      .eq("role", "seller")
      .eq("status", "active")
      .eq("kyc_status", "approved")
      .not("public_name", "is", null)
      .order("follower_count", { ascending: false })
      .order("id")
      .limit(MAX),
  ]);
  if (listings.error) console.error("[sitemap] listings", listings.error.message);
  if (sellers.error) console.error("[sitemap] sellers", sellers.error.message);

  const fixed: MetadataRoute.Sitemap = [
    { url: `${site}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${site}/items`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${site}/sellers`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${site}/ranking`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${site}/tweets`, lastModified: now, changeFrequency: "hourly", priority: 0.6 },
  ];

  const items: MetadataRoute.Sitemap = (listings.data ?? []).map((l) => ({
    url: `${site}/items/${l.id}`,
    lastModified: new Date(l.updated_at),
    changeFrequency: "daily",
    priority: 0.7,
  }));

  const people: MetadataRoute.Sitemap = (sellers.data ?? []).map((p) => ({
    url: `${site}/sellers/${p.id}`,
    changeFrequency: "daily",
    priority: 0.6,
  }));

  return [...fixed, ...items, ...people];
}
