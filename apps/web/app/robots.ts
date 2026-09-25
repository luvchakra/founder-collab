import type { MetadataRoute } from "next";
import { SITE_URL } from "@cofounderai/core/site";

/**
 * Crawlers may index the public site -- the landing page, pricing, the legal pages and the
 * help guides -- and nothing else. Everything behind a login is disallowed by prefix where
 * it has one; a business's own pages live under its slug (/acme-hvac/...), which no crawler
 * can reach anyway since every such route redirects an anonymous visitor to /login. The
 * one-off public token pages under /p/ (estimates, invoices, data-room links) are
 * disallowed too: they are meant for the one person who was sent the link, not a search
 * index.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/platform", "/api/", "/auth/", "/onboarding", "/p/", "/reset-password"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
