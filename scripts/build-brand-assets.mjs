#!/usr/bin/env node
/**
 * Derives every WonderArk logo, icon and card the platform serves from ONE master: the
 * approved brand board, `brand/wonderark-brand-board.png`
 * (docs/plan/16-BRANDING-BACKLOG.md, BRAND-03).
 *
 * BRAND-01's audit found the previous identity (a swoosh-and-sparkle W, "Accelerate.
 * Revenue. Knowledge.") served from two raster masters through this script; both masters
 * are gone and this one board replaces them (docs/plan/16-BRANDING-BACKLOG.md §36).
 *
 * Nothing here draws a logo. Every pixel of every mark, wordmark and tagline is cut from
 * the board's own artwork, so the W, its wedge and its gradient are the approved ones
 * everywhere by construction — the spec's "one canonical geometry" rule (§1, §6) holds
 * because there is only one source. Only colour (for the monochrome marks), background,
 * arrangement and scale change between variants, which is exactly what §6 allows.
 *
 * Three panels of the board are used:
 *
 * - **Primary logo** (light ground) and **Logo on dark** (navy ground). Each is a stacked
 *   lockup — mark, then wordmark, then tagline — in three bands separated by clear space,
 *   so `findBands` splits each into its three pieces without any hardcoded coordinates
 *   inside the panel.
 * - **Horizontal logo**, which is measured rather than copied: its mark height, the gap to
 *   the wordmark and the wordmark and tagline sizes become ratios that the horizontal and
 *   inline lockups are composed with, from the larger stacked pieces. So both horizontal
 *   variants (light and dark) share the board's proportions and the sharper artwork.
 *
 * The board is a raster image, so the assets are PNGs rather than the SVGs the spec lists:
 * an SVG wrapping a bitmap would be a vector file in name only, and redrawing the mark as a
 * vector would be exactly the "separately drawn W" the spec forbids.
 *
 * `npm test` checks the committed assets against the properties that matter (transparent
 * corners, opaque icons, the sizes each platform asks for, the manifest agreeing with the
 * files and every render site reading it) rather than byte-for-byte: PNG palette encoding
 * is not guaranteed identical across sharp builds.
 *
 * Usage: `npm run build:brand` after replacing the board.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const BOARD_FILE = join(ROOT, "brand", "wonderark-brand-board.png");
const PUBLIC_DIR = join(ROOT, "apps", "web", "public");
/** Served at `/brand/…`. `npm run build:brand` empties it and writes the current set. */
export const OUT_DIR = join(PUBLIC_DIR, "brand");
const APP_DIR = join(ROOT, "apps", "web", "app");
export const MANIFEST_FILE = join(ROOT, "packages", "core", "src", "brand", "generated", "assets.ts");

/** The board's panels, inside their frames and below their captions. The artwork inside
 * each is located by measurement, so these only need to contain it with room to spare. */
const PANELS = {
  light: { left: 25, top: 60, width: 476, height: 350 },
  dark: { left: 535, top: 60, width: 413, height: 350 },
  horizontal: { left: 975, top: 50, width: 545, height: 160 },
};

/** The canonical palette (§3), for the generated grounds and the monochrome marks. */
const NAVY = { r: 0x0b, g: 0x1f, b: 0x3b };
const DARK = { r: 0x0f, g: 0x17, b: 0x2a };
const SLATE = { r: 0x64, g: 0x74, b: 0x8b };
const WHITE = { r: 255, g: 255, b: 255 };

/**
 * Below this distance from the panel background a pixel is background. The board is a
 * rendered image, so its flat grounds carry a little noise — measured at up to 0.016.
 */
const BACKGROUND_FLOOR = 0.03;
/** Ink this far from the background (or further) is fully opaque. Capped per piece at
 * 90% of the piece's own strongest ink, so the pale, thin tagline still keys solid. */
const MAX_INK_THRESHOLD = 0.6;

const PNG = { compressionLevel: 9, palette: true };

async function loadPanel(board, rect) {
  const { data, info } = await sharp(board).extract(rect).raw().toBuffer({ resolveWithObject: true });
  const bg = [data[0], data[1], data[2]];
  const distance = (x, y) => {
    const i = (y * info.width + x) * info.channels;
    return Math.max(Math.abs(data[i] - bg[0]), Math.abs(data[i + 1] - bg[1]), Math.abs(data[i + 2] - bg[2])) / 255;
  };
  return { data, width: info.width, height: info.height, channels: info.channels, distance };
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
 * One piece of the board (a band, padded by two pixels) keyed onto transparency.
 *
 * RGB is kept exactly as drawn and only alpha is computed: un-premultiplying the soft
 * edges needs the ink colour behind each pixel, which a rendered board does not carry.
 * Each piece is only ever shown on the kind of ground it was drawn on (light pieces on
 * light surfaces, dark on navy), so the edge blend already matches its destination.
 * `recolor` replaces RGB with one flat colour (the monochrome marks) and keeps the alpha.
 */
async function cutPiece(panel, band, recolor) {
  const pad = 2;
  const left = Math.max(0, band.left - pad);
  const top = Math.max(0, band.top - pad);
  const width = Math.min(panel.width, band.right + pad + 1) - left;
  const height = Math.min(panel.height, band.bottom + pad + 1) - top;

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
      const alpha = Math.max(0, Math.min(1, (d - BACKGROUND_FLOOR) / (threshold - BACKGROUND_FLOOR)));
      out[to] = recolor ? recolor.r : panel.data[from];
      out[to + 1] = recolor ? recolor.g : panel.data[from + 1];
      out[to + 2] = recolor ? recolor.b : panel.data[from + 2];
      out[to + 3] = Math.round(255 * alpha);
    }
  }
  const buffer = await sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
  return { buffer, width, height };
}

/** The three pieces of a stacked lockup panel, plus the lockup itself. */
async function readStackedPanel(board, rect, name) {
  const panel = await loadPanel(board, rect);
  const bands = findBands(panel.distance, panel.width, panel.height);
  if (bands.length !== 3) {
    throw new Error(`${name} panel: expected mark, wordmark and tagline bands, found ${bands.length}`);
  }
  const [markBand, wordmarkBand, taglineBand] = bands;
  const whole = {
    top: markBand.top,
    bottom: taglineBand.bottom,
    left: Math.min(...bands.map((b) => b.left)),
    right: Math.max(...bands.map((b) => b.right)),
  };
  return {
    mark: await cutPiece(panel, markBand),
    wordmark: await cutPiece(panel, wordmarkBand),
    tagline: await cutPiece(panel, taglineBand),
    stacked: await cutPiece(panel, whole),
    markIn: (color) => cutPiece(panel, markBand, color),
  };
}

/**
 * The board's horizontal lockup as ratios of its mark height: the gap to the text, and
 * the wordmark's and tagline's heights and offsets.
 */
export async function measureHorizontal(board = BOARD_FILE) {
  const panel = await loadPanel(board, PANELS.horizontal);
  const [lockup] = findBands(panel.distance, panel.width, panel.height);
  if (!lockup) throw new Error("horizontal panel: no artwork found");
  const columns = findColumns(panel.distance, panel.width, lockup.top, lockup.bottom);
  const mark = columns[0];
  const text = { left: columns[1].left, right: columns.at(-1).right };
  const textBands = findBands(
    (x, y) => panel.distance(x + text.left, y + lockup.top),
    text.right - text.left + 1,
    lockup.bottom - lockup.top + 1,
  );
  if (textBands.length !== 2) throw new Error(`horizontal panel: expected wordmark and tagline, found ${textBands.length}`);
  const [wordmark, tagline] = textBands;
  const h = lockup.bottom - lockup.top + 1;
  return {
    gap: (text.left - mark.right - 1) / h,
    wordmarkHeight: (wordmark.bottom - wordmark.top + 1) / h,
    wordmarkTop: wordmark.top / h,
    taglineHeight: (tagline.bottom - tagline.top + 1) / h,
    taglineTop: tagline.top / h,
    /** The tagline's left edge relative to the wordmark's, as a share of the wordmark's width. */
    taglineIndent: (tagline.left - wordmark.left) / (wordmark.right - wordmark.left + 1),
  };
}

const scaledTo = async (piece, height) => {
  const buffer = await sharp(piece.buffer).resize({ height, kernel: "lanczos3" }).png().toBuffer();
  const { width } = await sharp(buffer).metadata();
  return { buffer, width, height };
};

/**
 * Mark on the left, text on the right, in the board's horizontal proportions. The mark
 * is sized so the wordmark renders at its native resolution, never upscaled.
 */
async function composeHorizontal(pieces, ratios, withTagline) {
  const markHeight = Math.round(pieces.wordmark.height / ratios.wordmarkHeight);
  const mark = await scaledTo(pieces.mark, markHeight);
  const wordmark = await scaledTo(pieces.wordmark, Math.round(markHeight * ratios.wordmarkHeight));
  const gap = Math.round(markHeight * ratios.gap);
  const textLeft = mark.width + gap;

  const layers = [{ input: mark.buffer, left: 0, top: 0 }];
  let width = textLeft + wordmark.width;
  if (withTagline) {
    const tagline = await scaledTo(pieces.tagline, Math.max(1, Math.round(markHeight * ratios.taglineHeight)));
    const taglineLeft = textLeft + Math.round(wordmark.width * ratios.taglineIndent);
    layers.push({ input: wordmark.buffer, left: textLeft, top: Math.round(markHeight * ratios.wordmarkTop) });
    layers.push({ input: tagline.buffer, left: taglineLeft, top: Math.round(markHeight * ratios.taglineTop) });
    width = Math.max(width, taglineLeft + tagline.width);
  } else {
    // No tagline: the wordmark sits on the mark's vertical centre.
    layers.push({ input: wordmark.buffer, left: textLeft, top: Math.round((markHeight - wordmark.height) / 2) });
  }
  const buffer = await sharp({ create: { width, height: markHeight, channels: 4, background: { ...WHITE, alpha: 0 } } })
    .composite(layers)
    .png()
    .toBuffer();
  return { buffer, width, height: markHeight };
}

/** Both pieces at the larger one's height, then contained in one shared box. */
async function sameBox(a, b, position) {
  const height = Math.max(a.height, b.height);
  const [x, y] = await Promise.all([a, b].map((piece) => (piece.height === height ? piece : scaledTo(piece, height))));
  const width = Math.max(x.width, y.width);
  const fit = async (piece) => {
    const left = position === "left" ? 0 : Math.floor((width - piece.width) / 2);
    const buffer = await sharp({ create: { width, height, channels: 4, background: { ...WHITE, alpha: 0 } } })
      .composite([{ input: piece.buffer, left, top: 0 }])
      .png()
      .toBuffer();
    return { buffer, width, height };
  };
  return Promise.all([fit(x), fit(y)]);
}

/** A square icon: the mark centred on a solid ground, `share` of the width wide. */
async function squareIcon(mark, size, share, background, radius = 0) {
  const inner = await sharp(mark.buffer).resize({ width: Math.round(size * share), kernel: "lanczos3" }).png().toBuffer();
  const fill = `rgb(${background.r},${background.g},${background.b})`;
  const ground = await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="${fill}"/></svg>`,
    ),
  )
    .png()
    .toBuffer();
  return sharp(ground).composite([{ input: inner, gravity: "center" }]).png(PNG).toBuffer();
}

/** The mark alone on transparency, contained in a square — the browser tab. */
async function transparentSquare(mark, size) {
  return sharp(mark.buffer)
    .resize({ width: size, height: size, fit: "contain", background: { ...WHITE, alpha: 0 }, kernel: "lanczos3" })
    .png()
    .toBuffer();
}

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
  iconMaskable192: "icon-maskable-192.png",
  iconMaskable512: "icon-maskable-512.png",
  emailHeader: "email-header.png",
};

export async function buildBrandAssets() {
  const light = await readStackedPanel(BOARD_FILE, PANELS.light, "light");
  const dark = await readStackedPanel(BOARD_FILE, PANELS.dark, "dark");
  const ratios = await measureHorizontal(BOARD_FILE);

  const logos = {
    /** Stacked: mark, wordmark, tagline — for light surfaces. */
    primary: light.stacked,
    /** Stacked, for navy surfaces. */
    primaryDark: dark.stacked,
    /** Mark beside wordmark and tagline. */
    horizontal: await composeHorizontal(light, ratios, true),
    horizontalDark: await composeHorizontal(dark, ratios, true),
    /** Mark beside wordmark, no tagline — the shell and navbar, where a tagline would be
     * a few unreadable pixels. */
    inline: await composeHorizontal(light, ratios, false),
    inlineDark: await composeHorizontal(dark, ratios, false),
    /** The mark alone, as drawn for light surfaces. */
    mark: light.mark,
    /** The mark alone, as drawn for navy surfaces. */
    markOnDark: dark.mark,
    /** Monochrome (§25): the same mark, one colour. */
    markWhite: await light.markIn(WHITE),
    markMono: await light.markIn(DARK),
    markGray: await light.markIn(SLATE),
  };

  // The light and navy twins of each lockup are separate artwork, so their natural crops
  // differ by a few percent -- and `WonderArkLogo adaptive` swaps between them on the
  // theme, where a few percent is a logo that visibly jumps. One box per pair removes it.
  for (const [lightKey, darkKey, position] of [
    ["primary", "primaryDark", "centre"],
    ["horizontal", "horizontalDark", "left"],
    ["inline", "inlineDark", "left"],
    ["mark", "markOnDark", "centre"],
  ]) {
    [logos[lightKey], logos[darkKey]] = await sameBox(logos[lightKey], logos[darkKey], position);
  }

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

  // Browser tab: the mark on transparency, as the board's own tab mockup shows it.
  for (const size of [16, 32, 48, 64]) {
    writeFileSync(join(OUT_DIR, FIXED_FILES[`favicon${size}`]), await transparentSquare(light.mark, size));
  }
  // Home-screen and install icons: the board's light app icon — the mark on white. "any"
  // icons fill 72% of the width; maskable ones keep the whole mark (wedge included) well
  // inside the 80% safe circle every OS mask preserves.
  writeFileSync(join(OUT_DIR, FIXED_FILES.appleIcon), await squareIcon(light.mark, 180, 0.72, WHITE));
  writeFileSync(join(OUT_DIR, FIXED_FILES.icon192), await squareIcon(light.mark, 192, 0.72, WHITE, 40));
  writeFileSync(join(OUT_DIR, FIXED_FILES.icon512), await squareIcon(light.mark, 512, 0.72, WHITE, 108));
  writeFileSync(join(OUT_DIR, FIXED_FILES.iconMaskable192), await squareIcon(light.mark, 192, 0.6, WHITE));
  writeFileSync(join(OUT_DIR, FIXED_FILES.iconMaskable512), await squareIcon(light.mark, 512, 0.6, WHITE));

  // Transactional email header (§18): the horizontal lockup on white — opaque, because
  // several mail clients render transparent PNGs on their own dark grounds.
  const pad = 12;
  const email = await sharp({
    create: {
      width: logos.horizontal.width + pad * 2,
      height: logos.horizontal.height + pad * 2,
      channels: 4,
      background: { ...WHITE, alpha: 1 },
    },
  })
    .composite([{ input: logos.horizontal.buffer, left: pad, top: pad }])
    .png(PNG)
    .toBuffer();
  writeFileSync(join(OUT_DIR, FIXED_FILES.emailHeader), email);
  const emailSize = await sharp(email).metadata();

  // Link-preview card: the dark stacked lockup on navy. Next serves
  // app/opengraph-image.png as both the Open Graph and the Twitter card.
  const ogLockup = await sharp(dark.stacked.buffer).resize({ height: 360, kernel: "lanczos3" }).png().toBuffer();
  writeFileSync(
    join(APP_DIR, "opengraph-image.png"),
    await sharp({ create: { width: 1200, height: 630, channels: 4, background: { ...NAVY, alpha: 1 } } })
      .composite([{ input: ogLockup, gravity: "center" }])
      .png(PNG)
      .toBuffer(),
  );
  // Superseded by the explicit icon metadata in apps/web/app/layout.tsx, which lists every
  // favicon size and the Apple icon from here.
  for (const stale of ["icon.png", "apple-icon.png"]) rmSync(join(APP_DIR, stale), { force: true });

  mkdirSync(dirname(MANIFEST_FILE), { recursive: true });
  const manifest = renderManifest(written, { width: emailSize.width, height: emailSize.height });
  writeFileSync(MANIFEST_FILE, manifest);

  return { logos: written, ratios, manifest, served: readdirSync(OUT_DIR) };
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
// Source: brand/wonderark-brand-board.png. Regenerate with \`npm run build:brand\`.

export type BrandAsset = { src: string; width: number; height: number };

/** Every WonderArk logo, cut from the approved brand board. */
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
  console.log(`build:brand — ${served.length} files in apps/web/public/brand, plus app/opengraph-image.png 1200x630`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
