import { z } from "zod";
import { createAdminClient } from "../db/admin";
import { createClient } from "../db/server";
import { requireSuperadmin } from "../rbac/platform-admin";
import type { LegalDocument } from "../privacy/legal-acceptance";

/**
 * PLATFORM-P1-09.1 (Terms & Privacy Version) and PLATFORM-P1-09.4 (Policy Acceptance
 * Tracking), docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §31: the versions a superadmin
 * has published, which one is active, and how many users have accepted it. Rules
 * (immutable, audited, superadmin-only) are in migration 20261010160000.
 */

export type LegalVersion = {
  id: string;
  document: LegalDocument;
  version: string;
  contentHash: string;
  summary: string;
  requiresAcceptance: boolean;
  publishedAt: string;
  publishedByEmail: string | null;
};

export type LegalDocumentOverview = {
  document: LegalDocument;
  active: LegalVersion | null;
  /** Users who accepted the active version (signup or prompt). */
  acceptedCount: number | null;
  history: LegalVersion[];
};

type VersionRow = {
  id: string;
  document: LegalDocument;
  version: string;
  content_hash: string;
  summary: string;
  requires_acceptance: boolean;
  published_at: string;
  published_by: string | null;
};

export async function getLegalOverview(): Promise<{ documents: LegalDocumentOverview[]; userCount: number }> {
  await requireSuperadmin();
  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase
    .from("legal_document_versions")
    .select("id, document, version, content_hash, summary, requires_acceptance, published_at, published_by")
    .order("published_at", { ascending: false });
  if (error) throw error;
  const rows = data as VersionRow[];

  // Publisher emails and the user total: superadmin-only page, read with the service role
  // after requireSuperadmin() above.
  const core = createAdminClient({ schema: "core" });
  const publisherIds = Array.from(new Set(rows.map((r) => r.published_by).filter((v): v is string => v !== null)));
  const [profiles, users] = await Promise.all([
    publisherIds.length > 0 ? core.from("user_profiles").select("id, email").in("id", publisherIds) : Promise.resolve({ data: [], error: null }),
    core.from("user_profiles").select("id", { count: "exact", head: true }),
  ]);
  if (profiles.error) throw profiles.error;
  if (users.error) throw users.error;
  const emailById = new Map((profiles.data as { id: string; email: string | null }[]).map((p) => [p.id, p.email]));

  const toVersion = (r: VersionRow): LegalVersion => ({
    id: r.id,
    document: r.document,
    version: r.version,
    contentHash: r.content_hash,
    summary: r.summary,
    requiresAcceptance: r.requires_acceptance,
    publishedAt: r.published_at,
    publishedByEmail: r.published_by ? (emailById.get(r.published_by) ?? null) : null,
  });

  const documents = await Promise.all(
    (["terms", "privacy"] as const).map(async (document): Promise<LegalDocumentOverview> => {
      const history = rows.filter((r) => r.document === document).map(toVersion);
      const active = history[0] ?? null;
      let acceptedCount: number | null = null;
      if (active) {
        const { count, error: countError } = await supabase
          .from("policy_acceptances")
          .select("id", { count: "exact", head: true })
          .eq("version_id", active.id);
        if (countError) throw countError;
        acceptedCount = count ?? 0;
      }
      return { document, active, acceptedCount, history };
    }),
  );
  return { documents, userCount: users.count ?? 0 };
}

export const publishLegalVersionSchema = z.object({
  document: z.enum(["terms", "privacy"]),
  version: z.string().trim().min(1, "Give the version a label.").max(40, "Keep the label to 40 characters."),
  summary: z.string().trim().min(1, "Say what changed.").max(500, "Keep it to 500 characters."),
  requiresAcceptance: z.boolean(),
});

export type PublishLegalVersionInput = z.input<typeof publishLegalVersionSchema>;

type Result = { ok: true } | { ok: false; error: string };

/** `contentHash` is computed by the caller from the text the app serves -- never taken from
 * the browser. */
export async function publishLegalVersion(input: PublishLegalVersionInput, contentHash: string): Promise<Result> {
  await requireSuperadmin();
  const parsed = publishLegalVersionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;
  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.rpc("publish_legal_document_version", {
    p_document: d.document,
    p_version: d.version,
    p_content_hash: contentHash,
    p_summary: d.summary,
    p_requires_acceptance: d.requiresAcceptance,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
