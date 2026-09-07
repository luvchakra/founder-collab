export type CustomFieldType = "text" | "number" | "date" | "boolean" | "select";

export interface CustomFieldDef {
  id: string;
  business_id: string;
  entity_type: string;
  service_type_id: string | null;
  key: string;
  label: string;
  field_type: CustomFieldType;
  options: string[] | null;
  is_required: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CustomFieldValue {
  id: string;
  business_id: string;
  field_def_id: string;
  entity_id: string;
  value: unknown;
  created_at: string;
  updated_at: string;
}
