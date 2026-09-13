"use client";

/**
 * Split out from the page itself, which is a Server Component: an event handler
 * (auto-submit on change) can't be attached to a plain <input> rendered directly by a
 * Server Component -- React/Next.js can't serialize a function prop across that
 * boundary, and doing so crashed this page on every load ("Something went wrong").
 * This is the smallest possible client boundary that still keeps the rest of the page
 * (data fetching, the exceptions list, the sync/resolve/dismiss actions) server-rendered.
 */
export function PeriodPicker({ defaultValue }: { defaultValue: string }) {
  return (
    <input
      id="reconciliation-period"
      name="period"
      type="month"
      defaultValue={defaultValue}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className="border-input flex h-9 w-48 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm"
    />
  );
}
