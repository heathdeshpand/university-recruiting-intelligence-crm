import type { MatchStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { MatchView } from "@/components/app/match-review";

/** Loading and shaping entity matches for the review queue and analytics. */

export interface MatchQuery {
  universityId?: string;
  status?: MatchStatus;
  /** Include pairs a reviewer has already ruled on. */
  includeDecided?: boolean;
  page?: number;
  pageSize?: number;
}

export const MATCH_PAGE_SIZE = 20;

export async function queryMatches(query: MatchQuery) {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = query.pageSize ?? MATCH_PAGE_SIZE;

  const where: Prisma.EntityMatchWhereInput = {
    ...(query.universityId ? { universityId: query.universityId } : {}),
    ...(query.status ? { status: query.status } : { status: { in: ["PROBABLE_MATCH", "MANUAL_REVIEW"] } }),
    ...(query.includeDecided ? {} : { manualDecision: null }),
  };

  const [rows, total] = await Promise.all([
    prisma.entityMatch.findMany({
      where,
      // Highest-scoring first: the pairs most likely to be real merges are
      // also the quickest for a reviewer to decide.
      orderBy: { matchScore: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        university: { select: { name: true, slug: true } },
        recordA: {
          include: { rawRecord: { include: { source: { select: { name: true, url: true } } } } },
        },
        recordB: {
          include: { rawRecord: { include: { source: { select: { name: true, url: true } } } } },
        },
      },
    }),
    prisma.entityMatch.count({ where }),
  ]);

  return { matches: rows, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

type MatchRow = Awaited<ReturnType<typeof queryMatches>>["matches"][number];

export function toMatchView(match: MatchRow): MatchView {
  const shape = (record: MatchRow["recordA"]) => ({
    id: record.id,
    normalizedName: record.normalizedName,
    rawName: record.rawRecord.rawName,
    organization: record.organization,
    role: record.role,
    major: record.major,
    graduationYear: record.graduationYear,
    email: record.email,
    sourceName: record.rawRecord.source.name,
    sourceUrl: record.rawRecord.source.url,
  });

  return {
    id: match.id,
    matchScore: match.matchScore,
    confidence: match.confidence,
    status: match.status,
    matchingFactors: (match.matchingFactors ?? []) as MatchView["matchingFactors"],
    conflictingFactors: (match.conflictingFactors ?? []) as MatchView["conflictingFactors"],
    recordA: shape(match.recordA),
    recordB: shape(match.recordB),
    candidateAId: match.candidateAId,
    candidateBId: match.candidateBId,
  };
}

export interface MatchAnalytics {
  total: number;
  autoMatched: number;
  probable: number;
  manualReview: number;
  notMatched: number;
  confirmedByHuman: number;
  rejectedByHuman: number;
  pending: number;
  averageConfidence: number | null;
  totalRecords: number;
  totalCandidates: number;
  duplicateRate: number | null;
}

export async function getMatchAnalytics(universityId?: string): Promise<MatchAnalytics> {
  const scope = universityId ? { universityId } : {};

  const [byStatus, decisions, aggregate, totalRecords, totalCandidates, pending] = await Promise.all([
    prisma.entityMatch.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
    prisma.entityMatch.groupBy({
      by: ["manualDecision"],
      where: { ...scope, manualDecision: { not: null } },
      _count: { _all: true },
    }),
    prisma.entityMatch.aggregate({ where: scope, _avg: { confidence: true }, _count: { _all: true } }),
    prisma.normalizedRecord.count({ where: scope }),
    prisma.candidate.count({ where: scope }),
    prisma.entityMatch.count({
      where: { ...scope, status: { in: ["PROBABLE_MATCH", "MANUAL_REVIEW"] }, manualDecision: null },
    }),
  ]);

  const count = (status: string) => byStatus.find((s) => s.status === status)?._count._all ?? 0;
  const decision = (value: string) =>
    decisions.find((d) => d.manualDecision === value)?._count._all ?? 0;

  return {
    total: aggregate._count._all,
    autoMatched: count("AUTO_MATCHED"),
    probable: count("PROBABLE_MATCH"),
    manualReview: count("MANUAL_REVIEW"),
    notMatched: count("NOT_MATCHED"),
    confirmedByHuman: decision("CONFIRMED"),
    rejectedByHuman: decision("REJECTED"),
    pending,
    averageConfidence: aggregate._avg.confidence,
    totalRecords,
    totalCandidates,
    // How much consolidation resolution achieved: 0 means every record was a
    // distinct person, 0.5 means the records collapsed to half as many people.
    duplicateRate:
      totalRecords > 0 ? Number((1 - totalCandidates / totalRecords).toFixed(3)) : null,
  };
}
