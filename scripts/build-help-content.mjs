#!/usr/bin/env node
/**
 * Turns `docs/user-guides/*.md` into the typed content module the in-app Get Help pages
 * and the help assistant both read (`packages/core/src/help/generated/guides.ts`).
 *
 * The markdown stays the single source of truth -- it is what a person edits, reviews in
 * a diff, and reads on GitHub. Generating a committed TypeScript module from it means the
 * app never touches the filesystem at request time (nothing to trace into a serverless
 * bundle, nothing to go missing in a deployment), the section anchors the assistant links
 * to are the same ones the pages render, and `npm test` fails if the two drift apart --
 * see `packages/core/src/help/help-content.test.ts`, which re-runs this parse and
 * compares.
 *
 * Usage: `npm run build:help` after editing anything under docs/user-guides/.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const GUIDES_DIR = join(ROOT, "docs", "user-guides");
export const OUTPUT_FILE = join(ROOT, "packages", "core", "src", "help", "generated", "guides.ts");

/** `## 3. Businesses, offerings, and why` -> `businesses-offerings-and-why`.
 *
 * The leading "N." is dropped deliberately: it is presentation, and anchoring to it would
 * break every existing link the moment a section is inserted above. */
export function slugify(heading) {
  return heading
    .replace(/^\s*\d+[.)]\s*/, "")
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Strips the inline markdown a plain-text summary or search index has no use for. */
export function toPlainText(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>|#]/g, " ")
    .replace(/\s+/g, " ")
    // Stripping a code span or emphasis that ended a sentence leaves the space it stood
    // in before the full stop ("and code ."), which reads as a typo in a summary.
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

export function parseGuide(fileName, source) {
  const lines = source.split("\n");

  const titleIndex = lines.findIndex((line) => line.startsWith("# "));
  if (titleIndex === -1) throw new Error(`${fileName}: no level-1 heading`);
  const title = lines[titleIndex].slice(2).trim();

  const sections = [];
  let current = null;
  const intro = [];

  for (const line of lines.slice(titleIndex + 1)) {
    if (line.startsWith("## ")) {
      if (current) sections.push(current);
      const heading = line.slice(3).trim();
      current = { id: slugify(heading), heading, body: [] };
      continue;
    }
    (current ? current.body : intro).push(line);
  }
  if (current) sections.push(current);

  // Two sections that slugify the same would silently steal each other's anchor; a
  // numeric suffix keeps both reachable rather than one of them becoming unlinkable.
  const seen = new Map();
  for (const section of sections) {
    const count = seen.get(section.id) ?? 0;
    seen.set(section.id, count + 1);
    if (count > 0) section.id = `${section.id}-${count + 1}`;
  }

  // A guide that dives straight into its first section has no intro paragraph to take a
  // summary from; the first sentence of that section says what it is about just as well.
  const firstSentence = (markdown) => toPlainText(markdown).split(/(?<=\.)\s/)[0] ?? "";
  const summary = firstSentence(intro.join("\n")) || firstSentence(sections[0]?.body.join("\n") ?? "");

  return {
    slug: fileName.replace(/^\d+-/, "").replace(/\.md$/, ""),
    order: Number.parseInt(fileName.slice(0, 2), 10),
    title,
    summary,
    sections: sections.map((section) => ({
      id: section.id,
      heading: section.heading,
      body: section.body.join("\n").trim(),
    })),
  };
}

export function buildGuides() {
  return readdirSync(GUIDES_DIR)
    .filter((name) => /^\d\d-.+\.md$/.test(name))
    .sort()
    .map((name) => parseGuide(name, readFileSync(join(GUIDES_DIR, name), "utf8")));
}

export function renderModule(guides) {
  return `// GENERATED FILE -- do not edit by hand.
// Source: docs/user-guides/*.md. Regenerate with \`npm run build:help\`.
// The markdown is the thing to change; this module is only how the app reads it.

import type { HelpGuide } from "../types";

export const HELP_GUIDES: HelpGuide[] = ${JSON.stringify(guides, null, 2)};
`;
}

function main() {
  const guides = buildGuides();
  mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
  writeFileSync(OUTPUT_FILE, renderModule(guides));
  const sections = guides.reduce((total, guide) => total + guide.sections.length, 0);
  console.log(`build:help — ${guides.length} guide(s), ${sections} section(s) written.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
