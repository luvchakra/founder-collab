"use client";

import { useActionState, useState } from "react";
import { Building2 } from "lucide-react";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { RenameActionState } from "../../lib/tenancy/types";

/**
 * Upload/replace/remove this business's logo. Same shape as the account avatar control
 * (apps/web/components/settings/profile-card.tsx): a live local preview so the choice is
 * visible before the round trip, then a server action that does the storage upload and
 * writes the resulting public URL onto the business.
 *
 * The logo is what identifies the business in the topbar switcher, which is the whole
 * reason it exists -- so the preview here is rendered at the same rounded-square shape
 * the switcher uses rather than as a generic thumbnail.
 */
export function BusinessLogoField({
  logoUrl,
  businessName,
  action,
}: {
  logoUrl: string | null;
  businessName: string;
  /** Handles both buttons -- the remove one submits `intent=remove`. */
  action: (prevState: RenameActionState, formData: FormData) => Promise<RenameActionState>;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [state, formAction] = useActionState<RenameActionState, FormData>(action, null);
  const shown = preview ?? logoUrl;
  const error = state && "error" in state ? state.error : null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div>
        <h2 className="text-base font-semibold">Logo</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Shown next to {businessName} in the business switcher.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted text-muted-foreground">
          {shown ? (
            // A Supabase Storage public URL, not a build-time-known domain next/image is
            // configured for.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="" className="size-full object-contain" />
          ) : (
            <Building2 className="size-6" aria-hidden="true" />
          )}
        </span>

        <form action={formAction} className="flex min-w-0 flex-1 flex-col gap-2">
          <input
            type="file"
            name="logo"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setPreview(URL.createObjectURL(file));
            }}
            className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-accent"
          />
          <p className="text-xs text-muted-foreground">PNG, JPEG, WebP or SVG, up to 2MB.</p>
          <div className="flex items-center gap-2">
            <SubmitButton size="sm" pendingText="Uploading...">
              {logoUrl ? "Replace logo" : "Upload logo"}
            </SubmitButton>
          </div>
        </form>
      </div>

      {logoUrl ? (
        <form action={formAction}>
          <input type="hidden" name="intent" value="remove" />
          <SubmitButton size="sm" variant="ghost" pendingText="Removing..." className="text-muted-foreground">
            Remove logo
          </SubmitButton>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
