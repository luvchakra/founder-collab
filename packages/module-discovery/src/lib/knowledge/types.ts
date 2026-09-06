export type KnowledgeSourceType = "manual" | "website" | "document" | "url";

export type ProductKnowledge = {
  id: string;
  workspace_id: string;
  source_type: KnowledgeSourceType;
  source_name: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
