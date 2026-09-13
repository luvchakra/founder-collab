import Image from "next/image";
import { Check } from "lucide-react";
import { FadeIn } from "./fade-in";

const MODULES: {
  name: string;
  tagline: string;
  body: string;
  features: string[];
  image: string;
  imageAlt: string;
}[] = [
  {
    name: "Discovery",
    tagline: "Find the customers worth chasing",
    body: "AI builds your ideal customer profile, finds and scores real accounts against it, and explains why each one is worth a conversation right now.",
    features: [
      "AI-generated ideal customer profiles",
      "Prospect discovery and fit/timing scoring",
      "Why-them and why-now evidence per account",
      "One-click handoff into your CRM pipeline",
    ],
    image: "/screens/discovery-pipeline.png",
    imageAlt: "Discovery pipeline showing scored accounts with fit score, priority and status",
  },
  {
    name: "Inventory",
    tagline: "One stock count, everywhere it's promised",
    body: "Products, warehouses, purchase orders, sales orders and returns share the same catalog and the same stock levels every other module reads from.",
    features: [
      "Multi-warehouse stock with low-stock alerts",
      "Purchase orders and supplier management",
      "Sales orders, invoices and returns",
      "The same item record a job or invoice reserves against",
    ],
    image: "/screens/inventory-dashboard.png",
    imageAlt: "Inventory dashboard showing stock levels and status badges for HVAC parts",
  },
  {
    name: "Service",
    tagline: "Jobs, crew and parts, on one calendar",
    body: "Turn a won opportunity into a scheduled job, dispatch a crew, and consume the right parts from the same inventory the job is billed against.",
    features: [
      "Opportunity-to-job pipeline",
      "Crew scheduling and dispatch calendar",
      "Mobile-friendly field work: time, notes, signatures",
      "Job invoicing tied straight to inventory",
    ],
    image: "/screens/fsm-schedule.png",
    imageAlt: "Field service schedule showing jobs, customers and statuses for the week",
  },
  {
    name: "CRM",
    tagline: "One inbox, whichever channel they used",
    body: "WhatsApp, email and every other channel land in a single shared inbox, tied to the same customer record inventory and service already know.",
    features: [
      "Unified inbox across channels",
      "Automated routing rules",
      "Lead lifecycle and opportunity pipeline",
      "Follow-up queue so nothing goes quiet",
    ],
    image: "/screens/crm-inbox.png",
    imageAlt: "Shared CRM inbox showing a WhatsApp conversation thread with a customer",
  },
  {
    name: "Compliance",
    tagline: "GST built from the sales data you already have",
    body: "GSTIN registrations, e-invoicing, e-way bills and return filings are computed from the same invoices and sales orders Inventory already recorded -- not re-entered by hand.",
    features: [
      "GST profile and GSTIN management",
      "e-Way bill generation",
      "e-Invoicing",
      "GST return filing",
    ],
    image: "/screens/gst-dashboard.png",
    imageAlt: "GST dashboard showing an active GSTIN registration and recent return filings",
  },
];

export function Modules() {
  return (
    <section id="modules" className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <FadeIn>
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-widest text-landing-accent uppercase">
              Five modules, one platform
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-landing-fg sm:text-4xl">
              License what you need today. Everything else is already connected.
            </h2>
            <p className="mt-4 text-landing-muted">
              Every module reads and writes the same customers, items, jobs and
              documents -- so turning one on doesn&apos;t mean re-entering data the
              others already have.
            </p>
          </div>
        </FadeIn>

        <div className="mt-16 flex flex-col gap-24">
          {MODULES.map((mod, i) => (
            <FadeIn key={mod.name} delayMs={i * 50}>
              <div
                id={`module-${mod.name.toLowerCase()}`}
                className={`grid scroll-mt-24 grid-cols-1 items-center gap-10 lg:grid-cols-2 ${
                  i % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""
                }`}
              >
                <div>
                  <p className="text-sm font-semibold text-landing-accent">{mod.name}</p>
                  <h3 className="mt-1 text-2xl font-semibold text-landing-fg">{mod.tagline}</h3>
                  <p className="mt-3 text-landing-muted">{mod.body}</p>
                  <ul className="mt-5 flex flex-col gap-2.5">
                    {mod.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-landing-fg">
                        <Check className="mt-0.5 size-4 shrink-0 text-landing-accent" aria-hidden="true" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="overflow-hidden rounded-2xl">
                  <Image
                    src={mod.image}
                    alt={mod.imageAlt}
                    width={1620}
                    height={1004}
                    className="h-auto w-full"
                  />
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
