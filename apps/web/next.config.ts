import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@cofounderai/core", "@cofounderai/module-registry"],
  // Every production deploy since F-1 (F-2 through F-5) has failed on Vercel with
  // "Module not found" for files that genuinely exist in the checkout and build fine
  // locally -- confirmed via Vercel's own build logs, which show "Restored build cache
  // from previous deployment" reusing the last-successful (F-1) build's Turbopack
  // persistent cache every time, before any new file added in a later commit inside a
  // workspace-symlinked package (e.g. packages/module-fsm/src/lib/tags/) ever gets
  // resolved. Turbopack's build-time filesystem cache (on by default in Next.js 16) is
  // the culprit: it doesn't reliably invalidate across separate deployment machines when
  // new files land inside an npm-workspace-symlinked package but the lockfile itself is
  // unchanged. Disabling it trades a slightly slower Vercel build for correctness -- dev
  // (`next dev`)'s own filesystem cache is untouched.
  experimental: {
    turbopackFileSystemCacheForBuild: false,
  },
};

export default nextConfig;
