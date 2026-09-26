// GENERATED FILE -- do not edit by hand.
// Source: brand/wonderark-brand-board.png. Regenerate with `npm run build:brand`.

export type BrandAsset = { src: string; width: number; height: number };

/** Every WonderArk logo, cropped from the approved brand board. */
export const BRAND_LOGO = {
  primary: { src: "/brand/logo-primary.7f78a148e9.png", width: 394, height: 257 },
  primaryDark: { src: "/brand/logo-primary-dark.5b69703a02.png", width: 394, height: 257 },
  horizontal: { src: "/brand/logo-horizontal.b9f44b5eda.png", width: 465, height: 80 },
  mark: { src: "/brand/logo-mark.920d46a87c.png", width: 292, height: 144 },
  markOnDark: { src: "/brand/logo-mark-on-dark.1438798029.png", width: 292, height: 144 },
  mono: { src: "/brand/logo-mono.42a5cde98e.png", width: 142, height: 99 },
  gray: { src: "/brand/logo-gray.b7face3e71.png", width: 138, height: 98 },
} as const satisfies Record<string, BrandAsset>;

/** Fixed-name icons and the email header (FIXED_FILES in scripts/build-brand-assets.mjs). */
export const BRAND_ICON = {
  favicon16: "/brand/favicon-16.png",
  favicon32: "/brand/favicon-32.png",
  favicon48: "/brand/favicon-48.png",
  favicon64: "/brand/favicon-64.png",
  appleIcon: "/brand/apple-icon.png",
  icon192: "/brand/icon-192.png",
  icon512: "/brand/icon-512.png",
  emailHeader: "/brand/email-header.png",
} as const;

/** Intrinsic size of the email header, for its <img> width/height attributes. */
export const BRAND_EMAIL_HEADER_SIZE = { width: 495, height: 105 } as const;
