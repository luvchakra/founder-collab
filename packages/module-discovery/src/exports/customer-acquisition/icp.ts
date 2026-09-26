// EXP-DISC-06 -- ICP export (/[businessSlug]/discovery/offerings/[productId]/icp).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { getIcpProfile, listIcpProfileVersions } from "../../lib/icp/queries";
import type { IcpProfile, IcpProfileVersion } from "../../lib/icp/types";
import { listBuyerPersonas } from "../../lib/personas/queries";
import { PERSONA_PRIORITY_LABEL, PERSONA_ROLE_LABEL, type BuyerPersona } from "../../lib/personas/types";
import { BASIS, labelOf, readProductId, resolveOffering } from "./shared";

// The ICP page's own wording (components/icp/icp-version-history.tsx).
const VERSION_SOURCE_LABEL: Record<string, string> = { ai_generated: "AI generated", user_edit: "Manual edit" };
const ICP_STATUS_LABEL: Record<string, string> = { draft: "Draft", approved: "Approved" };

/** The ICP's content fields, in the edit form's order, with the form's labels. */
const CONTENT_FIELDS: { key: keyof IcpProfileVersion & keyof IcpProfile; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "description", label: "Description" },
  { key: "industries", label: "Industries" },
  { key: "company_sizes", label: "Company sizes" },
  { key: "geographies", label: "Geographies" },
  { key: "roles", label: "Roles" },
  { key: "pain_points", label: "Pain points" },
  { key: "buying_signals", label: "Buying signals" },
  { key: "exclusions", label: "Exclusions" },
  { key: "revenue", label: "Revenue" },
  { key: "business_model", label: "Business model" },
  { key: "technology", label: "Technology" },
  { key: "growth_stage", label: "Growth stage" },
  { key: "existing_tools", label: "Existing tools" },
  { key: "confidence", label: "Confidence" },
  { key: "evidence", label: "Evidence" },
  { key: "status", label: "Status" },
];

type VersionRow = IcpProfileVersion & { changed: string };
type EvidenceRow = { index: number; statement: string };

/** "Industries, Roles" -- the fields that differ from the version before; the first
 * version has nothing to differ from. */
export function changedFieldsSummary(version: IcpProfileVersion, previous: IcpProfileVersion | undefined): string {
  if (!previous) return "Initial version";
  const changed = CONTENT_FIELDS.filter(({ key }) => JSON.stringify(version[key]) !== JSON.stringify(previous[key])).map((f) => f.label);
  return changed.length > 0 ? changed.join(", ") : "No content changes";
}

/**
 * The ICP page's datasets: the current ICP (one row, each list field joined), the
 * offering's buyer personas, the ICP's evidence as one row per item (never a JSON blob),
 * and its version history with who/what produced each version and which fields changed.
 * Same queries the page makes; an offering with no ICP yet still exports its personas.
 */
export const discoveryIcpExport: ExportAdapter<{ productId: string }> = {
  id: "discovery.icp",
  module: "discovery",
  permissions: [],
  parseFilters: (params) => ({ productId: readProductId(params) }),
  describeFilters: (f) => ({ Offering: f.productId }),
  async load(context, filters) {
    const { product, workspace } = await resolveOffering(context, filters.productId);
    const [icp, personas] = await Promise.all([getIcpProfile(workspace.id), listBuyerPersonas(workspace.id)]);
    const versions = icp ? await listIcpProfileVersions(icp.id) : [];

    const versionRows: VersionRow[] = versions.map((version, i) => ({ ...version, changed: changedFieldsSummary(version, versions[i + 1]) }));
    const evidenceRows: EvidenceRow[] = (icp?.evidence ?? []).map((statement, i) => ({ index: i + 1, statement }));
    const currentSource = versions[0]?.source ?? null;

    return {
      module: "discovery",
      resource: "icp",
      title: "Ideal customer profile",
      metadata: { Offering: product.name },
      sheets: [
        {
          sheetName: "ICP Profile",
          columns: [
            ...CONTENT_FIELDS.filter(({ key }) => !["confidence", "evidence", "status"].includes(key)).map(({ key, label }) => ({
              key,
              header: label,
              getValue: (p: IcpProfile) => p[key],
            })),
            { key: "status", header: "Status", getValue: (p: IcpProfile) => labelOf(ICP_STATUS_LABEL, p.status) },
            { key: "version", header: "Version", type: "integer", getValue: (p: IcpProfile) => (p.version > 0 ? p.version : null) },
            { key: "source", header: "Current version source", getValue: () => labelOf(VERSION_SOURCE_LABEL, currentSource) },
            { key: "confidence", header: "Confidence", type: "percent", getValue: (p: IcpProfile) => p.confidence },
            { key: "confidence_basis", header: "Confidence basis", getValue: (p: IcpProfile) => (p.confidence === null ? null : BASIS.aiDerived) },
            { key: "created", header: "Created", type: "datetime", getValue: (p: IcpProfile) => p.created_at },
            { key: "updated", header: "Updated", type: "datetime", getValue: (p: IcpProfile) => p.updated_at },
          ],
          rows: icp ? [icp] : [],
        },
        {
          sheetName: "Personas",
          columns: [
            { key: "title", header: "Persona", getValue: (p: BuyerPersona) => p.title },
            { key: "role", header: "Role in buying committee", getValue: (p: BuyerPersona) => labelOf(PERSONA_ROLE_LABEL, p.role_in_committee) },
            { key: "priority", header: "Priority", getValue: (p: BuyerPersona) => labelOf(PERSONA_PRIORITY_LABEL, p.priority) },
            { key: "notes", header: "Notes", getValue: (p: BuyerPersona) => p.notes },
            { key: "created", header: "Created", type: "datetime", getValue: (p: BuyerPersona) => p.created_at },
            { key: "updated", header: "Updated", type: "datetime", getValue: (p: BuyerPersona) => p.updated_at },
          ],
          rows: personas,
        },
        {
          sheetName: "Evidence",
          columns: [
            { key: "index", header: "#", type: "integer", getValue: (e: EvidenceRow) => e.index },
            { key: "evidence", header: "Evidence", getValue: (e: EvidenceRow) => e.statement },
            { key: "basis", header: "Basis", getValue: () => BASIS.aiDerived },
          ],
          rows: evidenceRows,
        },
        {
          sheetName: "Version History",
          columns: [
            { key: "version", header: "Version", type: "integer", getValue: (v: VersionRow) => v.version },
            { key: "created", header: "Created", type: "datetime", getValue: (v: VersionRow) => v.created_at },
            { key: "source", header: "Source", getValue: (v: VersionRow) => labelOf(VERSION_SOURCE_LABEL, v.source) },
            { key: "status", header: "Status", getValue: (v: VersionRow) => labelOf(ICP_STATUS_LABEL, v.status) },
            { key: "changed", header: "Changed fields", getValue: (v: VersionRow) => v.changed },
            { key: "confidence", header: "Confidence", type: "percent", getValue: (v: VersionRow) => v.confidence },
          ],
          rows: versionRows,
        },
      ],
    };
  },
};
