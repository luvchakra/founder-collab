// GENERATED FILE -- do not edit by hand.
// Source: brand/wonderark-brand-board.png and brand/wonderark-mark.png. Regenerate with `npm run build:brand`.

export type BrandAsset = { src: string; width: number; height: number };

/** Every WonderArk logo: the supplied mark and lockups cropped from the approved brand board. */
export const BRAND_LOGO = {
  primary: { src: "/brand/logo-primary.3bbe8bbf5a.png", width: 1178, height: 800 },
  primaryDark: { src: "/brand/logo-primary-dark.1c073ae7e7.png", width: 1178, height: 800 },
  horizontal: { src: "/brand/logo-horizontal.23b891e702.png", width: 1431, height: 251 },
  mark: { src: "/brand/logo-mark.c4fc08ed1e.png", width: 964, height: 463 },
  markOnDark: { src: "/brand/logo-mark-on-dark.c4fc08ed1e.png", width: 964, height: 463 },
  mono: { src: "/brand/logo-mono.9a0e1576b6.png", width: 434, height: 321 },
  gray: { src: "/brand/logo-gray.67adb0e25a.png", width: 434, height: 321 },
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
export const BRAND_EMAIL_HEADER_SIZE = { width: 520, height: 105 } as const;
