import { MapPinOff } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@cofounderai/core/ui/alert";
import { Badge } from "@cofounderai/core/ui/badge";
import { COUNTRY_CATALOG } from "../../lib/compliance/countries";

/**
 * COMPLY-P0-01.5 (Unsupported-Country UX): replaces every Compliance page's content
 * (never renders alongside it) whenever the business's active country isn't one this
 * build actually implements. Today this is a pure safety net -- COMPLY-P0-01.2's own
 * country selector already refuses to select a "planned" country both client- and
 * server-side, so nothing in P0 can reach this state through the UI -- but it's the
 * correct place for it, not a speculative build: the very first P1 country pack that
 * makes a "planned" country selectable needs its own feature pages built before that
 * country's Compliance pages can render anything meaningful, and this is the fallback
 * every one of those pages gets for free in the meantime, with zero code in each of them
 * checking country support individually.
 */
export function UnsupportedCountryNotice({ countryCode }: { countryCode: string }) {
  const country = COUNTRY_CATALOG.find((c) => c.code === countryCode);
  const supported = COUNTRY_CATALOG.filter((c) => c.status === "supported");

  return (
    <Alert>
      <MapPinOff className="size-4" aria-hidden="true" />
      <AlertTitle>Compliance for {country?.name ?? countryCode} isn&apos;t available yet</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p>
          {country?.name ?? countryCode} is on the roadmap but has no working Compliance features
          in this build yet -- registrations, tax determination, documents, and filing for it
          haven&apos;t been implemented. Switch the country above back to a supported market to
          keep using Compliance.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Currently supported:</span>
          {supported.map((c) => (
            <Badge key={c.code} variant="secondary">
              {c.name}
            </Badge>
          ))}
        </div>
      </AlertDescription>
    </Alert>
  );
}
