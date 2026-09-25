/**
 * INT-02/INT-03 — the shared shapes for evidence and recommendations across Discovery's
 * Marketing and Funding (spec §33: every cross-domain insight shows its sources, time,
 * scope, confidence, and whether it was computed or generated).
 */

/** Where a fact or insight came from. */
export interface Evidence {
  kind: "record" | "url" | "user" | "ai";
  label: string;
  /** A record id, URL or other stable reference; null for plain user notes. */
  ref: string | null;
  observedAt: string | null;
}

/**
 * One recommendation or attention item. `origin: "rule"` items are computed by
 * deterministic code and carry no confidence; an `"ai"` item must carry its confidence and
 * evidence, and is only ever a suggestion.
 */
export interface Recommendation {
  key: string;
  severity: "high" | "medium" | "low";
  title: string;
  reason: string;
  data: string;
  action: string;
  /** Relative to the section root (e.g. `campaigns/<id>`). */
  href: string;
  source: string;
  origin?: "rule" | "ai";
  confidence?: number | null;
  evidence?: Evidence[];
  generatedAt?: string;
}
