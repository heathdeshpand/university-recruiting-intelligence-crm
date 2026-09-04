import Link from "next/link";
import { Search, X } from "lucide-react";
import { SIGNAL_DEFINITIONS } from "@/lib/config/signals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

/**
 * The CRM filter bar.
 *
 * A plain <form method="get">, deliberately. Filters end up in the URL, which
 * makes a filtered view shareable and bookmarkable, survives a reload, and
 * lets the server do the filtering. A JavaScript-driven filter panel would
 * cost all three for no visible gain.
 */

export interface FilterState {
  search?: string;
  tier?: string;
  status?: string;
  enrichmentStatus?: string;
  major?: string;
  graduationYear?: string;
  minFinalScore?: string;
  maxFinalScore?: string;
  minDiscoveryScore?: string;
  signals?: string[];
  hasEmail?: string;
  needsReview?: string;
  sort?: string;
  direction?: string;
}

const SIGNAL_GROUPS = [
  { label: "Social", keys: ["GREEK_MEMBERSHIP", "ORG_MEMBERSHIP", "MULTIPLE_ORGS", "STUDENT_GOVERNMENT"] },
  { label: "Competitive", keys: ["CLUB_SPORT", "VARSITY_ATHLETICS", "COMPETITIVE_ORG", "INTRAMURAL"] },
  { label: "Leadership", keys: ["LEADERSHIP_ROLE", "FOUNDER", "MULTIPLE_LEADERSHIP"] },
  { label: "Career", keys: ["SALES_ORG", "SALES_EXPERIENCE", "ENTREPRENEURSHIP_ORG", "BUSINESS_ORG", "CUSTOMER_FACING_EXPERIENCE"] },
  { label: "Timing", keys: ["NEAR_GRADUATION", "JOB_SEEKING"] },
];

const LABEL_BY_KEY = new Map(SIGNAL_DEFINITIONS.map((d) => [d.key, d.label]));

export function CandidateFilters({
  action,
  filters,
  majors,
  years,
  activeCount,
}: {
  action: string;
  filters: FilterState;
  majors: string[];
  years: number[];
  activeCount: number;
}) {
  const selectedSignals = new Set(filters.signals ?? []);

  return (
    <form method="get" action={action} className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-56 flex-1 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Search by name</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="search"
              defaultValue={filters.search ?? ""}
              placeholder="Name contains…"
              className="pl-8"
            />
          </div>
        </label>

        <label className="w-32 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Tier</span>
          <Select name="tier" defaultValue={filters.tier ?? ""}>
            <option value="">Any</option>
            <option value="TIER_A">A</option>
            <option value="TIER_B">B</option>
            <option value="TIER_C">C</option>
            <option value="TIER_D">D</option>
            <option value="UNRANKED">Not scored</option>
          </Select>
        </label>

        <label className="w-28 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Min final</span>
          <Input name="minFinalScore" type="number" min={0} max={100} defaultValue={filters.minFinalScore ?? ""} />
        </label>

        <label className="w-28 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Max final</span>
          <Input name="maxFinalScore" type="number" min={0} max={100} defaultValue={filters.maxFinalScore ?? ""} />
        </label>

        <label className="w-32 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Min discovery</span>
          <Input name="minDiscoveryScore" type="number" min={0} max={100} defaultValue={filters.minDiscoveryScore ?? ""} />
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="w-44 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Major</span>
          <Select name="major" defaultValue={filters.major ?? ""}>
            <option value="">Any</option>
            {majors.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </label>

        <label className="w-36 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Graduation year</span>
          <Select name="graduationYear" defaultValue={filters.graduationYear ?? ""}>
            <option value="">Any</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </label>

        <label className="w-40 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Status</span>
          <Select name="status" defaultValue={filters.status ?? ""}>
            <option value="">Any</option>
            <option value="DISCOVERED">Discovered</option>
            <option value="QUALIFIED">Qualified</option>
            <option value="ENRICHED">Enriched</option>
            <option value="REVIEWED">Reviewed</option>
            <option value="ARCHIVED">Archived</option>
          </Select>
        </label>

        <label className="w-44 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Enrichment</span>
          <Select name="enrichmentStatus" defaultValue={filters.enrichmentStatus ?? ""}>
            <option value="">Any</option>
            <option value="NOT_ELIGIBLE">Below threshold</option>
            <option value="QUEUED">Queued</option>
            <option value="ENRICHED">Enriched</option>
            <option value="FAILED">No match</option>
            <option value="MANUAL_REVIEW">Ambiguous</option>
          </Select>
        </label>

        <label className="w-36 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Email</span>
          <Select name="hasEmail" defaultValue={filters.hasEmail ?? ""}>
            <option value="">Any</option>
            <option value="true">Has an email</option>
            <option value="false">No email</option>
          </Select>
        </label>

        <label className="w-40 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Sort by</span>
          <Select name="sort" defaultValue={filters.sort ?? "finalScore"}>
            <option value="finalScore">Final score</option>
            <option value="discoveryScore">Discovery score</option>
            <option value="canonicalName">Name</option>
            <option value="graduationYear">Graduation year</option>
            <option value="signalCount">Signal count</option>
            <option value="recordCount">Source records</option>
          </Select>
        </label>

        <label className="w-32 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Order</span>
          <Select name="direction" defaultValue={filters.direction ?? "desc"}>
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </Select>
        </label>
      </div>

      <details className="rounded-md border bg-background p-3" open={selectedSignals.size > 0}>
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
          Filter by signal
          {selectedSignals.size > 0 ? (
            <Badge variant="default" className="ml-2">
              {selectedSignals.size} selected
            </Badge>
          ) : null}
        </summary>

        <div className="mt-3 space-y-3">
          {SIGNAL_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {group.keys.map((key) => (
                  <label key={key} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      name="signals"
                      value={key}
                      defaultChecked={selectedSignals.has(key)}
                      className="size-3.5 rounded border-input"
                    />
                    {LABEL_BY_KEY.get(key) ?? key}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Selecting several signals narrows to candidates that have all of them. A candidate is
            only excluded when the signal is genuinely absent from their evidence — never because a
            source did not cover it.
          </p>
        </div>
      </details>

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm">
          Apply filters
        </Button>
        {activeCount > 0 ? (
          <Button asChild size="sm" variant="ghost">
            <Link href={action}>
              <X />
              Clear {activeCount} filter{activeCount === 1 ? "" : "s"}
            </Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
