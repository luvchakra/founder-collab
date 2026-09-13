/**
 * Without this, switching tabs (Overview/ICP/Prospects/Conversions/Usage) falls back to
 * app/(dashboard)/loading.tsx -- a full-page spinner that replaces this whole route,
 * including the ProductNav tab strip the user just clicked. A loading.tsx here instead
 * wraps only {children} in Suspense (this segment's layout.tsx, which renders the
 * breadcrumbs/name/ProductNav, isn't part of that boundary), so the nav and page header
 * stay put and only the tab content area shows a brief placeholder.
 */
export default function ProductTabLoading() {
  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      <div className="h-4 w-full animate-pulse rounded bg-muted" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
    </div>
  );
}
