export const RESTRUCTURE_IMPORT_PROMPT_VERSION = "v1";

/**
 * The import feature's AI-restructuring step (prospects/import page): a founder can
 * upload a CSV/Excel export from another tool (arbitrary column names/order) or a PDF
 * (a contact list, a conference attendee sheet, anything with company names embedded in
 * prose) instead of matching this platform's own `company_name,website,industry,...`
 * template exactly. This prompt does the mapping the deterministic CSV parser can't.
 */
export function restructureImportPrompt(rawContent: string): string {
  return `The following was extracted from a file a founder uploaded to import sales
prospects (companies). It may be a table with unfamiliar column names/order, or
unstructured text (e.g. a PDF contact list). Extract every distinct company mentioned
into structured records.

For each company, extract:
- company_name (required -- skip anything with no identifiable company name)
- website (a URL or domain, if present)
- industry (if stated or clearly implied)
- company_size (employee count or a size band, if present)
- location (city/region/country, if present)
- description (a short one-line note about the company, if the source gives one)

Only extract companies actually present in the source below -- never invent one, and
never fill in a field with a guess the source doesn't support (leave it null instead).

SOURCE:
${rawContent}`;
}
