/**
 * PLATFORM-P1-09.2 (Cookie / Consent Configuration), docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
 * §31: every cookie and browser-storage item the app sets, why, and how long it lasts. The
 * Privacy Policy's "Cookies" section and the Platform -> Legal page rest on this list, and
 * cookie-inventory.test.ts fails the build when code sets a name that isn't on it -- so
 * adding an analytics or marketing cookie forces the consent decision rather than slipping
 * in. A consent banner is needed only once something here is analytics or marketing.
 */

export type CookieCategory = "essential" | "preference" | "analytics" | "marketing";

export type StoredItem = {
  name: string;
  kind: "cookie" | "local storage";
  category: CookieCategory;
  purpose: string;
  lifetime: string;
};

export const COOKIE_INVENTORY: StoredItem[] = [
  { name: "sb-…-auth-token", kind: "cookie", category: "essential", purpose: "Keeps you signed in (Supabase Auth).", lifetime: "Until you sign out" },
  { name: "wa_pending_invite", kind: "cookie", category: "essential", purpose: "Carries an invitation through sign-in or sign-up.", lifetime: "1 day" },
  { name: "sidebar_state", kind: "cookie", category: "preference", purpose: "Whether you left the sidebar open or collapsed.", lifetime: "7 days" },
  { name: "theme", kind: "local storage", category: "preference", purpose: "Your light, dark or system theme.", lifetime: "Until cleared" },
  { name: "wonderark:install-banner", kind: "local storage", category: "preference", purpose: "That you installed the app or dismissed the install banner.", lifetime: "Until cleared" },
  { name: "cofounder-ai:read-alert-ids", kind: "local storage", category: "preference", purpose: "Which alerts you have already read.", lifetime: "Until cleared" },
  { name: "cofounderai:discovery-offering-focus", kind: "local storage", category: "preference", purpose: "The offering you last focused on in Discovery.", lifetime: "Until cleared" },
  { name: "cofounderai:nav-group-folds", kind: "local storage", category: "preference", purpose: "Which menu sections you collapsed.", lifetime: "Until cleared" },
  { name: "cofounderai:pinned-businesses", kind: "local storage", category: "preference", purpose: "Businesses you pinned in the switcher.", lifetime: "Until cleared" },
  { name: "cofounderai:selected-module", kind: "local storage", category: "preference", purpose: "The module you last opened.", lifetime: "Until cleared" },
];

/** Strictly necessary items and preferences a user set themselves need no consent banner;
 * analytics or marketing ones do. */
export function consentBannerRequired(items: StoredItem[] = COOKIE_INVENTORY): boolean {
  return items.some((i) => i.category === "analytics" || i.category === "marketing");
}
