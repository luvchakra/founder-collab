export type CustomFieldType = "text" | "number" | "date" | "boolean" | "select";

export interface CustomFieldDef {
  id: string;
  entity_type: string;
  service_type_id: string | null;
  key: string;
  label: string;
  field_type: CustomFieldType;
  options: string[] | null;
  is_required: boolean;
  sort_order: number;
}

export interface CustomFieldWithValue extends CustomFieldDef {
  value: unknown;
}
