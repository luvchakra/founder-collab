import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { BOARD_FILE, buildBrandAssets, findBands, findColumns, FIXED_FILES, MANIFEST_FILE, OUT_DIR, TILES } from "./build-brand-assets.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const APP_DIR = join(ROOT, "apps", "web", "app");

const built = await buildBrandAssets();
const logo = (key) => join(OUT_DIR, built.logos[key].file);
const meta = (path) => sharp(path).metadata();

/**
 * BRAND-03 / §32. Checked on what the assets *are* rather than byte-for-byte against a
 * fresh build: PNG palette encoding is not guaranteed identical across sharp builds.
 */
test("the manifest matches the files, and every render site goes through WonderArkLogo", async () => {
  assert.equal(readFileSync(MANIFEST_FILE, "utf8"), built.manifest, "the brand manifest is stale -- run `npm run build:brand`");
  for (const [key, entry] of Object.entries(built.logos)) {
    const { width, height } = await meta(logo(key));
    assert.match(entry.file, /^logo-[a-z-]+\.[0-9a-f]{10}\.png$/, `${key} should be content-addressed`);
    assert.match(built.manifest, new RegExp(`${key}: \\{ src: "/brand/${entry.file.replace(".", "\\.")}", width: ${width}, height: ${height} \\}`));
  }

  // One logo system (§7, "no duplicated SVG logo implementations"): every surface renders
  // the component, and none names a logo file or draws its own.
  for (const file of [
    "apps/web/components/marketing/navbar.tsx",
    "apps/web/components/marketing/footer.tsx",
    "apps/web/app/(auth)/layout.tsx",
    "apps/web/app/invite/[token]/page.tsx",
    "apps/web/app/(dashboard)/loading.tsx",
    "apps/web/app/platform/platform-shell.tsx",
    "packages/core/src/components/shell/app-sidebar.tsx",
  ]) {
    const source = readFileSync(join(ROOT, file), "utf8");
    assert.match(source, /<WonderArkLogo\b/, `${file} should render WonderArkLogo`);
    assert.doesNotMatch(source, /\/brand\/logo-|BRAND_LOGO/, `${file} names a logo file instead of using the component`);
  }
});

test("twins share one box, so the theme swap cannot shift the layout", async () => {
  for (const [a, b] of [
    ["primary", "primaryDark"],
    ["mark", "markOnDark"],
  ]) {
    const [x, y] = await Promise.all([meta(logo(a)), meta(logo(b))]);
    assert.deepEqual([x.width, x.height], [y.width, y.height], `${a} and ${b} differ in size`);
  }
});

test("logos are transparent to the corner", async () => {
  // A logo that ships the board's background paints a slab onto whatever surface it lands on.
  for (const key of Object.keys(built.logos)) {
    const { data, info } = await sharp(logo(key)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const corners = [0, (info.width - 1) * 4, (info.height - 1) * info.width * 4, ((info.height - 1) * info.width + info.width - 1) * 4];
    for (const at of corners) assert.equal(data[at + 3], 0, `${key} has an opaque corner`);
  }
});

test("lockups have the shape of what they claim to be", async () => {
  const ratio = async (key) => {
    const { width, height } = await meta(logo(key));
    return width / height;
  };
  // The mark is about twice as wide as tall (the W), the stacked lockups are squarish,
  // the horizontal lockup is long.
  assert.ok((await ratio("mark")) > 1.6 && (await ratio("mark")) < 2.5);
  assert.ok((await ratio("primary")) > 1.2 && (await ratio("primary")) < 2);
  assert.ok((await ratio("horizontal")) > 4);
  for (const key of ["mono", "gray"]) assert.ok((await ratio(key)) > 1.1 && (await ratio(key)) < 1.8, key);
});

test("the wedge is present in the mark (§1)", async () => {
  // The wedge sits in the W's lower central opening: ink at the bottom-centre of the mark,
  // with clear space directly above it before the W's centre peak. Probe that column.
  const { data, info } = await sharp(logo("mark")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const x = Math.floor(info.width / 2);
  const column = Array.from({ length: info.height }, (_, y) => data[(y * info.width + x) * 4 + 3]);
  const bottom = column.findLastIndex((a) => a > 96);
  assert.ok(bottom > info.height * 0.8, "no ink at the bottom-centre of the mark: the wedge is missing");
  assert.ok(column.slice(0, bottom).findLastIndex((a) => a < 32) > 0, "the wedge is not separate from the W");
});

test("every tile crop still lands on the board's artwork", async () => {
  // A brand-blue pixel near the middle of each crop: the rectangle holds the W, not the
  // board's background or a neighbouring panel.
  for (const [key, rect] of Object.entries(TILES)) {
    const { data, info } = await sharp(BOARD_FILE).extract(rect).raw().toBuffer({ resolveWithObject: true });
    let blue = 0;
    for (let i = 0; i < data.length; i += info.channels) if (data[i + 2] > 180 && data[i] < 90) blue += 1;
    assert.ok(blue > (info.width * info.height) / 50, `${key} holds no brand blue`);
  }
});

test("icons are the sizes each platform asks for, and opaque", async () => {
  for (const [key, size] of [
    ["favicon16", 16],
    ["favicon32", 32],
    ["favicon48", 48],
    ["favicon64", 64],
    ["appleIcon", 180],
    ["icon192", 192],
    ["icon512", 512],
  ]) {
    const file = join(OUT_DIR, FIXED_FILES[key]);
    const { width, height } = await meta(file);
    assert.deepEqual([width, height], [size, size], key);
    const { isOpaque } = await sharp(file).stats();
    assert.equal(isOpaque, true, `${key} must not be transparent`);
  }
  const og = await meta(join(APP_DIR, "opengraph-image.png"));
  assert.deepEqual([og.width, og.height], [TILES.darkPanel.width, TILES.darkPanel.height]);
});

test("findBands separates stacked pieces by clear rows", () => {
  const rows = [
    [2, 6],
    [9, 11],
    [14, 15],
  ];
  const distance = (x, y) => (x > 1 && x < 18 && rows.some(([a, b]) => y >= a && y <= b) ? 1 : 0);
  const bands = findBands(distance, 20, 20);
  assert.deepEqual(
    bands.map((b) => [b.top, b.bottom]),
    rows,
  );
  assert.deepEqual([bands[0].left, bands[0].right], [2, 17]);
});

test("findBands ignores a stray pixel", () => {
  const distance = (x, y) => (y === 5 && x === 3 ? 1 : 0);
  assert.equal(findBands(distance, 20, 20).length, 0);
});

test("findColumns separates the mark from the text", () => {
  const distance = (x) => ((x >= 1 && x <= 4) || (x >= 8 && x <= 15) ? 1 : 0);
  assert.deepEqual(findColumns(distance, 20, 0, 5), [
    { left: 1, right: 4 },
    { left: 8, right: 15 },
  ]);
});
