import type { Seniority } from "./types";

const C_LEVEL_PATTERNS = [
  /\bchief\b/,
  /\bceo\b/,
  /\bcto\b/,
  /\bcfo\b/,
  /\bcoo\b/,
  /\bciso\b/,
  /\bcio\b/,
  /\bpresident\b/,
  /\bfounder\b/,
  /\bowner\b/,
];
const VP_PATTERNS = [/\bvp\b/, /\bvice president\b/, /\bsvp\b/, /\bevp\b/];
const DIRECTOR_PATTERNS = [/\bdirector\b/, /\bhead of\b/];
const MANAGER_PATTERNS = [/\bmanager\b/, /\blead\b/, /\bsupervisor\b/];

function matchesAny(patterns: RegExp[], text: string): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * DISC-OFFER-P0-06.3: pure keyword classification of a real job title into a seniority
 * tier -- no AI call (CLAUDE.md dev principle #4). A missing title is honestly reported
 * as "unknown" rather than guessed at; any other real title that matches none of these
 * keywords is "individual_contributor" (the default working level) rather than
 * "unknown" -- there is a real title on file, just not one of the four more senior
 * patterns, which is itself informative.
 */
export function deriveSeniority(jobTitle: string | null): Seniority {
  if (!jobTitle || !jobTitle.trim()) return "unknown";
  const title = jobTitle.toLowerCase();
  // Checked before C-level: "Vice President" itself contains the word "president",
  // which would otherwise false-positive against the C-level pattern below.
  if (matchesAny(VP_PATTERNS, title)) return "vp";
  if (matchesAny(C_LEVEL_PATTERNS, title)) return "c_level";
  if (matchesAny(DIRECTOR_PATTERNS, title)) return "director";
  if (matchesAny(MANAGER_PATTERNS, title)) return "manager";
  return "individual_contributor";
}
