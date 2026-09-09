import { ThemeToggle } from "@cofounderai/core/theme/theme-toggle";

export default function AppearanceSettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 p-8">
      <div>
        <h1 className="text-xl font-semibold">Appearance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose how CoFounderAI looks on this device. &quot;System&quot; follows your
          OS setting and switches automatically.
        </p>
      </div>

      <div className="rounded-md border p-4">
        <ThemeToggle />
      </div>
    </main>
  );
}
