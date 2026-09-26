"use client";

import { useState } from "react";
import { ChevronDown, Download, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { toast } from "../ui/sonner";
import { cn } from "../../lib/utils";
import type { ExportFormat, ExportScope } from "../../exports/types";

/**
 * EXP-PLAT-04 -- the one Export control (§5, §6, §19, §20, §57). Every exportable page puts
 * exactly this in its header, left of the page's primary action; no module draws its own.
 *
 * - `kind="list"` on a paginated list offers the two scopes -- the rows on screen, or every
 *   record matching the same filters -- before the format.
 * - `kind="report"` / `"dashboard"`: CSV is the report's main table, Excel the full
 *   workbook with a sheet per dataset (§33).
 *
 * The file is fetched from /api/exports/<id> (EXP-PLAT-05), which re-checks the session,
 * business, licence and permission; nothing this component sends is trusted. While a
 * file is being prepared the button is disabled, so a double click can't start two.
 * Below the `sm` breakpoint the label collapses to the icon, keeping "Export" as the
 * accessible name.
 */
export type ExportMenuProps = {
  /** Adapter id, e.g. `crm.leads`. */
  exportId: string;
  /** The business this page belongs to -- the URL's own slug. */
  businessSlug: string;
  /** The page's current filters, exactly as its own search params carry them. */
  params?: Record<string, string | string[] | undefined>;
  kind?: "list" | "report" | "dashboard";
  /** Paginated lists only: whether "current view" and "all matching" differ. */
  paginated?: boolean;
  formats?: readonly ExportFormat[];
  className?: string;
};

const FAILED = "We could not generate this export. No data was changed.";

function filenameFrom(disposition: string | null, fallback: string): string {
  const star = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (star) return decodeURIComponent(star);
  return disposition?.match(/filename="([^"]+)"/i)?.[1] ?? fallback;
}

export function buildExportUrl(
  exportId: string,
  businessSlug: string,
  format: ExportFormat,
  scope: ExportScope,
  params: ExportMenuProps["params"] = {},
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || ["business", "format", "scope"].includes(key)) continue;
    for (const item of Array.isArray(value) ? value : [value]) if (item !== "") query.append(key, item);
  }
  query.set("business", businessSlug);
  query.set("format", format);
  query.set("scope", scope);
  return `/api/exports/${encodeURIComponent(exportId)}?${query.toString()}`;
}

export function ExportMenu({
  exportId,
  businessSlug,
  params,
  kind = "list",
  paginated = false,
  formats = kind === "dashboard" ? ["xlsx", "csv"] : ["csv", "xlsx"],
  className,
}: ExportMenuProps) {
  const [scope, setScope] = useState<ExportScope>("view");
  const [pending, setPending] = useState(false);

  async function run(format: ExportFormat) {
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch(buildExportUrl(exportId, businessSlug, format, scope, params), {
        credentials: "same-origin",
      });
      if (response.status === 202) {
        toast.info("Export queued", { description: "Your export is being prepared. We'll notify you when it is ready." });
        return;
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        // A denial explains itself (licence, permission); anything else gets the standard copy.
        const description = response.status === 403 && body?.message ? body.message : FAILED;
        toast.error("Export failed", { description });
        return;
      }
      const blob = await response.blob();
      const filename = filenameFrom(response.headers.get("content-disposition"), `export.${format}`);
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 30_000);
      toast.success("File downloaded", { description: filename });
    } catch {
      toast.error("Export failed", { description: FAILED });
    } finally {
      setPending(false);
    }
  }

  const labelFor = (format: ExportFormat) => {
    if (kind === "list") return format === "csv" ? "CSV" : "Excel (.xlsx)";
    return format === "csv" ? "CSV — current table" : "Excel — full workbook";
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={pending}>
        <Button
          variant="outline"
          size="sm"
          aria-label="Export"
          aria-busy={pending}
          className={cn("shrink-0 gap-1.5", className)}
          data-export-id={exportId}
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
          <span className="hidden sm:inline">{pending ? "Preparing…" : "Export"}</span>
          <ChevronDown className="hidden size-3.5 opacity-60 sm:inline" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {kind === "list" && paginated ? (
          <>
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Rows</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={scope} onValueChange={(value) => setScope(value as ExportScope)}>
              {/* Choosing a scope keeps the menu open -- the format below is what starts the export. */}
              <DropdownMenuRadioItem value="view" onSelect={(event) => event.preventDefault()}>
                Current filtered view
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="all" onSelect={(event) => event.preventDefault()}>
                All matching records
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Download as</DropdownMenuLabel>
        {formats.map((format) => (
          <DropdownMenuItem key={format} onSelect={() => void run(format)}>
            <Download className="size-4 text-muted-foreground" aria-hidden="true" />
            {labelFor(format)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
