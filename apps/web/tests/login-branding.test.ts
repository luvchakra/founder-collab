import { describe, expect, it } from "vitest";
// Relative import, not the `@/*` alias other app code uses: there's no vitest config here
// resolving tsconfig paths (menu-routes.test.ts, the only other test in this workspace,
// never needed one either), and adding one is more machinery than this one import needs.
import { backgroundStyleFor } from "../lib/login-branding";

describe("backgroundStyleFor (PLATFORM-P0-03.3 / PLATFORM-P0-03.5)", () => {
  it("returns undefined when there is no configured value, regardless of style", () => {
    expect(backgroundStyleFor("gradient", null)).toBeUndefined();
    expect(backgroundStyleFor("solid", null)).toBeUndefined();
    expect(backgroundStyleFor("image", null)).toBeUndefined();
  });

  it("builds a linear-gradient from two comma-separated hex colors", () => {
    expect(backgroundStyleFor("gradient", "#0f172a,#312e81")).toEqual({
      backgroundImage: "linear-gradient(160deg, #0f172a, #312e81)",
    });
  });

  it("returns undefined for a malformed gradient value (missing the second color)", () => {
    expect(backgroundStyleFor("gradient", "#0f172a")).toBeUndefined();
  });

  it("builds a flat background-color for a solid style", () => {
    expect(backgroundStyleFor("solid", "#0f172a")).toEqual({ backgroundColor: "#0f172a" });
  });

  it("builds a cover/centered background-image for an image style", () => {
    expect(backgroundStyleFor("image", "https://cdn.example.com/bg.jpg")).toEqual({
      backgroundImage: "url(https://cdn.example.com/bg.jpg)",
      backgroundSize: "cover",
      backgroundPosition: "center",
    });
  });

  it("returns undefined for an unrecognized style", () => {
    expect(backgroundStyleFor("video", "https://cdn.example.com/bg.mp4")).toBeUndefined();
  });
});
