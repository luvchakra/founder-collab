import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@cofounderai/core", "@cofounderai/module-registry"],
  // Every production deploy since F-1 (F-2 through F-5) has failed on Vercel with
  // "Module not found" for files that genuinely exist in the checkout and build fine
  // locally with a plain `npm run build --workspace=apps/web`, on the exact same
  // commit -- confirmed on this repo's Vercel project, which has Root Directory set to
  // `apps/web` (a sibling of `packages/*`, not their parent). Ruled out along the way:
  // a stale Turbopack/npm build cache (a from-scratch `npm ci` install still reproduced
  // it identically). The actual cause is Turbopack's own project-root detection
  // (`turbopack.root`, "only files above this directory can be resolved by turbopack"):
  // when `next build`'s cwd is a subdirectory of the real monorepo root, Turbopack must
  // be told the root explicitly in a workspace layout like this one, or it can pick a
  // root that excludes the sibling `packages/*` workspace packages entirely -- exactly
  // reproducing "can't resolve `@cofounderai/module-fsm/...`" for every subpath, on
  // every deploy, regardless of caching.
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
};

export default nextConfig;
