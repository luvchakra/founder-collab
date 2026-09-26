import type { Metadata } from "next";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";
import { BRAND_TITLE_TEMPLATE } from "@cofounderai/core/brand/identity";
import type { ReactNode } from "react";
import { SectionTabs } from "@cofounderai/module-discovery/components/marketing/section-tabs";

/** BRAND-07: "Marketing | WonderArk" in the browser tab. Absolute, with the template
 * re-declared: a plain title here would stop the root "%s | WonderArk" template from
 * reaching the pages below. */
export const metadata: Metadata = { title: { absolute: `Marketing | ${BRAND_NAME}`, template: BRAND_TITLE_TEMPLATE } };

/** MKT-03..14 — every Marketing page shares one tab strip (see SectionTabs). */
export default async function MarketingLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const root = `/${businessSlug}/discovery/marketing`;
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6">
      <SectionTabs
        tabs={[
          { href: root, label: "Dashboard", exact: true },
          { href: `${root}/strategy`, label: "Strategy" },
          { href: `${root}/campaigns`, label: "Campaigns" },
          { href: `${root}/content`, label: "Content" },
          { href: `${root}/assets`, label: "Assets" },
          { href: `${root}/website-seo`, label: "Website & SEO" },
          { href: `${root}/analytics`, label: "Analytics" },
        ]}
      />
      {children}
    </main>
  );
}
