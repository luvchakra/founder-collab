import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  buildBrandAssets,
  extractMarkMask,
  findWordmarkBand,
  findLockupExtent,
  MANIFEST_FILE,
  OUT_DIR,
} from "./build-brand-assets.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const APP_DIR = join(ROOT, "apps", "web", "app");

const built = await buildBrandAssets();
const asset = (kind, variant) => join(OUT_DIR, built.variants.find((v) => v.variant === variant)[kind].file);

const meta = (path) => sharp(path).metadata();

/**
 * Checked on what the assets *are* rather than byte-for-byte against a fresh build: PNG
 * palette encoding is not guaranteed identical across sharp builds, so a byte comparison
 * would fail on someone else's machine for no reason anybody could act on. These are the
 * properties that actually break the UI when they regress.
 */
test("both variants of each asset are the same size, so swapping them cannot shift the layout", async () => {
  for (const kind of ["lockup", "mark"]) {
    const [onLight, onDark] = await Promise.all([meta(asset(kind, "on-light")), meta(asset(kind, "on-dark"))]);
    assert.equal(onLight.width, onDark.width, `${kind} variants differ in width`);
    assert.equal(onLight.height, onDark.height, `${kind} variants differ in height`);
  }
});

test("the manifest matches the files, and every render site reads it", async () => {
  // next/image reserves space from these numbers before the file loads, and the ?v= is
  // what stops an optimizer that has already cached the previous artwork from serving it
  // for hours. Both are facts about the files, so a component that copies either instead
  // of importing them is a bug waiting for the next brand change.
  assert.equal(
    readFileSync(MANIFEST_FILE, "utf8"),
    built.manifest,
    "the brand manifest is stale -- run `npm run build:brand`",
  );

  for (const [kind, key] of [
    ["lockup", "BRAND_LOCKUP"],
    ["mark", "BRAND_MARK"],
  ]) {
    const entry = built.variants.find((v) => v.variant === "on-light")[kind];
    const { width, height } = await meta(asset(kind, "on-light"));
    // The name carries a content hash, so new artwork is a new URL and no cache anywhere
    // can keep serving the old one.
    assert.match(entry.file, /\.[0-9a-f]{10}\.png$/, `${key} should be content-addressed`);
    assert.match(
      built.manifest,
      new RegExp(`${key}[\\s\\S]*?/brand/${entry.file}", width: ${width}, height: ${height}`),
      `${key} disagrees with the file it names`,
    );
  }

  for (const file of [
    "apps/web/components/marketing/navbar.tsx",
    "apps/web/components/marketing/footer.tsx",
    "apps/web/app/(auth)/layout.tsx",
    "packages/core/src/components/shell/logo-mark.tsx",
  ]) {
    const source = readFileSync(join(ROOT, file), "utf8");
    assert.match(source, /BRAND_(LOCKUP|MARK)/, `${file} should take its logo from the generated manifest`);
    assert.doesNotMatch(source, /src="\/(brand\/)?logo/, `${file} hardcodes a logo path, which cannot be cache-busted`);
  }
});

test("the lockup and the mark are transparent to the corner", async () => {
  // A logo that ships its master's background paints a pale slab onto whatever surface it
  // lands on -- the failure this whole pipeline exists to avoid.
  for (const file of ["lockup", "mark"].flatMap((kind) => [asset(kind, "on-light"), asset(kind, "on-dark")])) {
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const corners = [
      0,
      (info.width - 1) * 4,
      (info.height - 1) * info.width * 4,
      ((info.height - 1) * info.width + info.width - 1) * 4,
    ];
    for (const at of corners) assert.equal(data[at + 3], 0, `${file} has an opaque corner`);
  }
});

test("the icons are opaque, square and the sizes each platform asks for", async () => {
  const icon = await meta(join(APP_DIR, "icon.png"));
  assert.deepEqual([icon.width, icon.height], [512, 512]);
  const apple = await meta(join(APP_DIR, "apple-icon.png"));
  assert.deepEqual([apple.width, apple.height], [180, 180]);
  const og = await meta(join(APP_DIR, "opengraph-image.png"));
  assert.deepEqual([og.width, og.height], [1200, 630]);

  // Solid grounds, deliberately: a transparent app icon loses half the mark against dark
  // browser chrome, and a transparent card renders on whatever the client feels like.
  for (const file of ["icon.png", "apple-icon.png", "opengraph-image.png"]) {
    const { isOpaque } = await sharp(join(APP_DIR, file)).stats();
    assert.equal(isOpaque, true, `${file} must not be transparent`);
  }
});

test("the mark is the mark and nothing else", () => {
  assert.equal(built.variants.length, 2);
  for (const variant of built.variants) {
    // The W ribbon, the swoosh and the sparkle. A fourth shape means a letter of the
    // wordmark came along; fewer means part of the mark was cut away.
    assert.equal(variant.mark.shapes, 3, `${variant.variant} kept ${variant.mark.shapes} shapes, expected 3`);
    // Squarish, unlike the lockup it was taken out of.
    assert.ok(variant.mark.width / variant.mark.height < 2, "the mark should not be wordmark-shaped");
    assert.ok(variant.lockup.width / variant.lockup.height > 3, "the lockup should be wordmark-shaped");
  }
});

test("findWordmarkBand takes the lockup and leaves the tagline", () => {
  // Two bands of ink with clear space between them: the lockup, then the strapline.
  const rows = { lockup: [4, 9], tagline: [14, 17] };
  const distance = (x, y) =>
    (y >= rows.lockup[0] && y <= rows.lockup[1]) || (y >= rows.tagline[0] && y <= rows.tagline[1]) ? 1 : 0;
  const band = findWordmarkBand(distance, 20, 20, 0.5);
  assert.deepEqual([band.top, band.bottom], rows.lockup);
  assert.equal(band.bandCount, 2);
});

test("extractMarkMask drops the shape its slice cuts through", () => {
  // A 40-wide strip: a self-contained blob on the left (the mark) and a long one that runs
  // past the slice (the wordmark). Only the first should survive.
  const width = 40;
  const distance = (x, y) => {
    if (y < 2 || y > 6) return 0;
    if (x >= 2 && x <= 6) return 1; // the mark
    if (x >= 10 && x <= 38) return 1; // the wordmark, which the slice will cut
    return 0;
  };
  const band = { top: 0, bottom: 9 };
  const extent = findLockupExtent(distance, width, band, 0.5);
  const region = extractMarkMask(distance, band, extent, 0.5);

  assert.equal(region.shapes, 1);
  const kept = new Set();
  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) if (region.mask[y * region.width + x]) kept.add(region.left + x);
  }
  assert.deepEqual([...kept].sort((a, b) => a - b), [2, 3, 4, 5, 6]);
});

test("extractMarkMask refuses rather than emitting an empty mark", () => {
  // One shape spanning the whole lockup: there is no mark to separate, and silently
  // writing a blank PNG would be the worst outcome.
  const distance = (x, y) => (y >= 2 && y <= 6 ? 1 : 0);
  const band = { top: 0, bottom: 9 };
  const extent = findLockupExtent(distance, 40, band, 0.5);
  assert.throws(() => extractMarkMask(distance, band, extent, 0.5), /cut through every shape/);
});
