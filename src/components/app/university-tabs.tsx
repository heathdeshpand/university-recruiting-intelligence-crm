"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/util/cn";

const TABS = [
  { segment: "", label: "Overview" },
  { segment: "sources", label: "Sources" },
  { segment: "raw", label: "Raw data" },
  { segment: "candidates", label: "Candidates" },
  { segment: "entity-resolution", label: "Entity resolution" },
  { segment: "enrichment", label: "Enrichment" },
  { segment: "scoring", label: "Scoring" },
  { segment: "exports", label: "Exports" },
  { segment: "jobs", label: "Jobs" },
] as const;

export function UniversityTabs({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/universities/${slug}`;

  return (
    <div className="scrollbar-thin overflow-x-auto border-b bg-card">
      <div className="flex min-w-max gap-1 px-6">
        {TABS.map((tab) => {
          const href = tab.segment ? `${base}/${tab.segment}` : base;
          const active = pathname === href;
          return (
            <Link
              key={tab.segment || "overview"}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
