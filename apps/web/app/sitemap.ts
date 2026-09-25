import type { MetadataRoute } from "next";
import { SITE_URL } from "@cofounderai/core/site";
import { listGuides } from "@cofounderai/core/help/guides";

/**
 * Every public, indexable page: the landing page, pricing, sign-up, the legal pages and
 * the help hub plus each generated guide (docs/user-guides/*.md, so a new guide appears
 * here with no change to this file). Nothing behind a login is listed -- see robots.ts.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const page = (path: string, priority: number, changeFrequency: "weekly" | "monthly" | "yearly") => ({
    url: `${SITE_URL}${path}`,
    changeFrequency,
    priority,
  });

  return [
    page("/", 1, "weekly"),
    page("/pricing", 0.9, "monthly"),
    page("/signup", 0.8, "monthly"),
    page("/help", 0.7, "weekly"),
    ...listGuides().map((guide) => page(`/help/${guide.slug}`, 0.6, "monthly")),
    page("/terms", 0.3, "yearly"),
    page("/privacy", 0.3, "yearly"),
  ];
}
