"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type AutoPopulateStage = "overview" | "icp" | "prospects";

type ContextValue = {
  activeStage: AutoPopulateStage | null;
  setActiveStage: (stage: AutoPopulateStage | null) => void;
};

const AutoPopulateProgressContext = createContext<ContextValue | null>(null);

/**
 * Shared across the whole Overview -> ICP -> Prospects auto-populate flow -- mounted
 * once in this product's own layout.tsx, which (being the one layout shared by all three
 * stage pages) stays mounted across the client-side navigations the flow drives itself,
 * per the App Router's own layout-persistence behavior. Lets ProductNav's stage circles
 * show which one is actively processing right now without its own trigger component (a
 * button click on Overview, an effect-on-mount banner on ICP/Prospects) needing to know
 * about ProductNav directly -- each just reports its own stage's start/finish here.
 */
export function AutoPopulateProgressProvider({ children }: { children: ReactNode }) {
  const [activeStage, setActiveStage] = useState<AutoPopulateStage | null>(null);
  return (
    <AutoPopulateProgressContext.Provider value={{ activeStage, setActiveStage }}>
      {children}
    </AutoPopulateProgressContext.Provider>
  );
}

export function useAutoPopulateProgress(): ContextValue {
  const ctx = useContext(AutoPopulateProgressContext);
  // Outside the provider there's simply nothing to report -- a no-op setter rather than
  // throwing, since every stage trigger already works fine on its own without this.
  return ctx ?? { activeStage: null, setActiveStage: () => {} };
}
