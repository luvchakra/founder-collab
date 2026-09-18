#!/usr/bin/env node
/**
 * Derives every logo asset the app serves from the two brand masters in `brand/`.
 *
 * The masters are flat PNGs of the full lockup — the WonderArk mark, the wordmark, and
 * the "Accelerate. Revenue. Knowledge." tagline — one drawn for a light background and
 * one for a dark one. They are genuinely two pieces of artwork, not one recoloured: the
 * light master's mark carries a navy underside that would vanish on a dark ground, and
 * the dark master's carries a white one that would vanish on a light ground.
 *
 * What the app actually needs is neither master as-is:
 *
 * - **The lockup without the tagline.** Every place the lockup appears renders it at 28px
 *   or 32px tall. Keeping the tagline there would shrink the wordmark to about 22px to
 *   make room for four unreadable pixels of strapline. The footer already sets the
 *   tagline as real text, where it can be read and selected.
 * - **The mark on its own**, for the navigation rail, where it sits beside the product
 *   name as an icon, and for the browser tab, where there is no room for a word.
 * - **A transparent background**, because the app's own surfaces are not the masters'
 *   backgrounds: the light theme is a soft grey-blue, not white, and the rail is its own
 *   navy.
 *
 * Both crops are measured from the artwork rather than hardcoded, so new masters with
 * different spacing still produce correct assets — see `findWordmarkBand` and
 * `extractMarkMask`.
 *
 * `npm test` checks the committed assets against the properties that matter (both
 * variants the same size, transparent to the corner, the mark holding exactly the mark's
 * three shapes, the components stating the intrinsic sizes the files really have) rather
 * than byte-for-byte against a fresh build: PNG palette encoding is not guaranteed
 * identical across sharp builds, and a byte check would fail on somebody else's machine
 * for no reason they could act on.
 *
 * Usage: `npm run build:brand` after replacing anything in `brand/`.
 */
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const BRAND_DIR = join(ROOT, "brand");
const PUBLIC_DIR = join(ROOT, "apps", "web", "public");
/** Served at `/brand/…`. Its own directory because every file in it is content-addressed
 * and disposable — `npm run build:brand` empties it and writes the current set. */
export const OUT_DIR = join(PUBLIC_DIR, "brand");
const APP_DIR = join(ROOT, "apps", "web", "app");
export const MANIFEST_FILE = join(ROOT, "packages", "core", "src", "brand", "generated", "assets.ts");

/**
 * How far from the background a pixel must be to count as solid ink, as a fraction of the
 * full channel range. Alpha ramps linearly up to it, so edge pixels stay soft.
 *
 * Measured from each master rather than guessed: it is the largest value that still
 * leaves the faintest solid ink — the grey tagline on the light master, the pale one on
 * the dark master — fully opaque. Too low and the anti-aliased edges go hard and chunky;
 * too high and the tagline renders semi-transparent.
 */
const SOURCES = [
  {
    file: "wonderark-on-light.png",
    /** Artwork drawn for a light background: navy wordmark, grey tagline. */
    variant: "on-light",
    inkThreshold: 0.5,
    lockup: "lockup-on-light",
    mark: "mark-on-light",
  },
  {
    file: "wonderark-on-dark.png",
    /** Artwork drawn for a dark background: white wordmark, pale tagline. */
    variant: "on-dark",
    inkThreshold: 0.75,
    lockup: "lockup-on-dark",
    mark: "mark-on-dark",
  },
];

/** Widths the lockup and mark are written at: comfortably above any size the UI asks for
 * (28-32px tall in the shell, larger on marketing pages) even on a 3x display. */
const LOCKUP_WIDTH = 1200;
const MARK_HEIGHT = 512;
/** The browser tab and the iOS home screen. */
const FAVICON_SIZE = 512;
const APPLE_ICON_SIZE = 180;
/** The card every link to this platform unfurls into, on the size every social and chat
 * client expects. */
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
/** Palette-encoded. A gradient logo with a soft alpha edge is exactly the case where full
 * truecolour PNG is wasteful: 256 colours are indistinguishable at any size this renders
 * at, and cut each file to roughly a third. */
const PNG = { compressionLevel: 9, palette: true };

/**
 * Below this distance from the background, a pixel is background.
 *
 * The masters are rendered images, not vector exports, so their flat backgrounds carry a
 * little noise — measured at up to 0.024 on the dark master. Without a floor, every one
 * of those pixels keys to an alpha of 4 to 9 instead of 0, which is invisible on its own
 * and very visible in bulk: the logo's whole bounding box shows as a faint lighter
 * rectangle once the palette encoder dithers it. 0.04 clears the measured noise with room
 * to spare and takes nothing off the artwork, whose faintest ink is an order of magnitude
 * further out.
 */
const BACKGROUND_FLOOR = 0.04;

function readPixels(raw, info) {
  const { width, channels } = info;
  const background = [raw[0], raw[1], raw[2]];
  /** Distance from the background, as a fraction of the channel range. */
  const distance = (x, y) => {
    const i = (y * width + x) * channels;
    return (
      Math.max(
        Math.abs(raw[i] - background[0]),
        Math.abs(raw[i + 1] - background[1]),
        Math.abs(raw[i + 2] - background[2]),
      ) / 255
    );
  };
  return { background, distance };
}

/**
 * The rows the wordmark occupies. The masters put the lockup and the tagline in two bands
 * separated by clear space, so the first band from the top is the lockup and everything
 * below it is strapline.
 */
export function findWordmarkBand(distance, width, height, inkThreshold) {
  const rowHasInk = (y) => {
    let n = 0;
    for (let x = 0; x < width; x++) if (distance(x, y) > inkThreshold * 0.2) n += 1;
    // A couple of stray pixels is noise in a rendered master, not a row of artwork.
    return n > 2;
  };

  const bands = [];
  let start = null;
  for (let y = 0; y < height; y++) {
    if (rowHasInk(y) && start === null) start = y;
    if (!rowHasInk(y) && start !== null) {
      bands.push([start, y - 1]);
      start = null;
    }
  }
  if (start !== null) bands.push([start, height - 1]);
  if (bands.length === 0) throw new Error("no artwork found in the master");
  return { top: bands[0][0], bottom: bands[0][1], bandCount: bands.length };
}

/** The columns the whole lockup occupies, within the wordmark's own rows. */
export function findLockupExtent(distance, width, band, inkThreshold) {
  const columnHasInk = (x) => {
    for (let y = band.top; y <= band.bottom; y++) if (distance(x, y) > inkThreshold * 0.2) return true;
    return false;
  };

  let left = 0;
  while (left < width && !columnHasInk(left)) left += 1;
  let right = width - 1;
  while (right > left && !columnHasInk(right)) right -= 1;
  if (right <= left) throw new Error("no artwork found in the lockup band");
  return { left, right };
}

/**
 * How far along the lockup to slice before separating the mark from the wordmark. A
 * generous third: wide enough to hold the whole mark including the sparkle, narrow enough
 * that it cuts through the first letter of the wordmark rather than clearing it.
 */
const MARK_SLICE = 0.32;

/**
 * Separates the mark from the wordmark.
 *
 * A column cut cannot do this, which is the whole problem: the sparkle's right point
 * reaches past the left edge of the "o", so every vertical line either clips the sparkle
 * or takes a crescent of the letter with it. What *is* true is that the glyphs are
 * separate shapes — nothing in the mark touches anything in the wordmark.
 *
 * So: slice off a generous third of the lockup, find the connected shapes inside it, and
 * drop every shape the slice cuts through. The mark's pieces (the W, the swoosh, the
 * sparkle) sit wholly inside the slice and survive; the letter the slice runs through
 * reaches the cut edge and is discarded whole. What is left is the mark, and only the
 * mark, regardless of how the two overlap horizontally.
 */
export function extractMarkMask(distance, band, extent, inkThreshold) {
  const x0 = extent.left;
  const x1 = Math.min(extent.right, Math.round(extent.left + (extent.right - extent.left) * MARK_SLICE));
  const w = x1 - x0 + 1;
  const h = band.bottom - band.top + 1;

  const ink = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (distance(x0 + x, band.top + y) > inkThreshold * 0.2) ink[y * w + x] = 1;
    }
  }

  // Label 8-connected shapes, iteratively rather than recursively: a logo stroke is
  // thousands of pixels long and a depth-first walk would blow the stack.
  const label = new Int32Array(w * h).fill(-1);
  const touchesCut = [];
  let next = 0;
  const stack = [];
  for (let start = 0; start < ink.length; start++) {
    if (!ink[start] || label[start] !== -1) continue;
    const id = next++;
    touchesCut.push(false);
    label[start] = id;
    stack.push(start);
    while (stack.length > 0) {
      const at = stack.pop();
      const ax = at % w;
      const ay = (at - ax) / w;
      if (ax === w - 1) touchesCut[id] = true;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = ax + dx;
          const ny = ay + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const to = ny * w + nx;
          if (ink[to] && label[to] === -1) {
            label[to] = id;
            stack.push(to);
          }
        }
      }
    }
  }

  const keep = new Uint8Array(w * h);
  const kept = new Set();
  for (let i = 0; i < ink.length; i++) {
    if (ink[i] && !touchesCut[label[i]]) {
      keep[i] = 1;
      kept.add(label[i]);
    }
  }
  if (kept.size === 0) throw new Error("the mark slice cut through every shape in it");

  return {
    mask: keep,
    left: x0,
    top: band.top,
    width: w,
    height: h,
    shapes: kept.size,
    // The whole lockup's own crop, carried alongside so both assets come from one measure.
    lockupLeft: extent.left,
    lockupWidth: extent.right - extent.left + 1,
  };
}

/**
 * Replaces the master's flat background with transparency.
 *
 * The RGB is left exactly as drawn and only the alpha is computed. Un-premultiplying the
 * edge pixels back to their "true" colour needs the ink colour behind each one, which we
 * do not have, and guessing it shifts the brand blues noticeably. Leaving the blend in
 * place costs nothing here because each variant is only ever rendered on the kind of
 * background it was drawn for, so the edge blend already matches its destination.
 */
async function keyOutBackground(source, inkThreshold) {
  const image = sharp(source);
  const { width, height } = await image.metadata();
  const { data: raw, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { distance } = readPixels(raw, info);

  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = (y * width + x) * info.channels;
      const to = (y * width + x) * 4;
      out[to] = raw[from];
      out[to + 1] = raw[from + 1];
      out[to + 2] = raw[from + 2];
      const d = distance(x, y);
      const ramp = (d - BACKGROUND_FLOOR) / (inkThreshold - BACKGROUND_FLOOR);
      out[to + 3] = Math.round(255 * Math.max(0, Math.min(1, ramp)));
    }
  }

  return { buffer: out, width, height, distance };
}

/** The mark alone, on transparency, at full source resolution. */
async function cutMark(buffer, rgba, region) {
  const { mask, left, top, width, height } = region;
  const source = await sharp(buffer, rgba)
    .extract({ left, top, width, height })
    .raw()
    .toBuffer();

  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    out[i * 4] = source[i * 4];
    out[i * 4 + 1] = source[i * 4 + 1];
    out[i * 4 + 2] = source[i * 4 + 2];
    // The shape mask decides what belongs to the mark; the keyed alpha keeps the edge
    // soft within it.
    out[i * 4 + 3] = mask[i] ? source[i * 4 + 3] : 0;
  }

  return sharp(out, { raw: { width, height, channels: 4 } }).trim({ threshold: 1 });
}

/** Everything measured from one master, before anything is written. */
async function prepareVariant(source) {
  const master = join(BRAND_DIR, source.file);
  const { buffer, width, height, distance } = await keyOutBackground(master, source.inkThreshold);
  const band = findWordmarkBand(distance, width, height, source.inkThreshold);
  const extent = findLockupExtent(distance, width, band, source.inkThreshold);
  const region = extractMarkMask(distance, band, extent, source.inkThreshold);
  const rgba = { raw: { width, height, channels: 4 } };

  const lockup = sharp(buffer, rgba).extract({
    left: extent.left,
    top: band.top,
    width: extent.right - extent.left + 1,
    height: band.bottom - band.top + 1,
  });
  const mark = await cutMark(buffer, rgba, region);

  return {
    source,
    buffer,
    rgba,
    region,
    lockupSize: await sharp(await lockup.png().toBuffer()).metadata(),
    markSize: await sharp(await mark.png().toBuffer()).metadata(),
  };
}

/**
 * Content-addressed filenames.
 *
 * Replacing an image at a path it has already been served from is the one change a cache
 * cannot see: Next's image optimizer keys on the URL, holds the result for its minimum
 * TTL, and keeps handing the old artwork to anyone who visited before. That is not
 * theoretical — it happened while this pipeline was being built, with the optimizer
 * serving a stale WebP of the previous logo for a URL whose PNG was already correct.
 *
 * Hashing the content into the *filename* makes new artwork a new URL, so there is nothing
 * to invalidate and nothing to wait out. In the name rather than a `?v=` query because
 * Next 16 rejects a query string on a local image unless `images.localPatterns` is
 * configured to allow it — a config entry to work around a problem the filename solves
 * outright.
 */
function hashedName(name, buffer) {
  return `${name}.${createHash("sha256").update(buffer).digest("hex").slice(0, 10)}.png`;
}

/** Contained, not stretched, into a shared box on transparency. */
function fitInto(pipeline, box) {
  return pipeline.resize({
    ...box,
    fit: "contain",
    position: "center",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
}

/**
 * Both variants of a given asset are written at identical dimensions.
 *
 * They are separate pieces of artwork, so their natural crops differ by a percent or two
 * — and the shell swaps between them on the theme, where a percent or two is a logo that
 * visibly jumps when someone toggles dark mode. One box for both removes that, and lets
 * the component state a single intrinsic size.
 */
async function writeAssets(prepared) {
  const lockupBox = {
    width: LOCKUP_WIDTH,
    height: Math.max(
      ...prepared.map((v) => Math.round((LOCKUP_WIDTH * v.lockupSize.height) / v.lockupSize.width)),
    ),
  };
  const markBox = {
    width: Math.max(...prepared.map((v) => Math.round((MARK_HEIGHT * v.markSize.width) / v.markSize.height))),
    height: MARK_HEIGHT,
  };

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const written = [];
  for (const variant of prepared) {
    const { buffer, rgba, region, source } = variant;
    const lockup = await fitInto(
      sharp(buffer, rgba).extract({
        left: region.lockupLeft,
        top: region.top,
        width: region.lockupWidth,
        height: region.height,
      }),
      lockupBox,
    )
      .png(PNG)
      .toBuffer();
    const lockupFile = hashedName(source.lockup, lockup);
    writeFileSync(join(OUT_DIR, lockupFile), lockup);

    const mark = await fitInto(await cutMark(buffer, rgba, region), markBox).png(PNG).toBuffer();
    const markFile = hashedName(source.mark, mark);
    writeFileSync(join(OUT_DIR, markFile), mark);

    written.push({
      variant: source.variant,
      lockup: { file: lockupFile, ...lockupBox },
      mark: { file: markFile, ...markBox, shapes: region.shapes },
      buffer,
      rgba,
      region,
    });
  }
  return written;
}

/**
 * The browser tab and the iOS home screen, both on the brand's own navy.
 *
 * Not transparent, deliberately: the mark carries a navy underside in one variant and
 * white in the other, so a transparent icon loses part of itself against whichever of
 * light or dark browser chrome it happens to land on. A solid ground is the one version
 * that reads everywhere, and it is what the tab strip shows anyway.
 */
async function buildIcons(darkVariant) {
  const { buffer, rgba, region } = darkVariant;
  const inset = Math.round(FAVICON_SIZE * 0.16);

  const mark = await (await cutMark(buffer, rgba, region))
    .resize({ width: FAVICON_SIZE - inset * 2, height: FAVICON_SIZE - inset * 2, fit: "inside" })
    // Encoded rather than left raw: the composite below needs a buffer sharp can read
    // back without being told its dimensions again.
    .png()
    .toBuffer();

  const icon = await sharp({
    create: {
      width: FAVICON_SIZE,
      height: FAVICON_SIZE,
      channels: 4,
      // The dark master's own background, so the icon and the artwork agree exactly.
      background: { r: 3, g: 25, b: 54, alpha: 1 },
    },
  })
    .composite([{ input: mark, gravity: "center" }])
    .png(PNG)
    .toBuffer();

  writeFileSync(join(APP_DIR, "icon.png"), icon);
  writeFileSync(
    join(APP_DIR, "apple-icon.png"),
    await sharp(icon).resize(APPLE_ICON_SIZE, APPLE_ICON_SIZE).png(PNG).toBuffer(),
  );

  // The link-preview card. Next serves `app/opengraph-image.png` as both the Open Graph
  // and Twitter card image with no metadata to write, so a link to the platform stops
  // unfurling as a bare URL.
  const lockup = await sharp(join(OUT_DIR, darkVariant.lockup.file))
    .resize({ width: Math.round(OG_WIDTH * 0.62) })
    .png()
    .toBuffer();
  writeFileSync(
    join(APP_DIR, "opengraph-image.png"),
    await sharp({
      create: { width: OG_WIDTH, height: OG_HEIGHT, channels: 4, background: { r: 3, g: 25, b: 54, alpha: 1 } },
    })
      .composite([{ input: lockup, gravity: "center" }])
      .png(PNG)
      .toBuffer(),
  );

  return { icon: FAVICON_SIZE, appleIcon: APPLE_ICON_SIZE, openGraph: `${OG_WIDTH}x${OG_HEIGHT}` };
}

/**
 * The one place the app learns where its logos are and how big they are.
 *
 * Generated rather than typed into each component: the paths carry a content hash that
 * changes whenever the artwork does, and `next/image` needs the intrinsic dimensions to
 * reserve space before the file loads — both are facts about the files, and a copy of a
 * fact goes stale.
 */
function renderManifest(variants) {
  const byVariant = Object.fromEntries(variants.map((variant) => [variant.variant, variant]));
  const asset = ({ file, width, height }) => `{ src: "/brand/${file}", width: ${width}, height: ${height} }`;

  return `// GENERATED FILE -- do not edit by hand.
// Source: brand/*.png. Regenerate with \`npm run build:brand\`.

export type BrandAsset = { src: string; width: number; height: number };

/** The full lockup -- mark and wordmark, no tagline. */
export const BRAND_LOCKUP: { onLight: BrandAsset; onDark: BrandAsset } = {
  onLight: ${asset(byVariant["on-light"].lockup)},
  onDark: ${asset(byVariant["on-dark"].lockup)},
};

/** The mark on its own. */
export const BRAND_MARK: { onLight: BrandAsset; onDark: BrandAsset } = {
  onLight: ${asset(byVariant["on-light"].mark)},
  onDark: ${asset(byVariant["on-dark"].mark)},
};
`;
}

export async function buildBrandAssets() {
  mkdirSync(PUBLIC_DIR, { recursive: true });
  const prepared = [];
  for (const source of SOURCES) prepared.push(await prepareVariant(source));
  const variants = await writeAssets(prepared);
  const icons = await buildIcons(variants.find((variant) => variant.variant === "on-dark"));

  mkdirSync(dirname(MANIFEST_FILE), { recursive: true });
  const manifest = renderManifest(variants);
  writeFileSync(MANIFEST_FILE, manifest);

  return { variants, icons, manifest };
}

async function main() {
  const { variants, icons } = await buildBrandAssets();
  for (const variant of variants) {
    console.log(
      `build:brand — ${variant.variant}: ${variant.lockup.file} ${variant.lockup.width}x${variant.lockup.height}, ` +
        `${variant.mark.file} ${variant.mark.width}x${variant.mark.height}`,
    );
  }
  console.log(
    `build:brand — icon.png ${icons.icon}px, apple-icon.png ${icons.appleIcon}px, ` +
      `opengraph-image.png ${icons.openGraph}`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
