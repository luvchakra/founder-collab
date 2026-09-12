import { describe, expect, it } from "vitest";
import { buildCrawlPlan, categorizeLink, extractPageLinks } from "./crawl-plan";

describe("extractPageLinks", () => {
  it("finds every label [url] annotation, using text after the nearest delimiter as the label", () => {
    const findings = "Welcome to our site. About Us [https://example.com/about] | Pricing [https://example.com/pricing]";
    expect(extractPageLinks(findings)).toEqual([
      { label: "About Us", url: "https://example.com/about" },
      { label: "Pricing", url: "https://example.com/pricing" },
    ]);
  });

  it("returns an empty array when there are no annotations (a provider-tool summary)", () => {
    expect(extractPageLinks("Just a plain narrative summary of the company, no links.")).toEqual([]);
  });

  it("caps a long, undelimited label to its last six words", () => {
    const findings = "one two three four five six seven eight [https://example.com/about]";
    expect(extractPageLinks(findings)).toEqual([{ label: "three four five six seven eight", url: "https://example.com/about" }]);
  });
});

describe("categorizeLink", () => {
  it("matches by URL path when the label is generic", () => {
    expect(categorizeLink({ label: "Learn more", url: "https://example.com/pricing" })).toBe("pricing");
  });

  it("matches by label when the path is opaque", () => {
    expect(categorizeLink({ label: "Case Studies", url: "https://example.com/p/123" })).toBe("case_studies");
  });

  it("falls back to other when nothing matches", () => {
    expect(categorizeLink({ label: "Careers", url: "https://example.com/careers" })).toBe("other");
  });

  it("prefers the higher-priority category on an ambiguous label", () => {
    // "products" outranks "services" in CATEGORY_PRIORITY.
    expect(categorizeLink({ label: "Products & Services", url: "https://example.com/offerings" })).toBe("products");
  });
});

describe("buildCrawlPlan", () => {
  const homepage = "https://example.com";

  it("returns an empty plan with no candidate links", () => {
    expect(buildCrawlPlan(homepage, [])).toEqual([]);
  });

  it("drops the homepage itself and off-domain links", () => {
    const links = [
      { label: "Home", url: "https://example.com" },
      { label: "Home", url: "https://example.com/" },
      { label: "Partner site", url: "https://partner.com/about" },
      { label: "About", url: "https://example.com/about" },
    ];
    expect(buildCrawlPlan(homepage, links)).toEqual([{ url: "https://example.com/about", category: "about" }]);
  });

  it("keeps at most one URL per category", () => {
    const links = [
      { label: "Products", url: "https://example.com/products" },
      { label: "Our Products", url: "https://example.com/products-2" },
    ];
    expect(buildCrawlPlan(homepage, links)).toEqual([{ url: "https://example.com/products", category: "products" }]);
  });

  it("deduplicates a query-string/trailing-slash variant of an already-planned URL", () => {
    const links = [
      { label: "About", url: "https://example.com/about" },
      { label: "About Us", url: "https://example.com/about/?utm_source=x" },
    ];
    expect(buildCrawlPlan(homepage, links)).toEqual([{ url: "https://example.com/about", category: "about" }]);
  });

  it("orders the plan by category priority, not link order", () => {
    const links = [
      { label: "Contact", url: "https://example.com/contact" },
      { label: "About", url: "https://example.com/about" },
      { label: "Pricing", url: "https://example.com/pricing" },
    ];
    expect(buildCrawlPlan(homepage, links).map((p) => p.category)).toEqual(["about", "pricing", "contact"]);
  });

  it("caps the plan at maxPages, dropping the lowest-priority categories first", () => {
    const links = [
      { label: "About", url: "https://example.com/about" },
      { label: "Products", url: "https://example.com/products" },
      { label: "Pricing", url: "https://example.com/pricing" },
      { label: "Careers", url: "https://example.com/careers" },
    ];
    const plan = buildCrawlPlan(homepage, links, 2);
    expect(plan).toEqual([
      { url: "https://example.com/about", category: "about" },
      { url: "https://example.com/products", category: "products" },
    ]);
  });
});
