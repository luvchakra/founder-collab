import type { Metadata } from "next";
import type { ReactNode } from "react";

/** BRAND-07: "Discovery | WonderArk" in the browser tab (root layout title template); pages
 * below may set their own. Renders nothing of its own. */
export const metadata: Metadata = { title: "Discovery" };

export default function DiscoveryLayout({ children }: { children: ReactNode }) {
  return children;
}
