import { createHash } from "node:crypto";
import { PRIVACY_INTRO, PRIVACY_SECTIONS, TERMS_INTRO, TERMS_SECTIONS } from "./legal-content";

/**
 * PLATFORM-P1-09.1: a SHA-256 of the text /terms and /privacy serve, stored with each
 * published version so the admin page can say whether the live text still matches the
 * active version. Server-only (node:crypto).
 */
export function legalContentHash(document: "terms" | "privacy"): string {
  const content = document === "terms" ? { intro: TERMS_INTRO, sections: TERMS_SECTIONS } : { intro: PRIVACY_INTRO, sections: PRIVACY_SECTIONS };
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}
