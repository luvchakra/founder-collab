"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { RenameActionState } from "@cofounderai/module-discovery/lib/tenancy/types";

function getInitials(name: string | null, email: string): string {
  const source = name?.trim();
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export function AvatarUploadForm({
  avatarUrl,
  name,
  email,
  action,
}: {
  avatarUrl: string | null;
  name: string | null;
  email: string;
  action: (prevState: RenameActionState, formData: FormData) => Promise<RenameActionState>;
}) {
  const [state, formAction] = useActionState<RenameActionState, FormData>(action, null);
  const [preview, setPreview] = useState<string | null>(null);
  const initials = getInitials(name, email);

  return (
    <form action={formAction} className="flex items-center gap-4 rounded-md border p-4">
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-lg font-semibold text-primary-foreground">
        {preview || avatarUrl ? (
          // avatar_url can be an arbitrary external URL (Google's profile photo host) as
          // well as our own Supabase Storage URL, not something next/image is configured for.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview ?? avatarUrl ?? undefined} alt="" className="size-full object-cover" />
        ) : (
          initials
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <input
          type="file"
          name="avatar"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setPreview(URL.createObjectURL(file));
          }}
          className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-accent"
        />
        <div className="flex items-center gap-2">
          <SubmitButton size="sm" pendingText="Uploading...">
            Upload avatar
          </SubmitButton>
          {state && "error" in state ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
        </div>
      </div>
    </form>
  );
}
