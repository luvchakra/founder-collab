#!/usr/bin/env node
/**
 * Serves the approved WonderArk brand artwork as the platform's logo and icon files
 * (docs/plan/16-BRANDING-BACKLOG.md, BRAND-03). Two supplied masters:
 *
 * - `brand/wonderark-mark.png`: the W logomark on transparency, used as-is for the mark;
 * - `brand/wonderark-brand-board.png`: the approved brand board
 *   (`brand/wonderark-brand-board.pdf`) rendered at 4x (4608x3072), for everything else.
 *
 * Every other file is a crop of the board. Nothing is drawn, recoloured, composed or placed
 * on a generated background: the lockups, app icon and favicons are the board's own
 * artwork, cut out of the panel that shows them. The only processing is:
 *
 * - removing the panel's flat background from the lockups and marks (so they sit on the
 *   app's own surfaces), keeping every artwork pixel as drawn;
 * - resizing to the pixel sizes browsers ask for;
 * - padding a light/navy twin with transparency to its partner's size, so the theme swap
 *   in `WonderArkLogo adaptive` cannot shift the layout.
 *
 * BRAND-01's audit found the previous identity (a swoosh-and-sparkle W, "Accelerate.
 * Revenue. Knowledge.") served from two older masters through this script; both are gone.
 *
 * The masters are raster images, so the files are PNGs rather than the SVGs the spec
 * lists. The 512px app icon is enlarged from the board's ~320px tile.
 *
 * Usage: `npm run build:brand` after replacing a master. If the board PDF changes, render
 * it at 4x to the PNG and re-measure PANELS and TILES below.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const BOARD_FILE = join(ROOT, "brand", "wonderark-brand-board.png");
/** The supplied logomark on transparency. */
export const MARK_FILE = join(ROOT, "brand", "wonderark-mark.png");
const PUBLIC_DIR = join(ROOT, "apps", "web", "public");
/** Served at `/brand/…`. `npm run build:brand` empties it and writes the current set. */
export const OUT_DIR = join(PUBLIC_DIR, "brand");
const APP_DIR = join(ROOT, "apps", "web", "app");
export const MANIFEST_FILE = join(ROOT, "packages", "core", "src", "brand", "generated", "assets.ts");

/** Board panels holding a lockup on a flat ground, inside their frames and below their
 * captions. The artwork inside each is located by measurement. */
const PANELS = {
  /** "Primary logo": stacked, light ground. */
  light: { left: 69, top: 207, width: 1452, height: 1025 },
  /** "Logo on dark": stacked, navy ground. */
  dark: { left: 1613, top: 207, width: 1232, height: 1025 },
  /** "Horizontal logo". */
  horizontal: { left: 2938, top: 161, width: 1612, height: 449 },
  /** "Logo variations": full-colour, dark and grey lockups side by side. */
  variations: { left: 2868, top: 1440, width: 1682, height: 380 },
};

/**
 * Pieces of the board used exactly as drawn, background and all: the light app icon from
 * the "Logomark" panel, the favicon tiles from the "Favicon" panel, the "Logo on dark"
 * panel for link previews, and the horizontal lockup on its white ground for email.
 * Measured on the approved board; `npm test` checks each still holds the artwork.
 */
export const TILES = {
  appIconLight: { left: 3423, top: 843, width: 321, height: 321 },
  favicon256: { left: 1794, top: 2469, width: 336, height: 336 },
  favicon64: { left: 2220, top: 2532, width: 213, height: 213 },
  favicon32: { left: 2523, top: 2565, width: 144, height: 144 },
  favicon16: { left: 2763, top: 2577, width: 120, height: 120 },
  darkPanel: { left: 1601, top: 138, width: 1244, height: 1106 },
  horizontalOnWhite: { left: 2985, top: 230, width: 1545, height: 311 },
};

/**
 * Below this distance from the panel background a pixel is background. The board is a
 * rendered image, so its flat grounds carry a little noise — measured at up to 0.016. A
 * ground with a soft glow ("Logo on dark", up to 0.063) raises it to the glow's own
 * strength, measured on the empty rows above the artwork, so the glow is not kept as haze.
 */
const BACKGROUND_FLOOR = 0.03;
/** Ink this far from the background (or further) is fully opaque. Capped per piece at
 * 90% of the piece's own strongest ink, so the pale, thin tagline still keys solid. */
const MAX_INK_THRESHOLD = 0.6;

const PNG = { compressionLevel: 9, palette: true };
/** Served widths for pieces the board holds at 4x: the mark (from its 5184px master), the
 * link preview (Open Graph's 1200px) and the email header (shown at half, for 2x screens). */
export const MARK_WIDTH = 960;
export const OG_WIDTH = 1200;
export const EMAIL_HEADER_WIDTH = 520;
const CLEAR = { r: 255, g: 255, b: 255, alpha: 0 };

async function loadPanel(rect) {
  const { data, info } = await sharp(BOARD_FILE).extract(rect).raw().toBuffer({ resolveWithObject: true });
  const bg = [data[0], data[1], data[2]];
  const distance = (x, y) => {
    const i = (y * info.width + x) * info.channels;
    return Math.max(Math.abs(data[i] - bg[0]), Math.abs(data[i + 1] - bg[1]), Math.abs(data[i + 2] - bg[2])) / 255;
  };
  const panel = { data, width: info.width, height: info.height, channels: info.channels, distance };
  const [first] = findBands(distance, info.width, info.height);
  let ground = 0;
  for (let y = 0; y < (first?.top ?? 0) - 4; y++) for (let x = 0; x < info.width; x++) ground = Math.max(ground, distance(x, y));
  panel.floor = Math.max(BACKGROUND_FLOOR, ground + 0.01);
  return panel;
}

/**
 * The horizontal bands of ink in a region, top to bottom, each with its own left/right
 * extent. A band is a run of rows holding more than a couple of ink pixels (a stray pixel
 * is noise, not artwork).
 */
export function findBands(distance, width, height, threshold = 0.12) {
  const bands = [];
  let current = null;
  for (let y = 0; y < height; y++) {
    let n = 0;
    let left = width;
    let right = -1;
    for (let x = 0; x < width; x++) {
      if (distance(x, y) > threshold) {
        n += 1;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
    if (n > 2) {
      if (!current) current = { top: y, bottom: y, left, right };
      current.bottom = y;
      current.left = Math.min(current.left, left);
      current.right = Math.max(current.right, right);
    } else if (current) {
      bands.push(current);
      current = null;
    }
  }
  if (current) bands.push(current);
  return bands;
}

/** Same, by columns, within a set of rows. */
export function findColumns(distance, width, top, bottom, threshold = 0.12) {
  const columns = [];
  let current = null;
  for (let x = 0; x < width; x++) {
    let ink = false;
    for (let y = top; y <= bottom && !ink; y++) ink = distance(x, y) > threshold;
    if (ink) {
      if (!current) current = { left: x, right: x };
      current.right = x;
    } else if (current) {
      columns.push(current);
      current = null;
    }
  }
  if (current) columns.push(current);
  return columns;
}

/**
 * One region of a panel (padded by two pixels) with the panel's flat background made
 * transparent. RGB is kept exactly as drawn; only alpha is computed, from each pixel's
 * distance to the background. Each piece is shown on the kind of ground it was drawn on
 * (light pieces on light surfaces, navy on navy), so the soft edges already match.
 */
async function cutOut(panel, box) {
  const pad = 2;
  const left = Math.max(0, box.left - pad);
  const top = Math.max(0, box.top - pad);
  const width = Math.min(panel.width, box.right + pad + 1) - left;
  const height = Math.min(panel.height, box.bottom + pad + 1) - top;

  const levels = [];
  for (let y = top; y < top + height; y++) for (let x = left; x < left + width; x++) levels.push(panel.distance(x, y));
  levels.sort((a, b) => a - b);
  const threshold = Math.min(MAX_INK_THRESHOLD, 0.9 * levels[Math.floor(levels.length * 0.99)]);

  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = ((top + y) * panel.width + left + x) * panel.channels;
      const to = (y * width + x) * 4;
      const d = panel.distance(left + x, top + y);
      out[to] = panel.data[from];
      out[to + 1] = panel.data[from + 1];
      out[to + 2] = panel.data[from + 2];
      out[to + 3] = Math.round(255 * Math.max(0, Math.min(1, (d - panel.floor) / (threshold - panel.floor))));
    }
  }
  const buffer = await sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
  return { buffer, width, height };
}

/** A stacked panel's whole lockup: mark, wordmark and tagline. */
async function readStacked(rect, name) {
  const panel = await loadPanel(rect);
  const bands = findBands(panel.distance, panel.width, panel.height);
  if (bands.length !== 3) throw new Error(`${name} panel: expected mark, wordmark and tagline bands, found ${bands.length}`);
  const whole = {
    top: bands[0].top,
    bottom: bands[2].bottom,
    left: Math.min(...bands.map((b) => b.left)),
    right: Math.max(...bands.map((b) => b.right)),
  };
  return cutOut(panel, whole);
}

/** A panel holding one lockup. */
async function readSingle(rect, name) {
  const panel = await loadPanel(rect);
  const bands = findBands(panel.distance, panel.width, panel.height);
  if (bands.length !== 1) throw new Error(`${name} panel: expected one lockup, found ${bands.length}`);
  return cutOut(panel, bands[0]);
}

/** The variations panel's lockups, left to right (the thin divider rules are skipped). */
async function readVariations() {
  const panel = await loadPanel(PANELS.variations);
  // Letters a few pixels apart (the wordmark's "r" and "A" at 4x) belong to one lockup.
  const columns = findColumns(panel.distance, panel.width, 0, panel.height - 1)
    .reduce((merged, c) => {
      const last = merged.at(-1);
      if (last && c.left - last.right <= 8) last.right = c.right;
      else merged.push({ ...c });
      return merged;
    }, [])
    .filter((c) => c.right - c.left > 20);
  if (columns.length !== 3) throw new Error(`variations panel: expected three lockups, found ${columns.length}`);
  return Promise.all(
    columns.map((c) => {
      const width = c.right - c.left + 1;
      const [band] = findBands((x, y) => panel.distance(x + c.left, y), width, panel.height);
      const rows = findBands((x, y) => panel.distance(x + c.left, y), width, panel.height);
      return cutOut(panel, { left: c.left, right: c.right, top: band.top, bottom: rows.at(-1).bottom });
    }),
  );
}

/** A light/navy twin padded with transparency to one shared size (never scaled). */
async function sameBox(a, b) {
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  const fit = async (piece) => ({
    buffer: await sharp({ create: { width, height, channels: 4, background: CLEAR } })
      .composite([{ input: piece.buffer, left: Math.floor((width - piece.width) / 2), top: Math.floor((height - piece.height) / 2) }])
      .png()
      .toBuffer(),
    width,
    height,
  });
  return Promise.all([fit(a), fit(b)]);
}

const tile = (rect, size) =>
  sharp(BOARD_FILE).extract(rect).resize({ width: size, height: size, kernel: "lanczos3" }).png(PNG).toBuffer();

/** Content-addressed: new artwork is a new URL, so no image-optimizer cache can keep
 * serving the old one (Next keys its optimizer cache on the URL). */
function hashedName(name, buffer) {
  return `${name}.${createHash("sha256").update(buffer).digest("hex").slice(0, 10)}.png`;
}

/**
 * Logos the UI renders through `next/image` are content-addressed; icons and the email
 * header keep fixed names because something outside this build references them by name
 * (the web manifest, browsers' favicon caches, emails already sitting in inboxes).
 */
export const FIXED_FILES = {
  favicon16: "favicon-16.png",
  favicon32: "favicon-32.png",
  favicon48: "favicon-48.png",
  favicon64: "favicon-64.png",
  appleIcon: "apple-icon.png",
  icon192: "icon-192.png",
  icon512: "icon-512.png",
  emailHeader: "email-header.png",
};

export async function buildBrandAssets() {
  const light = await readStacked(PANELS.light, "light");
  const dark = await readStacked(PANELS.dark, "dark");
  const [, variationDark, variationGray] = await readVariations();

  const [primary, primaryDark] = await sameBox(light, dark);
  // The supplied logomark, for light and navy surfaces alike (the board draws the same W on
  // both), trimmed to its artwork, with the same two clear pixels every cut-out has.
  const resized = await sharp(MARK_FILE).trim().resize({ width: MARK_WIDTH, kernel: "lanczos3" }).png().toBuffer();
  const markBuffer = await sharp(resized).extend({ top: 2, bottom: 2, left: 2, right: 2, background: CLEAR }).png().toBuffer();
  const markMeta = await sharp(markBuffer).metadata();
  const mark = { buffer: markBuffer, width: markMeta.width, height: markMeta.height };
  const markOnDark = mark;
  const logos = {
    /** "Primary logo": stacked, for light surfaces. */
    primary,
    /** "Logo on dark": stacked, for navy surfaces. */
    primaryDark,
    /** "Horizontal logo". */
    horizontal: await readSingle(PANELS.horizontal, "horizontal"),
    /** The supplied logomark, for light surfaces. */
    mark,
    /** The same logomark, for navy surfaces. */
    markOnDark,
    /** "Logo variations": the dark and grey lockups. */
    mono: variationDark,
    gray: variationGray,
  };

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const kebab = (key) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  const written = {};
  for (const [key, piece] of Object.entries(logos)) {
    const buffer = await sharp(piece.buffer).png(PNG).toBuffer();
    const { width, height } = await sharp(buffer).metadata();
    const file = hashedName(`logo-${kebab(key)}`, buffer);
    writeFileSync(join(OUT_DIR, file), buffer);
    written[key] = { file, width, height };
  }

  // The board's own favicon tiles, each at the size it is labelled on the board (48px,
  // not on the board, from its 256px tile), and its light app icon for the home screen.
  writeFileSync(join(OUT_DIR, FIXED_FILES.favicon16), await tile(TILES.favicon16, 16));
  writeFileSync(join(OUT_DIR, FIXED_FILES.favicon32), await tile(TILES.favicon32, 32));
  writeFileSync(join(OUT_DIR, FIXED_FILES.favicon48), await tile(TILES.favicon256, 48));
  writeFileSync(join(OUT_DIR, FIXED_FILES.favicon64), await tile(TILES.favicon64, 64));
  writeFileSync(join(OUT_DIR, FIXED_FILES.appleIcon), await tile(TILES.appIconLight, 180));
  writeFileSync(join(OUT_DIR, FIXED_FILES.icon192), await tile(TILES.appIconLight, 192));
  writeFileSync(join(OUT_DIR, FIXED_FILES.icon512), await tile(TILES.appIconLight, 512));

  // Transactional email header (§18): the board's horizontal lockup on its own white.
  const email = await sharp(BOARD_FILE)
    .extract(TILES.horizontalOnWhite)
    .resize({ width: EMAIL_HEADER_WIDTH, kernel: "lanczos3" })
    .png(PNG)
    .toBuffer();
  const emailSize = await sharp(email).metadata();
  writeFileSync(join(OUT_DIR, FIXED_FILES.emailHeader), email);

  // Link previews: the board's "Logo on dark" panel. Next serves app/opengraph-image.png as
  // both the Open Graph and the Twitter image.
  writeFileSync(
    join(APP_DIR, "opengraph-image.png"),
    await sharp(BOARD_FILE).extract(TILES.darkPanel).resize({ width: OG_WIDTH, kernel: "lanczos3" }).png(PNG).toBuffer(),
  );
  // Superseded by the explicit icon metadata in apps/web/app/layout.tsx.
  for (const stale of ["icon.png", "apple-icon.png"]) rmSync(join(APP_DIR, stale), { force: true });

  mkdirSync(dirname(MANIFEST_FILE), { recursive: true });
  const manifest = renderManifest(written, emailSize);
  writeFileSync(MANIFEST_FILE, manifest);

  return { logos: written, manifest, served: readdirSync(OUT_DIR) };
}

/**
 * The one place the app learns where its logos are and how big they are — generated,
 * because both are facts about the files and a hand copy goes stale.
 */
function renderManifest(written, email) {
  const asset = ({ file, width, height }) => `{ src: "/brand/${file}", width: ${width}, height: ${height} }`;
  const logoLines = Object.entries(written)
    .map(([key, entry]) => `  ${key}: ${asset(entry)},`)
    .join("\n");
  const fixedLines = Object.entries(FIXED_FILES)
    .map(([key, file]) => `  ${key}: "/brand/${file}",`)
    .join("\n");

  return `// GENERATED FILE -- do not edit by hand.
// Source: brand/wonderark-brand-board.png and brand/wonderark-mark.png. Regenerate with \`npm run build:brand\`.

export type BrandAsset = { src: string; width: number; height: number };

/** Every WonderArk logo: the supplied mark and lockups cropped from the approved brand board. */
export const BRAND_LOGO = {
${logoLines}
} as const satisfies Record<string, BrandAsset>;

/** Fixed-name icons and the email header (FIXED_FILES in scripts/build-brand-assets.mjs). */
export const BRAND_ICON = {
${fixedLines}
} as const;

/** Intrinsic size of the email header, for its <img> width/height attributes. */
export const BRAND_EMAIL_HEADER_SIZE = { width: ${email.width}, height: ${email.height} } as const;
`;
}

async function main() {
  const { logos, served } = await buildBrandAssets();
  for (const [key, entry] of Object.entries(logos)) console.log(`build:brand — ${key}: ${entry.file} ${entry.width}x${entry.height}`);
  console.log(`build:brand — ${served.length} files in apps/web/public/brand, plus app/opengraph-image.png`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
