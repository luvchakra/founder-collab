import { describe, expect, it } from "vitest";
import { RESERVED_BUSINESS_SLUGS, slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates a plain name", () => {
    expect(slugify("Aurora Home Services")).toBe("aurora-home-services");
  });

  it("collapses runs of non-alphanumeric characters into one hyphen", () => {
    expect(slugify("Wax & Garden, Co.")).toBe("wax-garden-co");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugify("-!Acme!-")).toBe("acme");
  });

  it("falls back to a non-empty placeholder for a name with no alphanumeric characters", () => {
    expect(slugify("!!!")).toBe("business");
  });

  it("matches core.business_settings.slug's own format CHECK constraint", () => {
    const cases = ["Aroma Adorn", "The Cosmic Aroma", "Red Tape Shoes", "123 Company", "  spaced  out  "];
    for (const name of cases) {
      expect(slugify(name)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
});

describe("RESERVED_BUSINESS_SLUGS", () => {
  it("includes every static top-level route the app owns", () => {
    for (const path of ["dashboard", "platform", "login", "signup", "onboarding", "auth", "api", "p"]) {
      expect(RESERVED_BUSINESS_SLUGS.has(path)).toBe(true);
    }
  });
});
