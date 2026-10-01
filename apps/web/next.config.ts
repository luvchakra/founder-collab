import type { NextConfig } from "next";
import { STATIC_SECURITY_HEADERS } from "@cofounderai/core/security/headers";

const nextConfig: NextConfig = {
  transpilePackages: ["@cofounderai/core", "@cofounderai/module-registry"],
  // Don't advertise the framework/version to scanners.
  poweredByHeader: false,
  // Per-request CSP (needs a nonce) is set by the proxy (packages/core/src/db/middleware.ts);
  // everything request-independent is set here so static assets get it too.
  async headers() {
    return [{ source: "/:path*", headers: STATIC_SECURITY_HEADERS }];
  },
};

export default nextConfig;
