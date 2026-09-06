"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { LandingButton } from "./landing-button";

const NAV_LINKS = [
  { href: "#product", label: "Product" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "#benefits", label: "Benefits" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-landing-surface-border bg-landing-bg/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" aria-label="CoFounderAI" className="shrink-0">
          <Image
            src="/logo-lockup.png"
            alt="CoFounderAI"
            width={1583}
            height={350}
            priority
            className="h-8 w-auto"
          />
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-landing-muted transition-colors hover:text-landing-fg"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/login"
            className="text-sm font-medium text-landing-muted transition-colors hover:text-landing-fg"
          >
            Log In
          </Link>
          <LandingButton href="/signup">Start Free</LandingButton>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className="text-landing-fg md:hidden"
        >
          {open ? <X className="size-6" aria-hidden="true" /> : <Menu className="size-6" aria-hidden="true" />}
        </button>
      </div>

      {open ? (
        <nav
          aria-label="Mobile"
          className="flex flex-col gap-1 border-t border-landing-surface-border px-6 py-4 md:hidden"
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-2.5 text-sm text-landing-muted hover:bg-white/5 hover:text-landing-fg"
            >
              {link.label}
            </a>
          ))}
          <div className="mt-2 flex flex-col gap-2 border-t border-landing-surface-border pt-4">
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-2.5 text-center text-sm font-medium text-landing-fg hover:bg-white/5"
            >
              Log In
            </Link>
            <LandingButton href="/signup" className="w-full">
              Start Free
            </LandingButton>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
