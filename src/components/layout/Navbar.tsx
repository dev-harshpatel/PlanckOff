"use client";

import { usePathname } from "next/navigation";
import { NavLink } from "@/components/ui/NavLink";
import {
  Bot,
  Database,
  LayoutDashboard,
  LayoutTemplate,
  Users,
  LucideIcon,
} from "lucide-react";
import { ProfileDropdown } from "@/components/features/auth";
import { useRBAC } from "@/hooks/useRBAC";
import { getNavItemsForRole } from "@/lib/auth/rbac";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
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
  },
  // {
  //   href: "/admin/roles",
  //   label: "Role Management",
  //   icon: Shield,
  // },
  {
    href: "/database",
    label: "Database",
    icon: Database,
  },
  {
    href: "/prompts",
    label: "AI Prompts",
    icon: Bot,
  },
  {
    href: "/assemblies",
    label: "Default Assemblies",
    icon: LayoutTemplate,
  },
];

export function Navbar() {
  const pathname = usePathname();
  const { userRole } = useRBAC();

  const accessiblePaths = new Set(
    userRole ? getNavItemsForRole(userRole).map((item) => item.path) : [],
  );
  const visibleNavItems = NAV_ITEMS.filter((item) => accessiblePaths.has(item.href));

  const isActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/" || pathname === "/dashboard";
    }
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 bg-white border-b border-slate-200 flex-none z-50">
      <div className="w-full px-6 h-20 grid grid-cols-3 items-center">

        {/* Left — Logo: h-20 container clips the h-[7rem] SVG to show the brand content */}
        <div className="h-20 overflow-hidden flex items-center">
          <NavLink href="/dashboard" className="flex items-center">
            <img
              src="/images/logo.svg"
              alt="PlanckOff"
              className="h-[7rem] w-auto"
            />
          </NavLink>
        </div>

        {/* Center — Nav items, truly centered via grid */}
        <nav className="flex items-center justify-center gap-0.5">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.href}
                href={item.href}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  isActive(item.href)
                    ? "text-emerald-700 bg-emerald-50"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        {/* Right — Profile */}
        <div className="flex justify-end">
          <ProfileDropdown />
        </div>

      </div>
    </header>
  );
}
