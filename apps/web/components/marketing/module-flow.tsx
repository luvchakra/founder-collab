"use client";

import { Target, Boxes, CalendarClock, MessagesSquare, ShieldCheck, Database } from "lucide-react";
import { FadeIn } from "./fade-in";
import { usePrefersReducedMotion } from "./use-reduced-motion";

/**
 * Five nodes arranged in a pentagon around a central "shared data" hub, positioned as
 * percentages of the container so the SVG connectors below line up with the HTML icon
 * nodes at any size. Order goes clockwise from the top, matching the actual customer
 * lifecycle (Discovery finds someone -> Inventory/Service fulfill -> CRM keeps talking to
 * them -> Compliance invoices the work) -- not just a decorative arrangement.
 */
const NODES = [
  {
    key: "discovery",
    label: "Discovery",
    detail: "New prospect found",
    icon: Target,
    pos: { left: "50%", top: "8%" },
  },
  {
    key: "inventory",
    label: "Inventory",
    detail: "Stock reserved",
    icon: Boxes,
    pos: { left: "88%", top: "35%" },
  },
  {
    key: "service",
    label: "Service",
    detail: "Job scheduled",
    icon: CalendarClock,
    pos: { left: "74%", top: "82%" },
  },
  {
    key: "crm",
    label: "CRM",
    detail: "Conversation logged",
    icon: MessagesSquare,
    pos: { left: "26%", top: "82%" },
  },
  {
    key: "compliance",
    label: "Finance",
    detail: "Invoice filed",
    icon: ShieldCheck,
    pos: { left: "12%", top: "35%" },
  },
];

// Same positions as fractions (0-1) for the SVG line/dot math below -- kept separate from
// the CSS percentage strings above since SVG viewBox coordinates need numbers, not "50%".
const NODE_FRACTIONS: Record<string, { x: number; y: number }> = {
  discovery: { x: 0.5, y: 0.08 },
  inventory: { x: 0.88, y: 0.35 },
  service: { x: 0.74, y: 0.82 },
  crm: { x: 0.26, y: 0.82 },
  compliance: { x: 0.12, y: 0.35 },
};

const HUB = { x: 0.5, y: 0.46 };
const VIEWBOX = 400;

export function ModuleFlow() {
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <section className="px-6 py-20 md:py-28">
      <div className="mx-auto max-w-4xl">
        <FadeIn>
          <div className="text-center">
            <p className="text-xs font-semibold tracking-widest text-landing-accent uppercase">
              One shared data model
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-landing-fg sm:text-4xl">
              Every module writes to the same record.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-landing-muted">
              A customer Discovery finds is the exact same party CRM messages, Service
              schedules a job for, and Finance invoices -- not five copies slowly
              drifting apart.
            </p>
          </div>
        </FadeIn>

        <FadeIn delayMs={100}>
          <div className="relative mx-auto mt-14 aspect-square w-full max-w-lg">
            <svg
              viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
              className="absolute inset-0 h-full w-full"
              aria-hidden="true"
            >
              {NODES.map((node) => {
                const from = NODE_FRACTIONS[node.key];
                const x1 = from.x * VIEWBOX;
                const y1 = from.y * VIEWBOX;
                const x2 = HUB.x * VIEWBOX;
                const y2 = HUB.y * VIEWBOX;
                return (
                  <g key={node.key}>
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="currentColor"
                      className="text-landing-surface-border"
                      strokeWidth={2}
                    />
                    {!prefersReducedMotion ? (
                      <circle r={4} fill="currentColor" className="text-landing-accent">
                        <animateMotion
                          dur="2.8s"
                          begin={`${NODES.indexOf(node) * 0.45}s`}
                          repeatCount="indefinite"
                          path={`M ${x1} ${y1} L ${x2} ${y2}`}
                        />
                      </circle>
                    ) : null}
                  </g>
                );
              })}
            </svg>

            {/* Central hub */}
            <div
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-landing-accent/30 bg-landing-bg-elevated text-center shadow-sm"
              style={{ left: `${HUB.x * 100}%`, top: `${HUB.y * 100}%`, width: "34%", height: "34%" }}
            >
              <Database className="size-5 text-landing-accent" aria-hidden="true" />
              <p className="mt-1 px-2 text-[11px] leading-tight font-semibold text-landing-fg">
                Shared customers,
                <br />
                items &amp; documents
              </p>
            </div>

            {/* Module nodes */}
            {NODES.map((node) => (
              <div
                key={node.key}
                className="absolute flex w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 text-center sm:w-28"
                style={node.pos}
              >
                <div className="flex size-11 items-center justify-center rounded-full border border-landing-surface-border bg-landing-surface shadow-sm">
                  <node.icon className="size-5 text-landing-accent" aria-hidden="true" />
                </div>
                <p className="text-xs font-semibold text-landing-fg">{node.label}</p>
                <p className="text-[11px] text-landing-muted">{node.detail}</p>
              </div>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
