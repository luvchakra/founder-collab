import { describe, expect, it } from "vitest";
import { FAQ } from "./faq";
import { getGuide, getSection, listGuides, listSections, sectionHref } from "./guides";
import { searchHelp, stem, tokenize } from "./search";

// The generator itself, and the drift check that keeps this content in step with
// docs/user-guides, are tested in scripts/build-help-content.test.mjs -- next to the
// script, and able to import it without a TypeScript declaration for a .mjs file.
describe("generated help content", () => {
  it("has every guide, in reading order, each with sections", () => {
    const guides = listGuides();
    expect(guides.length).toBeGreaterThanOrEqual(6);
    expect(guides.map((guide) => guide.order)).toEqual([...guides.map((g) => g.order)].sort((a, b) => a - b));
    for (const guide of guides) {
      expect(guide.slug, `${guide.title} needs a slug`).toMatch(/^[a-z0-9-]+$/);
      expect(guide.summary.length, `${guide.slug} needs a summary`).toBeGreaterThan(20);
      expect(guide.sections.length, `${guide.slug} needs sections`).toBeGreaterThan(0);
    }
  });

  it("gives every section a unique, linkable id within its guide", () => {
    for (const guide of listGuides()) {
      const ids = guide.sections.map((section) => section.id);
      expect(new Set(ids).size, `${guide.slug} has duplicate section ids`).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("carries the Finance guide, not the pre-rename Compliance one", () => {
    const finance = getGuide("finance");
    expect(finance?.title).toContain("Finance");
    expect(getGuide("compliance-gst")).toBeUndefined();
  });
});

describe("FAQ", () => {
  it("points every answer at a section that actually exists", () => {
    for (const entry of FAQ) {
      const section = getSection(entry.guideSlug, entry.sectionId);
      expect(section, `FAQ "${entry.question}" links to a missing section: ${sectionHref(entry.guideSlug, entry.sectionId)}`).toBeDefined();
    }
  });

  it("asks a question and answers it in prose", () => {
    for (const entry of FAQ) {
      expect(entry.question.endsWith("?"), `"${entry.question}" should be a question`).toBe(true);
      expect(entry.answer.length).toBeGreaterThan(40);
    }
  });

  it("has no duplicate questions", () => {
    const questions = FAQ.map((entry) => entry.question.toLowerCase());
    expect(new Set(questions).size).toBe(questions.length);
  });
});

describe("searchHelp", () => {
  it("finds the section a real question is about", () => {
    const cases: Array<[string, string, string]> = [
      ["how do I reconcile my bank statement", "finance", "banking"],
      ["my balance sheet doesn't balance", "finance", "financial-reports"],
      ["how do I close an accounting period", "finance", "accounting-periods"],
      ["connect whatsapp", "crm", "connecting-a-channel-whatsapp-instagram-facebook"],
      ["what is an ideal customer profile", "discovery", "working-an-offering"],
      ["create an api key", "getting-started", "api-keys"],
    ];
    for (const [query, guideSlug, sectionId] of cases) {
      const results = searchHelp(query, 5);
      expect(
        results.some((r) => r.guideSlug === guideSlug && r.sectionId === sectionId),
        `"${query}" should reach ${guideSlug}#${sectionId}, got ${results.map((r) => `${r.guideSlug}#${r.sectionId}`).join(", ")}`,
      ).toBe(true);
    }
  });

  it("ranks the section named after the topic above one that merely mentions it", () => {
    const best = searchHelp("chart of accounts")[0];
    expect(best).toBeDefined();
    expect(best?.guideSlug).toBe("finance");
    expect(best?.sectionId).toBe("first-run-set-up-your-chart-of-accounts");
  });

  // "I have nothing on that" is a better answer than a confident wrong link.
  it("returns nothing rather than the least-bad section for an unrelated question", () => {
    expect(searchHelp("xyzzy plugh quantum walrus")).toEqual([]);
    expect(searchHelp("")).toEqual([]);
    expect(searchHelp("   the and of   ")).toEqual([]);
  });

  it("respects the limit", () => {
    expect(searchHelp("invoice", 3).length).toBeLessThanOrEqual(3);
  });

  it("folds the word endings that would otherwise split one topic in two", () => {
    expect(stem("invoices")).toBe("invoice");
    expect(stem("policies")).toBe("policy");
    // "accounting periods" and "accounts" should reach each other.
    expect(stem("accounting")).toBe("account");
    expect(stem("accounts")).toBe("account");
    expect(stem("reconciled")).toBe(stem("reconciling"));
    // Short words are left alone -- stemming "is" to "i" would match everything.
    expect(stem("is")).toBe("is");
  });

  it("drops filler words that say nothing about which section is wanted", () => {
    expect(tokenize("How do I do this?")).toEqual([]);
    expect(tokenize("how do I import products")).toEqual(["import", "products"]);
  });
});

describe("listSections", () => {
  it("keeps each section attached to the guide it came from", () => {
    const sections = listSections();
    expect(sections.length).toBeGreaterThan(40);
    for (const section of sections) {
      expect(getGuide(section.guideSlug)?.title).toBe(section.guideTitle);
    }
  });
});
