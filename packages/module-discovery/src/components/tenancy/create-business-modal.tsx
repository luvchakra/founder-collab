"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@cofounderai/core/ui/tabs";

/**
 * "+ Create New Business" flow (CoFounderAI Header & Business Selector Enhancement doc
 * §3): a modal rather than a dedicated page, so it's reachable from the sidebar's
 * business switcher on any dashboard screen. Two tabs: "From website" (the default --
 * one field, AI researches the site and fills in name/description) and "Manual entry"
 * (the original form, now with its own website field too). Both submit to a real server
 * action that creates the business under the caller's own account, revalidates
 * /dashboard, and redirects -- `fromWebsiteAction` to the new business's Business detail
 * page (so the founder can immediately review what AI filled in), `action` to the bare
 * dashboard/businesses/[id] route, matching how each tab's own result is meant to be
 * looked at next.
 */
export function CreateBusinessModal({
  action,
  fromWebsiteAction,
  onClose,
}: {
  action: (formData: FormData) => Promise<void>;
  fromWebsiteAction: (formData: FormData) => Promise<void>;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    inputRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8">
      <div
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-100 ${mounted ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-business-title"
        className={`relative w-full max-w-md rounded-2xl border bg-popover p-6 shadow-2xl transition-[transform,opacity] duration-100 ${
          mounted ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-95 opacity-0"
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-5" aria-hidden="true" />
        </button>

        <h2 id="create-business-title" className="text-lg font-semibold">
          Create a new business
        </h2>

        <Tabs defaultValue="website" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="website">From website</TabsTrigger>
            <TabsTrigger value="manual">Manual entry</TabsTrigger>
          </TabsList>

          <TabsContent value="website" className="mt-4">
            <form action={fromWebsiteAction} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="create-business-website">Website</Label>
                <Input
                  ref={inputRef}
                  id="create-business-website"
                  name="website"
                  type="text"
                  placeholder="https://example.com"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  AI reads the site and fills in the business name and description --
                  you can review and edit everything right after.
                </p>
              </div>
              <div className="mt-2 flex justify-end gap-3">
                <Button type="button" variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <SubmitButton pendingText="Researching...">
                  <Sparkles className="size-4" aria-hidden="true" />
                  Create &amp; auto-populate
                </SubmitButton>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="manual" className="mt-4">
            <form action={action} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="create-business-name">Business Name</Label>
                <Input id="create-business-name" name="name" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="create-business-website-manual">Website (optional)</Label>
                <Input id="create-business-website-manual" name="website" type="text" placeholder="https://" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="create-business-description">Description (optional)</Label>
                <Textarea id="create-business-description" name="description" rows={2} />
              </div>
              <div className="mt-2 flex justify-end gap-3">
                <Button type="button" variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <SubmitButton pendingText="Creating...">Create Business</SubmitButton>
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
