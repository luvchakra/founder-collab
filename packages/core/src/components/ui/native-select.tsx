import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";

/**
 * A native <select> styled to match Input exactly. Named NativeSelect (not Select) to
 * avoid colliding with @cofounderai/core/ui/select, which is StockPilot's vendored
 * Radix-based composable Select (Root/Trigger/Content/Item) -- a genuinely different
 * component co-founder-ai never had. This one stays a real <select> (no custom listbox)
 * specifically because several pages submit it as a plain form field (e.g. discovery's
 * dashboard business/product filter, a GET form; inventory's product/warehouse forms,
 * a Server Action POST), which a Radix Select can't do without extra client JS syncing
 * a hidden input. Originally module-discovery's own component (P-5); moved here (SP-7)
 * once module-inventory needed the same thing -- a plain, non-domain-specific form
 * control belongs in the shared UI kit, not duplicated per module.
 */
function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        data-slot="select"
        className={cn(
          "border-input text-foreground flex h-9 w-full appearance-none items-center rounded-md border bg-transparent px-3 py-1 pr-8 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  );
}

export { NativeSelect };
