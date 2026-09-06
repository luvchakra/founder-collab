import { moduleRegistry } from "@cofounderai/module-registry";
import { DashboardShell } from "@cofounderai/core/shell/dashboard-shell";

// Placeholder business/user data — Epic 2's C-5 (business switcher + session
// resolution) replaces this with the real thing. Only the shell's look is settled here
// (docs/DESIGN.md), not its data source.
const PLACEHOLDER_BUSINESS = { name: "Acme Trading Pvt. Ltd." };
const PLACEHOLDER_USER = { name: "Demo User", email: "demo@cofounderai.app" };

export default function Home() {
  return (
    <DashboardShell modules={moduleRegistry} business={PLACEHOLDER_BUSINESS} user={PLACEHOLDER_USER}>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Good morning</h1>
        <p className="text-muted-foreground">
          Scaffold complete (P-0–P-3). Module screens land in later epics.
        </p>
      </div>
    </DashboardShell>
  );
}
