/**
 * PLATFORM-P0-01's own minimal placeholder, proving the SUPERADMIN gate end-to-end.
 * The real Platform Dashboard (docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §6,
 * PLATFORM-P0-02) is its own, separate next story -- not built ahead of turn.
 */
export default function PlatformHomePage() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold">Platform Administration</h1>
      <p className="text-sm text-zinc-400">
        You&apos;re signed in as a SUPERADMIN. This is WonderArc&apos;s control plane, separate from any customer business.
      </p>
    </div>
  );
}
