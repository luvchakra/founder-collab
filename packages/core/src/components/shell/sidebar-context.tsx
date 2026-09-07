"use client";

import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

type SidebarContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

/**
 * Ported from co-founder-ai's components/tenancy/sidebar-context.tsx
 * (docs/PORT-PROVENANCE.md): shares the collapsible drawer's open/closed state between
 * the topbar's hamburger toggle and the drawer itself -- they're siblings in
 * DashboardShell, not nested, so a small client-side context is the simplest way to
 * connect them. Collapsed by default: the drawer only opens once someone clicks the
 * toggle.
 */
export function SidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <SidebarContext.Provider value={{ open, setOpen }}>{children}</SidebarContext.Provider>;
}

export function useSidebar(): SidebarContextValue {
  const context = useContext(SidebarContext);
  if (!context) throw new Error("useSidebar must be used within a SidebarProvider");
  return context;
}
