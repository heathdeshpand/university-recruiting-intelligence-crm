import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/util/text";
import { badRequest, notFound } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/api/audit";
import { DISCOVERY_CATEGORIES } from "@/lib/config/discovery";
import type { CreateUniversityInput } from "@/lib/api/validation";

/**
 * University creation, lookup and per-university roll-ups.
 */

/** Slug that is unique across universities, with a numeric suffix if needed. */
async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "university";
  let candidate = base;
  let n = 2;
  while (await prisma.university.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  return candidate;
}

export async function createUniversity(input: CreateUniversityInput, actorId: string) {
  const domains = Array.from(new Set([input.primaryDomain, ...input.additionalDomains]));

  const clash = await prisma.universityDomain.findFirst({
    where: { domain: { in: domains } },
    include: { university: { select: { name: true } } },
  });
  if (clash) {
    throw badRequest(
      `The domain ${clash.domain} is already registered to ${clash.university.name}.`,
    );
  }

  const university = await prisma.university.create({
    data: {
      name: input.name,
      shortName: input.shortName || null,
      slug: await uniqueSlug(input.name),
      athleticName: input.athleticName || null,
      aliases: input.aliases.filter(Boolean),
      city: input.city || null,
      state: input.state || null,
      country: input.country,
      notes: input.notes || null,
      domains: {
        create: domains.map((domain, i) => ({ domain, isPrimary: i === 0 })),
      },
    },
    include: { domains: true },
  });

  await recordAudit({
    actorId,
    action: "university.created",
    entityType: "university",
    entityId: university.id,
    universityId: university.id,
    summary: `Created ${university.name}`,
    metadata: { domains },
  });

  return university;
}

export async function getUniversityOr404(idOrSlug: string) {
  const university = await prisma.university.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: {
      domains: { orderBy: [{ isPrimary: "desc" }, { domain: "asc" }] },
      settings: true,
    },
  });
  if (!university) throw notFound("That university does not exist.");
  return university;
}

export interface UniversityOverview {
  sources: {
    total: number;
    active: number;
    validated: number;
    discovered: number;
    failed: number;
    unavailable: number;
    requiresReview: number;
    disabled: number;
  };
  rawRecords: number;
  normalizedRecords: number;
  candidates: number;
  highSignalCandidates: number;
  enrichedCandidates: number;
  scoredCandidates: number;
  averageFinalScore: number | null;
  pendingMatches: number;
  autoMatched: number;
  lastCollectionAt: Date | null;
  discoveryThreshold: number;
  /** Categories discovery searched for and did not find. */
  missingCategories: string[];
}

export async function getUniversityOverview(
  universityId: string,
  defaultThreshold: number,
): Promise<UniversityOverview> {
  const [
    sourceGroups,
    rawRecords,
    normalizedRecords,
    candidates,
    enrichedCandidates,
    scoreAggregate,
    pendingMatches,
    autoMatched,
    lastCollected,
    settings,
    presentTypes,
  ] = await Promise.all([
    prisma.universitySource.groupBy({
      by: ["status"],
      where: { universityId },
      _count: { _all: true },
    }),
    prisma.rawRecord.count({ where: { universityId } }),
    prisma.normalizedRecord.count({ where: { universityId } }),
    prisma.candidate.count({ where: { universityId } }),
    prisma.candidate.count({ where: { universityId, enrichmentStatus: "ENRICHED" } }),
    prisma.candidate.aggregate({
      where: { universityId, finalScore: { not: null } },
      _avg: { finalScore: true },
      _count: { _all: true },
    }),
    prisma.entityMatch.count({
      where: {
        universityId,
        status: { in: ["PROBABLE_MATCH", "MANUAL_REVIEW"] },
        manualDecision: null,
      },
    }),
    prisma.entityMatch.count({ where: { universityId, status: "AUTO_MATCHED" } }),
    prisma.universitySource.findFirst({
      where: { universityId, lastCollectedAt: { not: null } },
      orderBy: { lastCollectedAt: "desc" },
      select: { lastCollectedAt: true },
    }),
    prisma.universitySettings.findUnique({ where: { universityId } }),
    prisma.universitySource.findMany({
      where: { universityId, status: { not: "UNAVAILABLE" } },
      select: { sourceType: true },
      distinct: ["sourceType"],
    }),
  ]);

  const byStatus = (status: string) =>
    sourceGroups.find((g) => g.status === status)?._count._all ?? 0;

  const threshold = settings?.discoveryThreshold ?? defaultThreshold;

  const highSignalCandidates = await prisma.candidate.count({
    where: { universityId, discoveryScore: { gte: threshold } },
  });

  const presentTypeSet = new Set(presentTypes.map((t) => t.sourceType));
  const missingCategories = DISCOVERY_CATEGORIES.filter(
    (c) => !presentTypeSet.has(c.sourceType),
  ).map((c) => c.label);

  return {
    sources: {
      total: sourceGroups.reduce((sum, g) => sum + g._count._all, 0),
      active: byStatus("ACTIVE"),
      validated: byStatus("VALIDATED"),
      discovered: byStatus("DISCOVERED"),
      failed: byStatus("FAILED"),
      unavailable: byStatus("UNAVAILABLE"),
      requiresReview: byStatus("REQUIRES_REVIEW"),
      disabled: byStatus("DISABLED"),
    },
    rawRecords,
    normalizedRecords,
    candidates,
    highSignalCandidates,
    enrichedCandidates,
    scoredCandidates: scoreAggregate._count._all,
    averageFinalScore:
      scoreAggregate._avg.finalScore === null ? null : Math.round(scoreAggregate._avg.finalScore),
    pendingMatches,
    autoMatched,
    lastCollectionAt: lastCollected?.lastCollectedAt ?? null,
    discoveryThreshold: threshold,
    missingCategories,
  };
}

/** Universities with the counts the index page shows. */
export async function listUniversities() {
  return prisma.university.findMany({
    orderBy: { name: "asc" },
    include: {
      domains: { where: { isPrimary: true }, take: 1 },
      _count: { select: { sources: true, candidates: true, rawRecords: true } },
    },
  });
}

export function isUniqueConstraintError(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}
