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
