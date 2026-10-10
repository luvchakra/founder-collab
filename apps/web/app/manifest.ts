import type { MetadataRoute } from "next";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";
import { SITE_URL } from "@cofounderai/core/site";
import {
  BRAND_DESCRIPTION,
  BRAND_HEX,
  BRAND_MANIFEST_ICONS,
  BRAND_THEME_COLOR,
  BRAND_TITLE,
} from "@cofounderai/core/brand/identity";

/** BRAND-06 -- the web app manifest (/manifest.webmanifest): install name, icons
 * (the brand board's light app icon) and the brand navy theme colour.
 *
 * BRAND-13 adds what the install banner relies on: an explicit `id` (the value browsers
 * already derived from `start_url`, so existing installs keep their identity), `scope`,
 * and the manifest listing itself in `related_applications`, which is what lets
 * `navigator.getInstalledRelatedApps()` in a browser tab report that the app is already
 * installed on this device. `prefer_related_applications` stays false: the web app is the
 * app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard",
    name: BRAND_TITLE,
    short_name: BRAND_NAME,
    description: BRAND_DESCRIPTION,
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: BRAND_HEX.white,
    theme_color: BRAND_THEME_COLOR,
    icons: BRAND_MANIFEST_ICONS.map((icon) => ({ ...icon })),
    related_applications: [{ platform: "webapp", url: new URL("/manifest.webmanifest", SITE_URL).href }],
    prefer_related_applications: false,
  };
}
