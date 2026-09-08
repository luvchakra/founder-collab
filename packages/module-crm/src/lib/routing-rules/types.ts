export type RoutingRule = {
  id: string;
  business_id: string;
  name: string;
  channel_id: string | null;
  assign_to_employee_id: string | null;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type EmployeeOption = {
  id: string;
  full_name: string | null;
  email: string | null;
};
