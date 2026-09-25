"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { BRAND_LOCKUP } from "@cofounderai/core/brand/generated/assets";
import { Menu, X } from "lucide-react";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";
import { LandingButton } from "./landing-button";

/**
 * Section links point at the landing page's own anchors (`/#modules`, not `#modules`), so
 * they still work from /help, /pricing and the legal pages, which share this bar; they are
 * plain anchors -- a hash jump on the landing page itself. `/pricing` and `/help` are real
 * routes, rendered with `next/link` below so they navigate client-side instead of
 * reloading the app. Help is in this bar rather than tucked into the footer because
 * someone who cannot sign in has nowhere else to look, and because the guides are worth
 * reading before signing up.
 */
const NAV_LINKS = [
  { href: "/#modules", label: "Modules" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#benefits", label: "Benefits" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
  { href: "/help", label: "Help" },
];

const isRoute = (href: string) => !href.includes("#");

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-landing-surface-border bg-landing-bg/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" aria-label={BRAND_NAME} className="shrink-0">
          <Image
            {...BRAND_LOCKUP.onLight}
            alt={BRAND_NAME}
            priority
            className="h-8 w-auto"
          />
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          {NAV_LINKS.map((link) =>
            isRoute(link.href) ? (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-landing-muted transition-colors hover:text-landing-fg"
              >
                {link.label}
              </Link>
            ) : (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-landing-muted transition-colors hover:text-landing-fg"
              >
                {link.label}
              </a>
            ),
          )}
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
          {NAV_LINKS.map((link) => {
            const className =
              "rounded-md px-2 py-2.5 text-sm text-landing-muted hover:bg-landing-bg hover:text-landing-fg";
            return isRoute(link.href) ? (
              <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className={className}>
                {link.label}
              </Link>
            ) : (
              <a key={link.href} href={link.href} onClick={() => setOpen(false)} className={className}>
                {link.label}
              </a>
            );
          })}
          <div className="mt-2 flex flex-col gap-2 border-t border-landing-surface-border pt-4">
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-2.5 text-center text-sm font-medium text-landing-fg hover:bg-landing-bg"
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
