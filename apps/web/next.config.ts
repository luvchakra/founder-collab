import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@cofounderai/core", "@cofounderai/module-registry"],

  experimental: {
    // Server actions default to a 1 MB body, which refuses most real uploads (marketing
    // assets, data-room documents, job photos). Vercel itself caps request bodies at
    // 4.5 MB, so this matches that ceiling; the upload code checks its own, lower limit.
    serverActions: { bodySizeLimit: "4.5mb" },
  },

  async redirects() {
    return [
      {
        // The guides used to live behind the login, at /dashboard/help. Every link that
        // was shared or bookmarked while they did still has to land somewhere, including
        // deep links into a single section -- and now it lands there without a session.
        source: "/dashboard/help/:path*",
        destination: "/help/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
