// GENERATED FILE -- do not edit by hand.
// Source: brand/wonderark-brand-board.png. Regenerate with `npm run build:brand`.

export type BrandAsset = { src: string; width: number; height: number };

/** Every WonderArk logo, cut from the approved brand board. */
export const BRAND_LOGO = {
  primary: { src: "/brand/logo-primary.7f78a148e9.png", width: 394, height: 257 },
  primaryDark: { src: "/brand/logo-primary-dark.13a4202a6e.png", width: 394, height: 257 },
  horizontal: { src: "/brand/logo-horizontal.5f1ffb71df.png", width: 621, height: 103 },
  horizontalDark: { src: "/brand/logo-horizontal-dark.36eb358e7b.png", width: 621, height: 103 },
  inline: { src: "/brand/logo-inline.08c6409898.png", width: 621, height: 103 },
  inlineDark: { src: "/brand/logo-inline-dark.76649e5895.png", width: 621, height: 103 },
  mark: { src: "/brand/logo-mark.920d46a87c.png", width: 292, height: 144 },
  markOnDark: { src: "/brand/logo-mark-on-dark.f171f86eeb.png", width: 292, height: 144 },
  markWhite: { src: "/brand/logo-mark-white.45339aef4b.png", width: 292, height: 144 },
  markMono: { src: "/brand/logo-mark-mono.88243f6db7.png", width: 292, height: 144 },
  markGray: { src: "/brand/logo-mark-gray.59d6cea1fc.png", width: 292, height: 144 },
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
  iconMaskable192: "/brand/icon-maskable-192.png",
  iconMaskable512: "/brand/icon-maskable-512.png",
  emailHeader: "/brand/email-header.png",
} as const;

/** Intrinsic size of the email header, for its <img> width/height attributes. */
export const BRAND_EMAIL_HEADER_SIZE = { width: 645, height: 127 } as const;
