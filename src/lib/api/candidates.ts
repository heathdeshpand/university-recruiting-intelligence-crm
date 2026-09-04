import type { CandidateStatus, EnrichmentStatus, Prisma, Tier } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Candidate querying for the CRM.
 *
 * Filtering, sorting and pagination all happen in Postgres. The browser only
 * ever receives one page of rows, which is both a performance decision and a
 * data-minimization one: a filter that matches ten thousand people does not
 * ship ten thousand people's details to the client.
 */

export interface CandidateFilters {
  universityId?: string;
  search?: string;
  minFinalScore?: number;
  maxFinalScore?: number;
  minDiscoveryScore?: number;
  tier?: Tier;
  status?: CandidateStatus;
  enrichmentStatus?: EnrichmentStatus;
  major?: string;
  graduationYear?: number;
  /** Signal keys that must all be present with value YES. */
  signals?: string[];
  hasEmail?: boolean;
  needsReview?: boolean;
  sourceId?: string;
  minMatchConfidence?: number;
}

export type CandidateSortField =
  | "finalScore"
  | "discoveryScore"
  | "canonicalName"
  | "graduationYear"
  | "recordCount"
  | "signalCount";

export interface CandidateQuery extends CandidateFilters {
  sort?: CandidateSortField;
  direction?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

function buildWhere(filters: CandidateFilters): Prisma.CandidateWhereInput {
  const where: Prisma.CandidateWhereInput = {};

  if (filters.universityId) where.universityId = filters.universityId;
  if (filters.tier) where.tier = filters.tier;
  if (filters.status) where.status = filters.status;
  if (filters.enrichmentStatus) where.enrichmentStatus = filters.enrichmentStatus;
  if (filters.graduationYear) where.graduationYear = filters.graduationYear;
  if (filters.needsReview) where.needsReview = true;

  if (filters.search) {
    where.canonicalName = { contains: filters.search, mode: "insensitive" };
  }

  if (filters.major) {
    where.major = { contains: filters.major, mode: "insensitive" };
  }

  if (filters.minFinalScore !== undefined || filters.maxFinalScore !== undefined) {
    where.finalScore = {
      ...(filters.minFinalScore !== undefined ? { gte: filters.minFinalScore } : {}),
      ...(filters.maxFinalScore !== undefined ? { lte: filters.maxFinalScore } : {}),
    };
  }

  if (filters.minDiscoveryScore !== undefined) {
    where.discoveryScore = { gte: filters.minDiscoveryScore };
  }

  if (filters.minMatchConfidence !== undefined) {
    where.matchConfidence = { gte: filters.minMatchConfidence };
  }

  if (filters.hasEmail === true) where.email = { not: null };
  if (filters.hasEmail === false) where.email = null;

  // Every requested signal must be present and YES, so the filters compose as
  // "and" rather than "any of", which is what a recruiter narrowing a list
  // expects.
  if (filters.signals && filters.signals.length > 0) {
    where.AND = filters.signals.map((key) => ({
      signals: { some: { definitionKey: key, value: "YES" as const } },
    }));
  }

  if (filters.sourceId) {
    where.sourceRecords = {
      some: { normalizedRecord: { rawRecord: { sourceId: filters.sourceId } } },
    };
  }

  return where;
}

export async function queryCandidates(query: CandidateQuery) {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE));
  const sort = query.sort ?? "finalScore";
  const direction = query.direction ?? "desc";

  const where = buildWhere(query);

  // Nulls last on a descending score sort: unscored candidates should not sit
  // above scored ones just because the column is empty.
  const orderBy: Prisma.CandidateOrderByWithRelationInput[] =
    sort === "finalScore" || sort === "discoveryScore" || sort === "graduationYear"
      ? [{ [sort]: { sort: direction, nulls: "last" } } as Prisma.CandidateOrderByWithRelationInput, { canonicalName: "asc" }]
      : [{ [sort]: direction } as Prisma.CandidateOrderByWithRelationInput, { id: "asc" }];

  const [rows, total] = await Promise.all([
    prisma.candidate.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        university: { select: { name: true, slug: true } },
        signals: { select: { definitionKey: true, category: true, occurrences: true } },
        patterns: { select: { label: true } },
      },
    }),
    prisma.candidate.count({ where }),
  ]);

  return {
    candidates: rows,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Everything the candidate detail page needs, in one round trip. */
export async function getCandidateDetail(id: string) {
  return prisma.candidate.findUnique({
    where: { id },
    include: {
      university: { select: { id: true, name: true, slug: true, isDemo: true } },
      signals: {
        include: {
          definition: true,
          evidenceLinks: { include: { evidence: { include: { source: { select: { name: true, url: true } } } } } },
        },
        orderBy: [{ category: "asc" }, { definitionKey: "asc" }],
      },
      patterns: true,
      scores: {
        include: { factors: { orderBy: { points: "desc" } }, config: { select: { name: true } } },
      },
      evidence: {
        include: { source: { select: { name: true, url: true, sourceType: true } } },
        orderBy: { discoveredAt: "asc" },
      },
      sourceRecords: {
        include: {
          normalizedRecord: {
            include: {
              rawRecord: {
                include: { source: { select: { id: true, name: true, url: true, sourceType: true } } },
              },
            },
          },
        },
      },
      enrichmentJobs: {
        include: { results: true, source: { select: { name: true, url: true } } },
        orderBy: { createdAt: "desc" },
      },
      matchesAsA: {
        include: { recordA: true, recordB: true },
        orderBy: { matchScore: "desc" },
      },
      matchesAsB: {
        include: { recordA: true, recordB: true },
        orderBy: { matchScore: "desc" },
      },
    },
  });
}

export type CandidateDetail = NonNullable<Awaited<ReturnType<typeof getCandidateDetail>>>;
export type CandidateListItem = Awaited<ReturnType<typeof queryCandidates>>["candidates"][number];

/** Distinct majors present at a university, for the filter dropdown. */
export async function listMajors(universityId?: string): Promise<string[]> {
  const rows = await prisma.candidate.findMany({
    where: { ...(universityId ? { universityId } : {}), major: { not: null } },
    select: { major: true },
    distinct: ["major"],
    orderBy: { major: "asc" },
    take: 200,
  });
  return rows.map((r) => r.major!).filter(Boolean);
}

/** Graduation years present, for the filter dropdown. */
export async function listGraduationYears(universityId?: string): Promise<number[]> {
  const rows = await prisma.candidate.findMany({
    where: { ...(universityId ? { universityId } : {}), graduationYear: { not: null } },
    select: { graduationYear: true },
    distinct: ["graduationYear"],
    orderBy: { graduationYear: "asc" },
  });
  return rows.map((r) => r.graduationYear!).filter(Boolean);
}
