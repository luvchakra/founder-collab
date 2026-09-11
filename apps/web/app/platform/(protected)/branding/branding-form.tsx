"use client";

import { useActionState } from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { Input } from "@cofounderai/core/ui/input";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { Label } from "@cofounderai/core/ui/label";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { PlatformBranding } from "@cofounderai/core/admin/platform-branding";
import { formatDateTime } from "@cofounderai/core/lib/format";
import { saveBrandingAction, type BrandingFormState } from "./actions";

// The vendored Input/Textarea/Label read the site's shared light-theme tokens
// (border-input / bg-background / text-foreground -- see packages/core/src/ui-theme.css),
// which the customer app relies on but this hardcoded dark `/platform` chrome never opts
// into (no `.dark` class here). Same fix PLATFORM-P0-02 applied to the dashboard's
// "Not configured" badge, applied here to every text field instead of just one badge.
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";
const LABEL_CLASS = "text-zinc-300";

function Field({
  id,
  name,
  label,
  defaultValue,
  error,
  placeholder,
  type = "text",
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  error?: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </Label>
      <Input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className={FIELD_CLASS}
        aria-invalid={Boolean(error)}
      />
      {error ? (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ColorField({
  id,
  name,
  label,
  defaultValue,
  error,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  error?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const swatch = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "transparent";

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <span
          className="size-8 shrink-0 rounded-md border border-zinc-700"
          style={{ backgroundColor: swatch }}
          aria-hidden="true"
        />
        <Input
          id={id}
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="#2563eb"
          className={FIELD_CLASS}
          aria-invalid={Boolean(error)}
        />
      </div>
      {error ? (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function BrandingForm({ branding }: { branding: PlatformBranding }) {
  const [state, formAction] = useActionState<BrandingFormState, FormData>(saveBrandingAction, null);
  const fieldErrors = state?.status === "error" ? state.fieldErrors : {};

  useEffect(() => {
    if (state?.status === "success") toast.success("Branding saved.");
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Card className="border-zinc-800 bg-zinc-900 text-zinc-50">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-zinc-200">Platform identity</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            id="platformName"
            name="platformName"
            label="Platform name"
            defaultValue={branding.platformName}
            error={fieldErrors.platformName}
          />
          <Field
            id="supportEmail"
            name="supportEmail"
            label="Support email"
            type="email"
            defaultValue={branding.supportEmail ?? ""}
            placeholder="support@wonderarc.com"
            error={fieldErrors.supportEmail}
          />
          <Field
            id="supportUrl"
            name="supportUrl"
            label="Support URL"
            defaultValue={branding.supportUrl ?? ""}
            placeholder="https://support.wonderarc.com"
            error={fieldErrors.supportUrl}
          />
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900 text-zinc-50">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-zinc-200">Brand assets</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            id="logoUrl"
            name="logoUrl"
            label="Logo URL"
            defaultValue={branding.logoUrl ?? ""}
            placeholder="https://…/logo.svg"
            error={fieldErrors.logoUrl}
          />
          <Field
            id="faviconUrl"
            name="faviconUrl"
            label="Favicon URL"
            defaultValue={branding.faviconUrl ?? ""}
            placeholder="https://…/favicon.ico"
            error={fieldErrors.faviconUrl}
          />
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900 text-zinc-50">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-zinc-200">Brand colors</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <ColorField
            id="primaryColor"
            name="primaryColor"
            label="Primary brand"
            defaultValue={branding.primaryColor}
            error={fieldErrors.primaryColor}
          />
          <ColorField
            id="secondaryColor"
            name="secondaryColor"
            label="Secondary brand"
            defaultValue={branding.secondaryColor ?? ""}
            error={fieldErrors.secondaryColor}
          />
          <ColorField
            id="accentColor"
            name="accentColor"
            label="Accent color"
            defaultValue={branding.accentColor ?? ""}
            error={fieldErrors.accentColor}
          />
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900 text-zinc-50">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-zinc-200">Login branding</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field
            id="loginHeadline"
            name="loginHeadline"
            label="Headline"
            defaultValue={branding.loginHeadline ?? ""}
            placeholder="Run your whole business from one place"
            error={fieldErrors.loginHeadline}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="loginSupportText" className={LABEL_CLASS}>
              Support text
            </Label>
            <Textarea
              id="loginSupportText"
              name="loginSupportText"
              defaultValue={branding.loginSupportText ?? ""}
              className={FIELD_CLASS}
              rows={2}
            />
            {fieldErrors.loginSupportText ? (
              <p role="alert" className="text-xs text-red-400">
                {fieldErrors.loginSupportText}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900 text-zinc-50">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-zinc-200">Email branding</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field
            id="emailFromName"
            name="emailFromName"
            label="From name"
            defaultValue={branding.emailFromName ?? ""}
            placeholder="WonderArc"
            error={fieldErrors.emailFromName}
          />
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900 text-zinc-50">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-zinc-200">Footer</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="footerText" className={LABEL_CLASS}>
              Footer text
            </Label>
            <Textarea
              id="footerText"
              name="footerText"
              defaultValue={branding.footerText ?? ""}
              className={FIELD_CLASS}
              rows={2}
            />
            {fieldErrors.footerText ? (
              <p role="alert" className="text-xs text-red-400">
                {fieldErrors.footerText}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col items-start gap-3 border-t border-zinc-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-zinc-500">
          Last updated {formatDateTime(branding.updatedAt)}
        </p>
        <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
      </div>
    </form>
  );
}
