"use client";

import {
  Target,
  Package,
  Wrench,
  Inbox,
  Receipt,
  LayoutDashboard,
  Shield,
  Bell,
  BarChart3,
  Briefcase,
  CalendarDays,
  ClipboardList,
  FileText,
  History,
  KeyRound,
  Radio,
  RefreshCw,
  RotateCcw,
  Route,
  Settings,
  ShoppingCart,
  Smartphone,
  Truck,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Target,
  Package,
  Wrench,
  Inbox,
  Receipt,
  LayoutDashboard,
  Shield,
  Bell,
  BarChart3,
  Briefcase,
  CalendarDays,
  ClipboardList,
  FileText,
  History,
  KeyRound,
  Radio,
  RefreshCw,
  RotateCcw,
  Route,
  Settings,
  ShoppingCart,
  Smartphone,
  Truck,
  Users,
  Warehouse,
};

/** Resolves a module manifest's lucide-react icon name to its component, falling back
 * to a generic dashboard icon for a name this shell doesn't recognize yet. */
export function ModuleIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? LayoutDashboard;
  return <Icon className={className} />;
}
