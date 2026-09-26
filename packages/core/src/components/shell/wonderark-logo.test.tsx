import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BRAND_LOGO } from "../../brand/generated/assets";
import {
  WONDERARK_LOGO_ASSETS,
  WONDERARK_LOGO_HEIGHT,
  WonderArkLogo,
  type WonderArkLogoVariant,
} from "./wonderark-logo";

/** BRAND-04 / §32 -- variant rendering, canonical assets, accessibility. Not pixel tests. */
const VARIANTS = Object.keys(WONDERARK_LOGO_ASSETS) as WonderArkLogoVariant[];

const imgs = (html: string) => html.match(/<img\b[^>]*>/g) ?? [];

describe("WonderArkLogo", () => {
  it("offers every variant the spec names (§7)", () => {
    for (const v of ["primary", "dark", "horizontal", "mark", "mark-dark", "mono"]) {
      expect(VARIANTS).toContain(v);
    }
  });

  it("renders every variant from a crop of the brand board, never an inline drawing", () => {
    const canonical = new Set<string>(Object.values(BRAND_LOGO).map((a) => a.src));
    for (const variant of VARIANTS) {
      const html = renderToStaticMarkup(<WonderArkLogo variant={variant} />);
      expect(html).not.toMatch(/<svg|<path/);
      const [img] = imgs(html);
      expect(img).toBeDefined();
      const file = WONDERARK_LOGO_ASSETS[variant].src;
      expect(canonical.has(file)).toBe(true);
      // Served through next/image's optimizer, with the canonical file as its source.
      expect(img).toContain(`url=${encodeURIComponent(file)}`);
      expect(img).toContain(`data-logo-variant="${variant}"`);
    }
  });

  it("sizes by height per family and never distorts (width follows the artwork)", () => {
    const html = renderToStaticMarkup(<WonderArkLogo variant="horizontal" size="md" />);
    expect(html).toContain(WONDERARK_LOGO_HEIGHT.horizontal.md);
    expect(html).toContain("w-auto");
    for (const family of Object.values(WONDERARK_LOGO_HEIGHT)) {
      expect(Object.keys(family)).toEqual(["xs", "sm", "md", "lg", "xl"]);
    }
  });

  it('is announced as "WonderArk" by default and hidden when decorative (§30)', () => {
    expect(imgs(renderToStaticMarkup(<WonderArkLogo />))[0]).toContain('alt="WonderArk"');
    const decorative = imgs(renderToStaticMarkup(<WonderArkLogo decorative />))[0];
    expect(decorative).toContain('alt=""');
    expect(decorative).toContain('aria-hidden="true"');
  });

  it("adaptive renders the navy twin for the dark theme, hidden from assistive tech", () => {
    const html = renderToStaticMarkup(<WonderArkLogo variant="primary" adaptive />);
    const [light, dark] = imgs(html);
    expect(light).toContain('data-logo-variant="primary"');
    expect(light).toContain("dark:hidden");
    expect(dark).toContain('data-logo-variant="dark"');
    expect(dark).toContain("dark:block");
    expect(dark).toContain('alt=""');
  });

  it("twins share intrinsic dimensions, so the theme swap cannot shift layout", () => {
    for (const [a, b] of [
      ["primary", "dark"],
      ["mark", "mark-dark"],
    ] as const) {
      expect([WONDERARK_LOGO_ASSETS[a].width, WONDERARK_LOGO_ASSETS[a].height]).toEqual([
        WONDERARK_LOGO_ASSETS[b].width,
        WONDERARK_LOGO_ASSETS[b].height,
      ]);
    }
  });
});
