import type { Metadata } from "next";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";
import { LegalDocument } from "@/components/legal/legal-document";
import { LEGAL_LAST_UPDATED } from "@/lib/legal";
import { PRIVACY_INTRO, PRIVACY_SECTIONS } from "@/lib/legal-content";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${BRAND_NAME} collects, uses and protects personal data.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      lastUpdated={LEGAL_LAST_UPDATED}
      intro={PRIVACY_INTRO}
      sections={PRIVACY_SECTIONS}
    />
  );
}
