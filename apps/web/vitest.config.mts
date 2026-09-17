import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Mirrors the one path alias apps/web's tsconfig declares (`@/*` -> the app root). Next
 * resolves it from tsconfig; vitest does not, so without this any test that imports a
 * module through `@/` fails to resolve at transform time.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)).replace(/\/$/, ""),
    },
  },
});
