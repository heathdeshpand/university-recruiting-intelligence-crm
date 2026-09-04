import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Aggregate queries behind the dashboard and the data-quality panel.
 *
 * All counting happens in Postgres. The browser never receives the underlying
 * rows, which is both a performance and a data-minimization decision.
 */

export interface DashboardStats {
  universities: number;
  sourcesDiscovered: number;
  sourcesActive: number;
  sourcesFailed: number;
  sourcesNotFound: number;
  rawRecords: number;
  normalizedRecords: number;
  candidates: number;
  highSignalCandidates: number;
  enrichedCandidates: number;
  averageFinalScore: number | null;
  pendingMatches: number;
  runningJobs: number;
  discoveryThreshold: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const threshold = env.DISCOVERY_THRESHOLD;

  const [
    universities,
    sourcesDiscovered,
    sourcesActive,
    sourcesFailed,
    sourcesNotFound,
    rawRecords,
    normalizedRecords,
    candidates,
    highSignalCandidates,
    enrichedCandidates,
    scoreAggregate,
    pendingMatches,
    runningJobs,
  ] = await Promise.all([
    prisma.university.count(),
    prisma.universitySource.count(),
    prisma.universitySource.count({ where: { status: "ACTIVE" } }),
    prisma.universitySource.count({ where: { status: "FAILED" } }),
    prisma.universitySource.count({ where: { status: "UNAVAILABLE" } }),
    prisma.rawRecord.count(),
    prisma.normalizedRecord.count(),
    prisma.candidate.count(),
    prisma.candidate.count({ where: { discoveryScore: { gte: threshold } } }),
    prisma.candidate.count({ where: { enrichmentStatus: "ENRICHED" } }),
    prisma.candidate.aggregate({
      _avg: { finalScore: true },
      where: { finalScore: { not: null } },
    }),
    prisma.entityMatch.count({
      where: { status: { in: ["PROBABLE_MATCH", "MANUAL_REVIEW"] }, manualDecision: null },
    }),
    prisma.job.count({ where: { status: { in: ["QUEUED", "RUNNING"] } } }),
  ]);

  return {
    universities,
    sourcesDiscovered,
    sourcesActive,
    sourcesFailed,
    sourcesNotFound,
    rawRecords,
    normalizedRecords,
    candidates,
    highSignalCandidates,
    enrichedCandidates,
    averageFinalScore:
      scoreAggregate._avg.finalScore === null ? null : Math.round(scoreAggregate._avg.finalScore),
    pendingMatches,
    runningJobs,
    discoveryThreshold: threshold,
  };
}

export interface ScoreBucket {
  label: string;
  min: number;
  max: number;
  count: number;
}

/** Score distribution, used by the analytics panels. */
export async function getScoreDistribution(
  universityId?: string,
  kind: "finalScore" | "discoveryScore" = "finalScore",
): Promise<ScoreBucket[]> {
  const ranges: Array<{ label: string; min: number; max: number }> = [
    { label: "90–100", min: 90, max: 100 },
    { label: "75–89", min: 75, max: 89 },
    { label: "60–74", min: 60, max: 74 },
    { label: "40–59", min: 40, max: 59 },
    { label: "0–39", min: 0, max: 39 },
  ];

  const counts = await Promise.all(
    ranges.map((r) =>
      prisma.candidate.count({
        where: {
          ...(universityId ? { universityId } : {}),
          [kind]: { gte: r.min, lte: r.max },
        },
      }),
    ),
  );

  return ranges.map((r, i) => ({ ...r, count: counts[i] ?? 0 }));
}

export interface DataQuality {
  rawRecords: number;
  normalizedRecords: number;
  /** Raw records that produced no normalized record, and why that happens. */
  unnormalizedRecords: number;
  candidates: number;
  /** How much entity resolution consolidated, 0-1. */
  consolidationRate: number | null;
  unresolvedMatches: number;
  averageMatchConfidence: number | null;
  candidatesNeedingReview: number;

  sourcesTotal: number;
  sourcesActive: number;
  sourcesFailed: number;
  sourcesNotFound: number;
  sourcesNeedingReview: number;

  enrichmentAttempted: number;
  enrichmentMatched: number;
  enrichmentAmbiguous: number;
  enrichmentNoMatch: number;

  /** Fields that are unknown, which is not the same as being absent. */
  missingMajor: number;
  missingGraduationYear: number;
  missingEmail: number;
  unscored: number;

  candidatesBySource: Array<{ name: string; count: number }>;
  candidatesBySignalCategory: Array<{ category: string; count: number }>;
}

/**
 * The data-quality picture for a university, or for everything.
 *
 * Deliberately includes the unflattering numbers. How many raw records never
 * became a person, how many matches nobody has decided, how many candidates
 * have no major recorded -- these are what tell a recruiter how much to trust
 * what they are looking at, and hiding them would make the product feel more
 * confident than it has earned.
 */
export async function getDataQuality(universityId?: string): Promise<DataQuality> {
  const scope = universityId ? { universityId } : {};

  const [
    rawRecords,
    normalizedRecords,
    candidates,
    unresolvedMatches,
    confidence,
    needingReview,
    sourceGroups,
    enrichmentOutcomes,
    missingMajor,
    missingGraduationYear,
    missingEmail,
    unscored,
    sources,
    signalGroups,
  ] = await Promise.all([
    prisma.rawRecord.count({ where: scope }),
    prisma.normalizedRecord.count({ where: scope }),
    prisma.candidate.count({ where: scope }),
    prisma.entityMatch.count({
      where: { ...scope, status: { in: ["PROBABLE_MATCH", "MANUAL_REVIEW"] }, manualDecision: null },
    }),
    prisma.candidate.aggregate({
      where: { ...scope, matchConfidence: { not: null } },
      _avg: { matchConfidence: true },
    }),
    prisma.candidate.count({ where: { ...scope, needsReview: true } }),
    prisma.universitySource.groupBy({
      by: ["status"],
      where: scope,
      _count: { _all: true },
    }),
    prisma.enrichmentResult.groupBy({
      by: ["outcome"],
      where: universityId ? { enrichmentJob: { universityId } } : {},
      _count: { _all: true },
    }),
    prisma.candidate.count({ where: { ...scope, major: null } }),
    prisma.candidate.count({ where: { ...scope, graduationYear: null } }),
    prisma.candidate.count({ where: { ...scope, email: null } }),
    prisma.candidate.count({ where: { ...scope, finalScore: null } }),
    prisma.universitySource.findMany({
      where: { ...scope, recordCount: { gt: 0 } },
      select: { name: true, recordCount: true },
      orderBy: { recordCount: "desc" },
      take: 12,
    }),
    prisma.signal.groupBy({
      by: ["category"],
      where: universityId ? { candidate: { universityId } } : {},
      _count: { _all: true },
      orderBy: { _count: { category: "desc" } },
    }),
  ]);

  const sourceCount = (status: string) =>
    sourceGroups.find((g) => g.status === status)?._count._all ?? 0;
  const outcome = (kind: string) =>
    enrichmentOutcomes.find((g) => g.outcome === kind)?._count._all ?? 0;

  return {
    rawRecords,
    normalizedRecords,
    unnormalizedRecords: Math.max(0, rawRecords - normalizedRecords),
    candidates,
    consolidationRate:
      normalizedRecords > 0 ? Number((1 - candidates / normalizedRecords).toFixed(3)) : null,
    unresolvedMatches,
    averageMatchConfidence: confidence._avg.matchConfidence,
    candidatesNeedingReview: needingReview,

    sourcesTotal: sourceGroups.reduce((sum, g) => sum + g._count._all, 0),
    sourcesActive: sourceCount("ACTIVE"),
    sourcesFailed: sourceCount("FAILED"),
    sourcesNotFound: sourceCount("UNAVAILABLE"),
    sourcesNeedingReview: sourceCount("REQUIRES_REVIEW"),

    enrichmentAttempted: enrichmentOutcomes.reduce((sum, g) => sum + g._count._all, 0),
    enrichmentMatched: outcome("MATCHED"),
    enrichmentAmbiguous: outcome("AMBIGUOUS"),
    enrichmentNoMatch: outcome("NO_MATCH"),

    missingMajor,
    missingGraduationYear,
    missingEmail,
    unscored,

    candidatesBySource: sources.map((s) => ({ name: s.name, count: s.recordCount })),
    candidatesBySignalCategory: signalGroups.map((g) => ({
      category: g.category,
      count: g._count._all,
    })),
  };
}
