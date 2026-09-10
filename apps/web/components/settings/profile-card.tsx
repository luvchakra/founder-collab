"use client";

import { useActionState, useState } from "react";
import { Building2, Clock, Mail, MapPin, Pencil, Phone } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
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

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | null }) {
  return (
    <div className="flex items-start gap-3 py-2.5 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={value ? "font-medium" : "text-muted-foreground"}>{value || `No ${label.toLowerCase()} yet`}</p>
      </div>
    </div>
  );
}

/**
 * Profile settings -- previously two always-editing forms (avatar upload, then a plain
 * name/bio/phone form) stacked with no way to just glance at your own info. Now one card
 * with a display view by default (an Edit button switches it into the same fields, plus
 * three new ones -- job title, location, timezone -- that user_metadata already had room
 * for but this page never collected) and back again once saved.
 */
export function ProfileCard({
  avatarUrl,
  fullName,
  email,
  bio,
  phone,
  jobTitle,
  location,
  timezone,
  updateProfileAction,
  updateAvatarAction,
}: {
  avatarUrl: string | null;
  fullName: string;
  email: string;
  bio: string;
  phone: string;
  jobTitle: string;
  location: string;
  timezone: string;
  updateProfileAction: (prevState: RenameActionState, formData: FormData) => Promise<RenameActionState>;
  updateAvatarAction: (prevState: RenameActionState, formData: FormData) => Promise<RenameActionState>;
}) {
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [profileState, profileFormAction] = useActionState<RenameActionState, FormData>(updateProfileAction, null);
  const [avatarState, avatarFormAction] = useActionState<RenameActionState, FormData>(updateAvatarAction, null);
  const initials = getInitials(fullName || null, email);

  const avatar = (
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
  );

  if (!editing) {
    return (
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            {avatar}
            <div>
              <p className="text-lg font-semibold">{fullName || "Add your name"}</p>
              <p className="text-sm text-muted-foreground">{email}</p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" aria-hidden="true" />
            Edit
          </Button>
        </div>

        {bio ? <p className="text-sm text-muted-foreground">{bio}</p> : null}

        <div className="flex flex-col divide-y divide-border border-t border-border">
          <InfoRow icon={Mail} label="Email" value={email} />
          <InfoRow icon={Phone} label="Phone" value={phone || null} />
          <InfoRow icon={Building2} label="Job title" value={jobTitle || null} />
          <InfoRow icon={MapPin} label="Location" value={location || null} />
          <InfoRow icon={Clock} label="Timezone" value={timezone || null} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-4 sm:p-5">
      <form action={avatarFormAction} className="flex items-center gap-4">
        {avatar}
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
            {avatarState && "error" in avatarState ? (
              <p role="alert" className="text-sm text-destructive">
                {avatarState.error}
              </p>
            ) : null}
          </div>
        </div>
      </form>

      <form action={profileFormAction} className="flex flex-col gap-4 border-t border-border pt-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={email} disabled />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fullName">Name</Label>
            <Input id="fullName" name="fullName" defaultValue={fullName} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" type="tel" defaultValue={phone} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="jobTitle">Job title</Label>
            <Input id="jobTitle" name="jobTitle" defaultValue={jobTitle} placeholder="e.g. Founder & CEO" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="location">Location</Label>
            <Input id="location" name="location" defaultValue={location} placeholder="e.g. Bengaluru, India" />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Input id="timezone" name="timezone" defaultValue={timezone} placeholder="e.g. Asia/Kolkata" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bio">Bio</Label>
          <Textarea id="bio" name="bio" rows={3} defaultValue={bio} />
        </div>

        {profileState && "error" in profileState ? (
          <p role="alert" className="text-sm text-destructive">
            {profileState.error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            Done
          </Button>
          <SubmitButton pendingText="Saving...">Save</SubmitButton>
        </div>
      </form>
    </div>
  );
}
