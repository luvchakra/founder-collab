"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AccessCan } from "./access-data";

/**
 * Data every row's actions menu needs (the roles it may offer, permission descriptions
 * for the change-role diff, what the viewer may do) is sent to the browser once per page
 * through this context, not once per row.
 */
export type RoleOption = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  permissionKeys: string[];
  /** false when the role holds a permission the viewer doesn't (the server refuses it too). */
  assignable: boolean;
};

export type AccessContextValue = {
  businessSlug: string;
  roles: RoleOption[];
  permissionLabel: Record<string, string>;
  can: AccessCan;
};

const Ctx = createContext<AccessContextValue | null>(null);

export function AccessProvider({ value, children }: { value: AccessContextValue; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccess(): AccessContextValue {
  const value = useContext(Ctx);
  if (!value) throw new Error("useAccess must be used inside <AccessProvider>");
  return value;
}
