export type AssignableEntity = "lead" | "opportunity" | "conversation";

export type Assignment = {
  id: string;
  business_id: string;
  entity_type: AssignableEntity;
  entity_id: string;
  owner_id: string;
  assigned_by: string | null;
  assigned_at: string;
  unassigned_at: string | null;
  created_at: string;
};
