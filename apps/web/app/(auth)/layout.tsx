import Link from "next/link";
import type { ReactNode } from "react";
import { AuthTabs } from "@/components/auth/auth-tabs";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="landing-theme dark flex min-h-full flex-1 flex-col bg-landing-bg text-landing-fg">
      <header className="landing-grid flex items-center justify-between px-6 py-6 sm:px-10">
        <Link href="/" className="text-lg font-semibold tracking-tight text-landing-fg">
          CoFounder<span className="text-landing-accent">AI</span>
        </Link>
        <AuthTabs />
      </header>
      <main className="flex flex-1 items-center justify-center px-6 pb-16">{children}</main>
    </div>
  );
}
