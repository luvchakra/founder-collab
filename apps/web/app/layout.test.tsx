/**
 * The root layout is asserted as a React element rather than rendered: it *is* the
 * document (<html>/<head>/<body>), which cannot be mounted inside jsdom's existing one.
 * What matters here is that the theme script sits in <head> — it has to run before first
 * paint to avoid a light-mode flash — and that metadataBase is resolved from SITE_URL so
 * canonical and Open Graph URLs are absolute.
 */
import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));
vi.mock("./globals.css", () => ({}));

const { default: RootLayout, metadata } = await import("./layout");

/** Every element in the tree, depth-first, so a child can be located by its type name. */
function walk(node: unknown, seen: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, seen);
    return seen;
  }
  if (!node || typeof node !== "object" || !("props" in node)) return seen;
  const element = node as ReactElement<{ children?: unknown }>;
  seen.push(element);
  walk(element.props?.children, seen);
  return seen;
}

const typeName = (element: ReactElement) =>
  typeof element.type === "string" ? element.type : (element.type as { name?: string }).name;

describe("RootLayout metadata", () => {
  it("resolves relative metadata against the configured site URL", () => {
    expect(metadata.metadataBase).toBeInstanceOf(URL);
    expect((metadata.metadataBase as URL).origin).toBe(
      new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").origin,
    );
  });

  it("titles child pages through a template", () => {
    expect(metadata.title).toEqual({
      default: "CoFounderAI Platform",
      template: "%s — CoFounderAI",
    });
    expect(metadata.description).toContain("one portal");
  });
});

describe("RootLayout structure", () => {
  const tree = walk(RootLayout({ children: "page" }));
  const html = tree[0]!;

  it("declares the document language and suppresses the theme hydration warning", () => {
    expect(typeName(html)).toBe("html");
    const props = html.props as { lang: string; suppressHydrationWarning: boolean; className: string };
    expect(props.lang).toBe("en");
    // the theme script mutates <html> before React hydrates; without this, that is a mismatch
    expect(props.suppressHydrationWarning).toBe(true);
    expect(props.className).toContain("--font-geist-sans");
  });

  it("puts the theme script in <head>, ahead of the body", () => {
    const head = tree.find((element) => typeName(element) === "head")!;
    expect(walk(head).map(typeName)).toContain("ThemeScript");
  });

  it("wraps the page in the theme provider and the navigation progress bar", () => {
    const names = tree.map(typeName);
    expect(names).toContain("ThemeProvider");
    expect(names).toContain("TopProgressBar");
  });
});
