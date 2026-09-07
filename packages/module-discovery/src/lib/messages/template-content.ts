/**
 * A templated message's `template_variables` are shown/edited as plain "KEY: value"
 * lines in the same content textarea a free-form message uses (see
 * OutboundMessageCard/updateMessageContentAction) rather than a bespoke per-variable
 * editor -- these two functions are the format/parse pair that makes that work.
 */
export function formatTemplateContent(variables: Record<string, string | number>): string {
  return Object.entries(variables)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

/** Inverse of formatTemplateContent. A line with no colon, or an empty key, is dropped
 * silently rather than failing the whole save -- the founder may have added a stray
 * note line, and losing one variable's edit is better than blocking every other one. */
export function parseTemplateContent(content: string): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    if (key) variables[key] = value;
  }
  return variables;
}
