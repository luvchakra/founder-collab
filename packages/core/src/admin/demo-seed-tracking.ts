import { createAdminClient } from "../db/admin";

/**
 * Generic tracking primitives over core.demo_seed_batches/demo_seed_records (see that
 * migration's own docstring) -- reusable by any module's seeder, not just
 * module-inventory's. A seeder calls createSeedBatch() once, trackSeedRecords() after
 * each table it inserts into, then finalizeSeedBatch() with the total; deleteSeedBatch()
 * (or deleteAllSeedDataForBusiness()) reverses exactly those rows later.
 */

export async function createSeedBatch(
  businessId: string,
  targetUserId: string,
  requestedBy: string,
): Promise<string> {
  const supabase = createAdminClient({ schema: "core" });
  const { data, error } = await supabase
    .from("demo_seed_batches")
    .insert({ business_id: businessId, target_user_id: targetUserId, requested_by: requestedBy })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function trackSeedRecords(
  batchId: string,
  schemaName: string,
  tableName: string,
  recordIds: string[],
): Promise<void> {
  if (recordIds.length === 0) return;
  const supabase = createAdminClient({ schema: "core" });
  const { error } = await supabase.from("demo_seed_records").insert(
    recordIds.map((id) => ({
      batch_id: batchId,
      schema_name: schemaName,
      table_name: tableName,
      record_id: id,
    })),
  );
  if (error) throw error;
}

export async function finalizeSeedBatch(batchId: string, recordCount: number): Promise<void> {
  const supabase = createAdminClient({ schema: "core" });
  const { error } = await supabase
    .from("demo_seed_batches")
    .update({ record_count: recordCount })
    .eq("id", batchId);
  if (error) throw error;
}

export type SeedBatchSummary = {
  id: string;
  created_at: string;
  target_user_id: string;
  requested_by: string;
  record_count: number;
  targetUserEmail: string | null;
  requestedByEmail: string | null;
};

export async function listSeedBatches(businessId: string): Promise<SeedBatchSummary[]> {
  const supabase = createAdminClient({ schema: "core" });
  const { data, error } = await supabase
    .from("demo_seed_batches")
    .select("id, created_at, target_user_id, requested_by, record_count")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (data.length === 0) return [];

  const userIds = [...new Set(data.flatMap((b) => [b.target_user_id, b.requested_by]))];
  const { data: profiles, error: profilesError } = await supabase
    .from("user_profiles")
    .select("id, email")
    .in("id", userIds);
  if (profilesError) throw profilesError;
  const emailById = new Map(profiles.map((p) => [p.id, p.email]));

  return data.map((b) => ({
    ...b,
    targetUserEmail: emailById.get(b.target_user_id) ?? null,
    requestedByEmail: emailById.get(b.requested_by) ?? null,
  }));
}

type TrackedRecord = { schema_name: string; table_name: string; record_id: string };

async function listTrackedRecordsForBusiness(businessId: string): Promise<TrackedRecord[]> {
  const supabase = createAdminClient({ schema: "core" });
  const { data: batches, error } = await supabase
    .from("demo_seed_batches")
    .select("id")
    .eq("business_id", businessId);
  if (error) throw error;
  if (batches.length === 0) return [];

  const { data, error: recordsError } = await supabase
    .from("demo_seed_records")
    .select("schema_name, table_name, record_id")
    .in(
      "batch_id",
      batches.map((b) => b.id),
    );
  if (recordsError) throw recordsError;
  return data;
}

/**
 * Deletes every row this tool ever seeded for a business, across every batch, then the
 * batches themselves. Deletion order matters for a couple of FK-restricted references
 * (core.document_lines.item_id, ON DELETE RESTRICT) -- documents are deleted before
 * items so their lines (ON DELETE CASCADE from documents) are gone before anything
 * checks the item FK; everything else here cascades or has no inbound FK at all.
 * inventory.stock_levels/stock_movements aren't tracked directly -- they cascade away
 * with the core.items row that owns them.
 */
export async function deleteAllSeedDataForBusiness(
  businessId: string,
): Promise<{ deletedBatches: number; deletedRecords: number }> {
  const records = await listTrackedRecordsForBusiness(businessId);
  if (records.length === 0) return { deletedBatches: 0, deletedRecords: 0 };

  const byKey = new Map<string, { schema: string; table: string; ids: string[] }>();
  for (const r of records) {
    const key = `${r.schema_name}.${r.table_name}`;
    const entry = byKey.get(key) ?? { schema: r.schema_name, table: r.table_name, ids: [] };
    entry.ids.push(r.record_id);
    byKey.set(key, entry);
  }

  // Documents (core.documents, written via the inventory.* compat views but tracked
  // under their real core table name) first -- their lines cascade away, clearing the
  // one FK (document_lines.item_id, ON DELETE RESTRICT) that would otherwise block
  // deleting the items below. Everything else here is ON DELETE SET NULL or has no
  // inbound FK, so their relative order doesn't matter.
  const deletionOrder = [
    "core.documents",
    "core.items",
    "core.item_categories",
    "core.parties",
    "inventory.warehouses",
  ];
  const orderedKeys = [...byKey.keys()].sort(
    (a, b) => deletionOrder.indexOf(a) - deletionOrder.indexOf(b),
  );

  for (const key of orderedKeys) {
    const { schema, table, ids } = byKey.get(key)!;
    const supabase = createAdminClient({ schema });
    const { error } = await supabase.from(table).delete().in("id", ids);
    if (error) throw error;
  }

  // Orphaned low-stock alerts: inventory.alerts.entity_id has no FK (it's a generic
  // polymorphic reference), so deleting the stock_levels row it points at (cascaded away
  // with its item above) doesn't remove the alert automatically. Clean up any alert now
  // pointing at a stock_level id that no longer exists for this business.
  const inventoryAdmin = createAdminClient({ schema: "inventory" });
  const { data: remainingLevels, error: levelsError } = await inventoryAdmin
    .from("stock_levels")
    .select("id")
    .eq("business_id", businessId);
  if (levelsError) throw levelsError;
  const remainingLevelIds = new Set(remainingLevels.map((l) => l.id));
  const { data: alerts, error: alertsError } = await inventoryAdmin
    .from("alerts")
    .select("id, entity_id")
    .eq("business_id", businessId)
    .eq("entity_type", "stock_level");
  if (alertsError) throw alertsError;
  const orphanedAlertIds = alerts.filter((a) => !remainingLevelIds.has(a.entity_id)).map((a) => a.id);
  if (orphanedAlertIds.length > 0) {
    const { error: deleteAlertsError } = await inventoryAdmin.from("alerts").delete().in("id", orphanedAlertIds);
    if (deleteAlertsError) throw deleteAlertsError;
  }

  const coreAdmin = createAdminClient({ schema: "core" });
  const { data: deletedBatches, error: deleteBatchesError } = await coreAdmin
    .from("demo_seed_batches")
    .delete()
    .eq("business_id", businessId)
    .select("id");
  if (deleteBatchesError) throw deleteBatchesError;

  return { deletedBatches: deletedBatches.length, deletedRecords: records.length };
}
