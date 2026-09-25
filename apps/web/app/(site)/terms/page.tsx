import type { Metadata } from "next";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";
import { LegalDocument } from "@/components/legal/legal-document";
import { LEGAL_LAST_UPDATED } from "@/lib/legal";
import { TERMS_INTRO, TERMS_SECTIONS } from "@/lib/legal-content";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The terms that govern your use of ${BRAND_NAME}.`,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of Service"
      lastUpdated={LEGAL_LAST_UPDATED}
      intro={TERMS_INTRO}
      sections={TERMS_SECTIONS}
    />
  );
}
