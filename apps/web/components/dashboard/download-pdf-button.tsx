"use client";

import { Download } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";

/**
 * Item #18 of a UX pass: "download this as PDF" for the Executive Dashboard.
 * `window.print()` -> the browser's own Print dialog (Save as PDF) rather than a new
 * PDF-rendering dependency (jsPDF/html2canvas) -- the page's own print stylesheet
 * (`print:hidden` on the topbar and this button, see app-topbar.tsx and this page) is
 * what actually leaves the settings/controls shortcuts and the button itself out of the
 * exported document; the report content underneath prints exactly as it renders.
 */
export function DownloadPdfButton() {
  return (
    <Button type="button" size="sm" variant="outline" className="print:hidden" onClick={() => window.print()}>
      <Download className="size-3.5" aria-hidden="true" />
      Download PDF
    </Button>
  );
}
