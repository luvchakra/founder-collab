import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { privacyController } from "@cofounderai/core/privacy/controller";
import { PRIVACY_NOTICE_VERSION } from "@cofounderai/core/privacy/notice";

export const metadata: Metadata = {
  title: "Privacy notice",
  description: "How CoFounderAI collects, uses, shares and protects personal data, and how to exercise your rights.",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

/**
 * The privacy notice required before processing (GDPR Arts. 13/14; DPDP Act s.5 and the
 * DPDP Rules' itemised-notice requirement). Versioned by PRIVACY_NOTICE_VERSION: bumping it
 * re-prompts every user through /consent. Entity/officer details come from deployment
 * config (privacy/controller.ts). Have counsel review the wording for each jurisdiction
 * you operate in before relying on it.
 */
export default function PrivacyNoticePage() {
  const controller = privacyController();
  const contact = controller.contactEmail ? (
    <a className="text-primary underline" href={`mailto:${controller.contactEmail}`}>{controller.contactEmail}</a>
  ) : (
    "the Privacy & data page in your account settings"
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold">Privacy notice</h1>
        <p className="mt-1 text-sm text-muted-foreground">Version {PRIVACY_NOTICE_VERSION}</p>
      </div>

      <Section title="Who we are">
        <p>
          {controller.name}
          {controller.address ? `, ${controller.address}` : ""} operates this platform and is the data
          controller (GDPR) / Data Fiduciary (India&apos;s Digital Personal Data Protection Act, 2023) for
          the personal data of people who use it. For data a business stores about its own customers,
          suppliers and prospects, that business is the controller/fiduciary and we process the data on
          its instructions as its processor. Contact: {contact}.
        </p>
      </Section>

      <Section title="What we collect">
        <ul className="list-disc pl-5">
          <li><strong>Account data</strong>: name, email, phone (optional), password hash, profile photo, sign-in and MFA settings.</li>
          <li><strong>Business data you enter</strong>: business details, GSTIN, customers, suppliers, prospects and their contacts, invoices, payments, inventory and job records.</li>
          <li><strong>Usage and security data</strong>: actions you take (kept in a tamper-evident audit log), sign-in events, and a one-way hash of your IP address for abuse rate-limiting.</li>
          <li><strong>Payment data</strong>: subscription status and payment references. Card, UPI and bank details are entered on Stripe&apos;s or Razorpay&apos;s own pages and never reach our servers.</li>
          <li><strong>Consent records</strong>: what you agreed to, under which notice version, and when.</li>
        </ul>
      </Section>

      <Section title="Why we use it, and on what basis">
        <ul className="list-disc pl-5">
          <li>Providing the service you signed up for: performance of a contract (GDPR Art. 6(1)(b)); your consent (DPDP s.6).</li>
          <li>Billing, tax invoices and financial-record keeping: legal obligation (GDPR Art. 6(1)(c); DPDP s.7(b)/(d), e.g. GST record retention).</li>
          <li>Securing the service and preventing fraud and abuse: legitimate interests (GDPR Art. 6(1)(f)); DPDP s.7 legitimate uses.</li>
          <li>Product news and marketing email: only with your separate, optional consent, which you can withdraw at any time.</li>
          <li>AI features: text you submit is sent to the AI provider you configure (bring-your-own-key) to generate the result you asked for. It is not used to train our models.</li>
        </ul>
        <p>We don&apos;t sell personal data and don&apos;t use it for automated decisions with legal or similarly significant effects.</p>
      </Section>

      <Section title="Who we share it with">
        <p>
          Only service providers who process it on our behalf under contract: Supabase (database,
          authentication, file storage, hosted in Mumbai, India), Vercel (application hosting), Resend
          (email delivery), Stripe and Razorpay (payments), and the AI provider you choose. We disclose
          data to authorities only where the law requires it.
        </p>
      </Section>

      <Section title="International transfers">
        <p>
          Our primary database is in India. Some providers (e.g. Vercel, Stripe, Resend, AI providers)
          may process data in other countries, including the United States. For transfers out of the
          EEA/UK we rely on the European Commission&apos;s Standard Contractual Clauses; transfers out of
          India follow any restrictions notified under DPDP Act s.16.
        </p>
      </Section>

      <Section title="How long we keep it">
        <ul className="list-disc pl-5">
          <li>Account data: while your account exists; deleted when you delete your account.</li>
          <li>Tax invoices, payments and the audit trail: 8 years, as Indian GST law requires, even after account deletion (access is closed).</li>
          <li>Payment webhook payloads: 90 days. Rate-limit counters: 1 day. Processed internal events: 1 year.</li>
          <li>Records of your privacy requests: 3 years, then deleted.</li>
        </ul>
      </Section>

      <Section title="Your rights">
        <p>
          You can access and download your data, correct it, erase it, restrict or object to processing,
          withdraw consent, and (under GDPR) port your data. Under India&apos;s DPDP Act you can also seek
          grievance redressal and nominate someone to exercise your rights if you die or become
          incapacitated. Most of this is self-service on the{" "}
          <Link className="text-primary underline" href="/dashboard/settings/privacy">Privacy &amp; data</Link>{" "}
          page; everything else can be requested there or by email. We respond within 30 days. Withdrawing
          consent is as easy as giving it and doesn&apos;t affect processing that already happened.
        </p>
        <p>
          If a business using this platform holds your data (for example, it emailed you), contact that
          business. Every email it sends through us carries a one-click unsubscribe link, and it can erase
          your data from its account.
        </p>
      </Section>

      <Section title="Grievances and complaints">
        <p>
          Grievance Officer: {controller.grievanceOfficerName ?? "our privacy team"}
          {controller.grievanceOfficerEmail ? (
            <>
              {" "}(<a className="text-primary underline" href={`mailto:${controller.grievanceOfficerEmail}`}>{controller.grievanceOfficerEmail}</a>)
            </>
          ) : null}
          . If you&apos;re not satisfied with our response, you can complain to the Data Protection Board of
          India (after using our grievance process), or to the data-protection supervisory authority where
          you live or work in the EU/EEA or UK.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Encryption in transit (TLS) and at rest, row-level tenant isolation in the database, optional
          two-factor authentication, encrypted storage of API keys and payment-gateway credentials, and a
          tamper-evident audit log. If a breach affects your personal data, we&apos;ll notify you and the
          relevant authorities as the law requires.
        </p>
      </Section>

      <Section title="Children">
        <p>The service is for businesses and isn&apos;t intended for anyone under 18. We don&apos;t knowingly collect children&apos;s data.</p>
      </Section>
    </main>
  );
}
