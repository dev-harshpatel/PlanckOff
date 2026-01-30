"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Database,
  LayoutDashboard,
  LayoutTemplate,
  Settings,
  Users,
  LucideIcon,
} from "lucide-react";
import { ProfileDropdown } from "@/components/features/auth";
import { useRBAC } from "@/hooks/useRBAC";
import { RoleName } from "@/types/team";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  allowedRoles?: RoleName[]; // If undefined, all authenticated users can access
}

/**
 * Navigation Items Configuration
 *
 * To add a new route:
 * 1. Add the nav item here with optional allowedRoles
 * 2. Add the route permission in src/lib/auth/rbac.ts (ROUTE_PERMISSIONS)
 * 3. Create the page in src/app/(protected)/[route]/page.tsx
 */
const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/team",
    label: "Team Management",
    icon: Users,
    allowedRoles: ["Administrator", "Team Lead"],
  },
  {
    href: "/database",
    label: "Database",
    icon: Database,
  },
  {
    href: "/assemblies",
    label: "Default Assemblies",
    icon: LayoutTemplate,
  },
];

interface NavbarProps {
  onOpenSettings?: () => void;
}

export function Navbar({ onOpenSettings }: NavbarProps) {
  const pathname = usePathname();
  const { userRole, hasAnyRole } = useRBAC();

  // Filter nav items based on user's role
  const visibleNavItems = NAV_ITEMS.filter((item) => {
    // If no allowedRoles specified, everyone can see it
    if (!item.allowedRoles) return true;
    // Check if user has one of the allowed roles
    return hasAnyRole(item.allowedRoles);
  });

  const isActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/" || pathname === "/dashboard";
    }
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 bg-white border-b border-slate-200 flex-none z-50">
      <div className="w-full px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center">
            <img
              src="/images/logo.svg"
              alt="PlanckOff"
              className="h-20 w-auto object-contain"
            />
          </Link>

          <nav className="flex items-center gap-1">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2
                    ${
                      isActive(item.href)
                        ? "text-blue-700 bg-blue-50"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}

            <div className="h-6 w-px bg-slate-200 mx-2" />

            <button
              onClick={onOpenSettings}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
          </nav>
        </div>

        <ProfileDropdown />
      </div>
    </header>
  );
}
