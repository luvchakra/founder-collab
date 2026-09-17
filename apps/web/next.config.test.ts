/**
 * The workspace packages ship TypeScript/JSX source rather than a build step, so Next has
 * to transpile them — dropping one from this list breaks the build with an opaque parse
 * error in node_modules, which is worth one assertion.
 */
import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("next.config", () => {
  it("transpiles the workspace packages apps/web imports as source", () => {
    expect(nextConfig.transpilePackages).toEqual([
      "@cofounderai/core",
      "@cofounderai/module-registry",
    ]);
  });
});
