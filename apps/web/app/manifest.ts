import type { MetadataRoute } from "next";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";
import {
  BRAND_DESCRIPTION,
  BRAND_HEX,
  BRAND_MANIFEST_ICONS,
  BRAND_THEME_COLOR,
  BRAND_TITLE,
} from "@cofounderai/core/brand/identity";

/** BRAND-06 -- the web app manifest (/manifest.webmanifest): install name, icons
 * (the W + wedge on white, "any" and maskable) and the brand navy theme colour. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND_TITLE,
    short_name: BRAND_NAME,
    description: BRAND_DESCRIPTION,
    start_url: "/dashboard",
    display: "standalone",
    background_color: BRAND_HEX.white,
    theme_color: BRAND_THEME_COLOR,
    icons: BRAND_MANIFEST_ICONS.map((icon) => ({ ...icon })),
  };
}
