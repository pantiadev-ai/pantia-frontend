import type { NextConfig } from "next";

// CSP などの見出しは proxy.ts だけで付ける（ここに同じ名前の CSP を置くと、本番で nonce が付かなくなる。28 §B9）
const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // 画像は手元で 3.5MB 以下に縮めてから送る（components/ImageUploader.tsx）。本人確認は3枚まで1回で送るので、1枚あたり約1.2MB に縮める
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
