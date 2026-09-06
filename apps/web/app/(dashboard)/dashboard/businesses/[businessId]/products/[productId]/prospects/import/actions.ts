"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { parseProspectsCsv } from "@cofounderai/module-discovery/lib/prospects/csv";
import {
  createProspectsBulk,
  extractDomain,
} from "@cofounderai/module-discovery/lib/prospects/mutations";
import { findDuplicateProspect } from "@cofounderai/module-discovery/lib/prospects/duplicates";

export async function importProspectsAction(
  businessId: string,
  productId: string,
  workspaceId: string,
  formData: FormData,
) {
  const csv = String(formData.get("csv") ?? "");
  const { rows, errors } = parseProspectsCsv(csv);

  if (rows.length === 0) {
    throw new Error(errors[0] ?? "No valid rows to import.");
  }

  // Dedup against both the existing pipeline and the rest of this same paste (two rows
  // in one CSV can share a domain/name) -- docs/prospects-pipeline-redesign-
  // requirements.md R9.
  const seenDomains = new Set<string>();
  const seenNames = new Set<string>();
  const toInsert: typeof rows = [];
  let duplicates = 0;

  for (const row of rows) {
    const domain = row.website ? extractDomain(row.website) : null;
    const name = row.companyName.trim().toLowerCase();
    const inBatch = (domain !== null && seenDomains.has(domain)) || seenNames.has(name);
    const existing = inBatch
      ? null
      : await findDuplicateProspect(workspaceId, {
          companyName: row.companyName,
          website: row.website,
        });

    if (inBatch || existing) {
      duplicates += 1;
      continue;
    }
    if (domain) seenDomains.add(domain);
    seenNames.add(name);
    toInsert.push(row);
  }

  const inserted = toInsert.length > 0 ? await createProspectsBulk(workspaceId, toInsert) : 0;

  const prospectsPath = `/dashboard/businesses/${businessId}/products/${productId}/prospects`;
  revalidatePath(prospectsPath);
  redirect(
    `${prospectsPath}?imported=${inserted}&skipped=${errors.length}&duplicates=${duplicates}`,
  );
}
