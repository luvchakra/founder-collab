"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={copy} aria-label={label} className="shrink-0 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
      {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
      <span className="sr-only sm:not-sr-only">{copied ? "Copied" : "Copy"}</span>
    </Button>
  );
}
