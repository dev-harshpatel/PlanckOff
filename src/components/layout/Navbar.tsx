"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Database,
  LayoutDashboard,
  LayoutTemplate,
  Settings,
  Users,
} from "lucide-react";
import { ProfileDropdown } from "@/components/features/auth";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: <LayoutDashboard className="w-4 h-4" />,
  },
  {
    href: "/team",
    label: "Team Management",
    icon: <Users className="w-4 h-4" />,
  },
  {
    href: "/database",
    label: "Database",
    icon: <Database className="w-4 h-4" />,
  },
  {
    href: "/assemblies",
    label: "Default Assemblies",
    icon: <LayoutTemplate className="w-4 h-4" />,
  },
];

interface NavbarProps {
  onOpenSettings?: () => void;
}

export function Navbar({ onOpenSettings }: NavbarProps) {
  const pathname = usePathname();

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
            {NAV_ITEMS.map((item) => (
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
                {item.icon}
                {item.label}
              </Link>
            ))}

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
