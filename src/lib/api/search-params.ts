import type { CandidateQuery, CandidateSortField } from "@/lib/api/candidates";
import type { FilterState } from "@/components/app/candidate-filters";

/**
 * Translates URL search params into a validated candidate query.
 *
 * Anything unparseable is dropped rather than rejected: a hand-edited URL
 * should degrade to a broader result set, not an error page.
 */

export type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function all(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function int(value: string | undefined, min: number, max: number): number | undefined {
  if (value === undefined || value === "") return undefined;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return n;
}

const SORT_FIELDS: CandidateSortField[] = [
  "finalScore", "discoveryScore", "canonicalName", "graduationYear", "recordCount", "signalCount",
];

const ENUM_VALUES = {
  tier: ["TIER_A", "TIER_B", "TIER_C", "TIER_D", "UNRANKED"],
  status: ["NEW", "DISCOVERED", "QUALIFIED", "ENRICHED", "REVIEWED", "ARCHIVED"],
  enrichmentStatus: ["NOT_ELIGIBLE", "QUEUED", "PROCESSING", "ENRICHED", "FAILED", "MANUAL_REVIEW"],
} as const;

function enumValue<K extends keyof typeof ENUM_VALUES>(
  key: K,
  value: string | undefined,
): (typeof ENUM_VALUES)[K][number] | undefined {
  if (!value) return undefined;
  return (ENUM_VALUES[key] as readonly string[]).includes(value)
    ? (value as (typeof ENUM_VALUES)[K][number])
    : undefined;
}

export function parseCandidateQuery(
  params: RawSearchParams,
  universityId?: string,
): CandidateQuery {
  const sortRaw = first(params.sort);
  const sort = SORT_FIELDS.includes(sortRaw as CandidateSortField)
    ? (sortRaw as CandidateSortField)
    : undefined;

  const hasEmailRaw = first(params.hasEmail);

  return {
    universityId,
    search: first(params.search) || undefined,
    tier: enumValue("tier", first(params.tier)),
    status: enumValue("status", first(params.status)),
    enrichmentStatus: enumValue("enrichmentStatus", first(params.enrichmentStatus)),
    major: first(params.major) || undefined,
    graduationYear: int(first(params.graduationYear), 1900, 2100),
    minFinalScore: int(first(params.minFinalScore), 0, 100),
    maxFinalScore: int(first(params.maxFinalScore), 0, 100),
    minDiscoveryScore: int(first(params.minDiscoveryScore), 0, 100),
    signals: all(params.signals).filter(Boolean),
    hasEmail: hasEmailRaw === "true" ? true : hasEmailRaw === "false" ? false : undefined,
    needsReview: first(params.needsReview) === "true" ? true : undefined,
    sourceId: first(params.sourceId) || undefined,
    sort,
    direction: first(params.direction) === "asc" ? "asc" : "desc",
    page: int(first(params.page), 1, 100_000) ?? 1,
  };
}

/** The same params, in the shape the filter form re-renders from. */
export function toFilterState(params: RawSearchParams): FilterState {
  return {
    search: first(params.search),
    tier: first(params.tier),
    status: first(params.status),
    enrichmentStatus: first(params.enrichmentStatus),
    major: first(params.major),
    graduationYear: first(params.graduationYear),
    minFinalScore: first(params.minFinalScore),
    maxFinalScore: first(params.maxFinalScore),
    minDiscoveryScore: first(params.minDiscoveryScore),
    signals: all(params.signals),
    hasEmail: first(params.hasEmail),
    needsReview: first(params.needsReview),
    sort: first(params.sort),
    direction: first(params.direction),
  };
}

/** How many filters are actually narrowing the result set. */
export function countActiveFilters(params: RawSearchParams): number {
  const ignored = new Set(["sort", "direction", "page"]);
  let count = 0;
  for (const [key, value] of Object.entries(params)) {
    if (ignored.has(key)) continue;
    const values = all(value).filter((v) => v !== "");
    count += values.length;
  }
  return count;
}

/** Rebuilds the current URL with one parameter replaced. */
export function buildQueryString(params: RawSearchParams, overrides: Record<string, string>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (key in overrides) continue;
    for (const v of all(value)) {
      if (v !== "") search.append(key, v);
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value !== "") search.set(key, value);
  }

  const query = search.toString();
  return query ? `?${query}` : "";
}
