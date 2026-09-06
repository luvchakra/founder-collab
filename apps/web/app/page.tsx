import Link from "next/link";
import { moduleRegistry } from "@cofounderai/module-registry";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-semibold">CoFounderAI Platform</h1>
        <p className="text-muted-foreground">Scaffold complete (P-0). Modules land in later epics.</p>
      </div>
      {/* Rendered from packages/module-registry, never hardcoded (00-MASTER-PLAN.md §6, story P-3). */}
      <nav className="flex flex-wrap justify-center gap-3">
        {moduleRegistry.map((module) => (
          <Link
            key={module.key}
            href={module.routePrefix}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
          >
            {module.name}
          </Link>
        ))}
      </nav>
    </main>
  );
}
