import { BRAND_NAME } from "../lib/brand";
import { BRAND_ICON } from "./generated/assets";

/**
 * BRAND-02 / BRAND-06 / BRAND-07 (docs/plan/16-BRANDING-BACKLOG.md) -- the WonderArk
 * identity for the places CSS custom properties can't reach: browser metadata, the web
 * app manifest, email HTML, a payment provider's hosted checkout, the root error page
 * that renders without the stylesheet. Everything styled by CSS uses the `--brand-*`
 * tokens in ui-theme.css instead; these are the same colours as hex.
 */

export const BRAND_TAGLINE = "Business in One Place";

/** Canonical platform title (§17): "WonderArk — Business in One Place". */
export const BRAND_TITLE = `${BRAND_NAME} — ${BRAND_TAGLINE}`;

/** "{Page} | WonderArk" (§17), for Next's title template. */
export const BRAND_TITLE_TEMPLATE = `%s | ${BRAND_NAME}`;

export const BRAND_DESCRIPTION = `${BRAND_NAME} runs your whole business in one place — customer discovery, marketing, funding, inventory, field service, CRM and finance on one login.`;

/** The palette (§3) as hex, for non-CSS contexts only. */
export const BRAND_HEX = {
  navy: "#0B1F3B",
  blue: "#007BFF",
  /** Fill for controls carrying white text (5.33:1); #007BFF is the brand accent only. */
  blueAction: "#0067D9",
  cyan: "#00D1FF",
  lightBlue: "#5CDEFF",
  coolGray: "#E5EAF2",
  slate: "#64748B",
  dark: "#0F172A",
  white: "#FFFFFF",
} as const;

/** Browser / OS theme colour (§17). */
export const BRAND_THEME_COLOR = BRAND_HEX.navy;

/** Every favicon size (§15) plus the Apple touch icon, for Next's `metadata.icons`. */
export const BRAND_METADATA_ICONS = {
  icon: [
    { url: BRAND_ICON.favicon16, sizes: "16x16", type: "image/png" },
    { url: BRAND_ICON.favicon32, sizes: "32x32", type: "image/png" },
    { url: BRAND_ICON.favicon48, sizes: "48x48", type: "image/png" },
    { url: BRAND_ICON.favicon64, sizes: "64x64", type: "image/png" },
  ],
  apple: [{ url: BRAND_ICON.appleIcon, sizes: "180x180", type: "image/png" }],
};

/** The web app manifest's icons (§16): the brand board's light app icon at 192 and 512.
 * No maskable variant: the board's icon is a finished rounded tile, and a maskable icon
 * would need artwork the board does not include (a full-bleed ground). */
export const BRAND_MANIFEST_ICONS = [
  { src: BRAND_ICON.icon192, sizes: "192x192", type: "image/png", purpose: "any" },
  { src: BRAND_ICON.icon512, sizes: "512x512", type: "image/png", purpose: "any" },
] as const;
