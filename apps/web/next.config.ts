import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@cofounderai/core", "@cofounderai/module-registry"],
};

export default nextConfig;
