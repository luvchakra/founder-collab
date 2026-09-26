/**
 * Outbound email is assembled by string concatenation into HTML, and every input is
 * founder- or prospect-supplied (brand name, body, website, reply-to). Escaping is
 * therefore the whole safety story for this file, so each interpolated field is tested
 * with markup in it rather than only the happy path.
 */
import { describe, expect, it } from "vitest";
import { renderEmailHtml, renderEmailText } from "./render";

const BASE = {
  brandName: "Acme",
  body: "Hello there",
  websiteUrl: null,
  replyToEmail: "founder@acme.com",
};

describe("renderEmailHtml", () => {
  it("renders the brand name, body and reply-to link", () => {
    const html = renderEmailHtml(BASE);

    expect(html).toContain("Acme");
    expect(html).toContain("Hello there");
    expect(html).toContain("mailto:founder@acme.com");
  });

  it("splits blank-line-separated blocks into separate paragraphs", () => {
    const html = renderEmailHtml({ ...BASE, body: "First para\n\nSecond para" });

    expect(html.match(/<p style="margin:0 0 16px/g)).toHaveLength(2);
    expect(html).toContain("First para");
    expect(html).toContain("Second para");
  });

  it("drops empty blocks rather than emitting empty paragraphs", () => {
    const html = renderEmailHtml({ ...BASE, body: "One\n\n\n\n   \n\nTwo" });

    expect(html.match(/<p style="margin:0 0 16px/g)).toHaveLength(2);
  });

  it("converts **bold** to <strong>", () => {
    const html = renderEmailHtml({ ...BASE, body: "A **bold** word" });

    expect(html).toContain("<strong>bold</strong>");
  });

  it("escapes HTML in the body instead of emitting it as markup", () => {
    const html = renderEmailHtml({ ...BASE, body: "<script>alert(1)</script>" });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes HTML inside a **bold** span too", () => {
    const html = renderEmailHtml({ ...BASE, body: "**<img src=x onerror=alert(1)>**" });

    expect(html).toContain("<strong>&lt;img");
    expect(html).not.toContain("<img src=x");
  });

  it("escapes the brand name, so it cannot break out of its span", () => {
    const html = renderEmailHtml({ ...BASE, brandName: '"><script>alert(1)</script>' });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&quot;&gt;&lt;script&gt;");
  });

  it("escapes the reply-to address, so it cannot break out of the href", () => {
    const html = renderEmailHtml({ ...BASE, replyToEmail: 'a@b.com" onmouseover="alert(1)' });

    expect(html).not.toContain('onmouseover="alert(1)"');
    expect(html).toContain("&quot;");
  });

  it("escapes the website URL in both the href and the visible text", () => {
    const html = renderEmailHtml({ ...BASE, websiteUrl: 'https://acme.com/"><b>x</b>' });

    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;");
  });

  it("strips the scheme from the website's visible text but keeps it in the href", () => {
    const html = renderEmailHtml({ ...BASE, websiteUrl: "https://acme.com" });

    expect(html).toContain('href="https://acme.com"');
    expect(html).toContain(">acme.com</a>");
  });

  it("omits the footer link entirely when no website is on file", () => {
    expect(renderEmailHtml({ ...BASE, websiteUrl: null })).not.toContain("<a href=\"http");
  });

  it("escapes ampersands without double-escaping the entities it just produced", () => {
    const html = renderEmailHtml({ ...BASE, brandName: "Ben & Jerry's" });

    expect(html).toContain("Ben &amp; Jerry&#39;s");
    expect(html).not.toContain("&amp;amp;");
  });

  it("BRAND-11: platform mail carries the canonical WonderArk header image, never a recreated logo", () => {
    const html = renderEmailHtml({ ...BASE, brandName: "WonderArk", platform: true });
    expect(html).toMatch(/<img src="https?:\/\/[^"]+\/brand\/email-header\.png"/);
    expect(html).toContain('alt="WonderArk — Business in One Place"');
    expect(html).toContain("background-color:#007BFF");
  });

  it("business mail keeps the business's own name and no WonderArk header (§19)", () => {
    const html = renderEmailHtml(BASE);
    expect(html).not.toContain("email-header.png");
    expect(html).toContain(BASE.brandName.replace(/&/g, "&amp;"));
  });
});

describe("renderEmailText", () => {
  it("strips ** markers rather than converting them", () => {
    expect(renderEmailText("A **bold** word")).toBe("A bold word");
  });

  it("leaves text with no markers untouched, including newlines", () => {
    expect(renderEmailText("Line one\n\nLine two")).toBe("Line one\n\nLine two");
  });

  it("strips every marker pair, non-greedily", () => {
    expect(renderEmailText("**one** and **two**")).toBe("one and two");
  });

  it("leaves an unmatched marker alone", () => {
    expect(renderEmailText("**unclosed")).toBe("**unclosed");
  });
});
