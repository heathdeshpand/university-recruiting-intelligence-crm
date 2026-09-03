"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Database,
  FileSpreadsheet,
  GitMerge,
  LayoutDashboard,
  ListChecks,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/util/cn";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Match this route only when the pathname is exactly `href`. */
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/universities", label: "Universities", icon: Building2 },
  { href: "/candidates", label: "Candidates", icon: Users },
  { href: "/sources", label: "Sources", icon: Database },
  { href: "/entity-resolution", label: "Entity Resolution", icon: GitMerge },
  { href: "/jobs", label: "Jobs", icon: ListChecks },
  { href: "/exports", label: "Exports", icon: FileSpreadsheet },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5 px-3 py-4" aria-label="Primary">
      {NAV_ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
