import type { ProspectTechnologies } from "../../lib/data-providers/prospect-data";

/**
 * DISC-OFFER-P1-03.3: technologies found for this account through the provider-agnostic
 * technology-detection contract -- each with the text it rests on, so nothing appears
 * without a reason. Renders nothing when the configured provider found none or does not
 * offer detection.
 */
export function DetectedTechnologies({ result }: { result: ProspectTechnologies | null }) {
  if (!result || result.technologies.length === 0) return null;
  return (
    <div>
      <p className="font-medium">
        Technologies mentioned
        {result.sandbox ? <span className="ml-2 text-xs font-normal text-muted-foreground">(sandbox data)</span> : null}
      </p>
      <ul className="mt-1 flex flex-col gap-1">
        {result.technologies.map((tech) => (
          <li key={tech.name} className="text-muted-foreground">
            <span className="font-medium text-foreground">{tech.name}</span>
            {tech.category ? <span className="text-xs"> · {tech.category}</span> : null}
            <span className="block text-xs">“{tech.evidence}”</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
