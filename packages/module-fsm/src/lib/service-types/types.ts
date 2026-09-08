export interface ServiceTypeOption {
  id: string;
  name: string;
}

export interface ServiceType {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}
