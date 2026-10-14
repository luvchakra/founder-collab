import type { Metadata } from "next";
import { WonderArkLogo } from "@cofounderai/core/shell/wonderark-logo";

export const metadata: Metadata = { title: "Temporarily unavailable", robots: { index: false } };

// PLATFORM-P1-10.1: a failed address lookup answers this (503), never another organization.
export default function ServiceUnavailablePage() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col items-center justify-center gap-4 px-4 py-10 text-center">
      <WonderArkLogo variant="primary" size="xs" adaptive priority className="mb-3" />
      <h1 className="text-2xl font-semibold">Temporarily unavailable</h1>
      <p className="text-muted-foreground">We couldn&apos;t reach this organization just now. Try again in a minute.</p>
    </main>
  );
}
