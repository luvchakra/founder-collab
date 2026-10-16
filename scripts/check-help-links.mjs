#!/usr/bin/env node
/**
 * Fails when a help guide (docs/user-guides/*.md) links somewhere that doesn't exist: a guide
 * or section anchor that was renamed, or an app route that was removed. Run by
 * scripts/check-help-links.test.mjs in `npm run test:scripts` (every CI run), and by hand with
 * `node scripts/check-help-links.mjs`.
 *
 * Links must be written the way the in-app help renders them: `/help/<guide>#<section>`
 * for another guide, `#<section>` within the same guide, an app path such as
 * `/pricing`, or a full https:// or mailto: URL. A `./NN-guide.md` link works on GitHub but
 * goes nowhere in the app, so it is reported too.
 */
import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGuides } from "./build-help-content.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP_DIR = join(ROOT, "apps", "web", "app");

/** Every route the app serves, as path patterns: route groups dropped, `[x]` any segment,
 * `[...x]` / `[[...x]]` the rest of the path. */
export function appRoutes(dir = APP_DIR, prefix = []) {
  const routes = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name.startsWith("_") || name.startsWith("@")) continue;
      const segment = /^\(.*\)$/.test(name) ? null : name;
      routes.push(...appRoutes(full, segment ? [...prefix, segment] : prefix));
    } else if (/^(page|route)\.(t|j)sx?$/.test(name)) {
      routes.push(prefix);
    }
  }
  return routes;
}

function routeMatches(pattern, parts) {
  for (let i = 0; i < pattern.length; i++) {
    const seg = pattern[i];
    if (/^\[\[?\.\.\./.test(seg)) return seg.startsWith("[[") ? true : parts.length > i;
    if (i >= parts.length) return false;
    if (/^\[.+\]$/.test(seg)) continue;
    if (seg !== parts[i]) return false;
  }
  return pattern.length === parts.length;
}

/** Problems with the links in `guides`, as "<guide>: <link> -- <why>" strings. */
export function findBrokenHelpLinks(guides = buildGuides(), routes = appRoutes()) {
  const bySlug = new Map(guides.map((guide) => [guide.slug, new Set(guide.sections.map((s) => s.id))]));
  const problems = [];
  for (const guide of guides) {
    for (const section of guide.sections) {
      for (const [, href] of section.body.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)) {
        const report = (why) => problems.push(`${guide.slug}#${section.id}: ${href} -- ${why}`);
        if (/^(https?:|mailto:)/.test(href)) continue;
        if (/\.md(#|$)/.test(href)) {
          report("links a markdown file; use /help/<guide>#<section>");
          continue;
        }
        const [path, anchor] = href.split("#");
        if (path === "") {
          if (!bySlug.get(guide.slug).has(anchor)) report("no such section in this guide");
          continue;
        }
        const help = /^\/help(?:\/([a-z0-9-]+))?$/.exec(path);
        if (help) {
          const slug = help[1];
          if (slug && !bySlug.has(slug)) report("no such guide");
          else if (anchor && (!slug || !bySlug.get(slug).has(anchor))) report("no such section");
          continue;
        }
        if (!path.startsWith("/")) {
          report("not a link the help pages can open");
          continue;
        }
        const parts = path.split("?")[0].split("/").filter(Boolean);
        if (!routes.some((pattern) => routeMatches(pattern, parts))) report("no such page in the app");
      }
    }
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = findBrokenHelpLinks();
  if (problems.length) {
    console.error(`Broken links in the help guides:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log("Help guide links: all resolve.");
}
