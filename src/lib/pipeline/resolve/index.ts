import type { CareerStage, Prisma, PrismaClient } from "@prisma/client";
import { buildBlocks, iteratePairs, pairKey } from "@/lib/pipeline/resolve/blocking";
import { clusterRecords, type ClusterEdge } from "@/lib/pipeline/resolve/cluster";
import { buildSurnameFrequency, scorePair } from "@/lib/pipeline/resolve/score";
import { MATCH_THRESHOLDS, type ResolvableRecord } from "@/lib/pipeline/resolve/types";

/**
 * Entity resolution end to end.
 *
 * Order of operations, and why:
 *
 *   1. Load every normalized record for the university.
 *   2. Load prior human decisions first, so nothing computed can override
 *      them.
 *   3. Block, then score each candidate pair, persisting every comparison
 *      that is not clearly a non-match. Persisting near-misses is what makes
 *      the review queue possible.
 *   4. Cluster the confident edges, refusing any merge that would violate a
 *      rejection.
 *   5. Map clusters onto candidate rows, reusing existing candidate ids
 *      wherever the cluster already has one, so that CRM links and manual
 *      edits survive a re-run.
 */

export interface ResolutionProgress {
  (processed: number, total: number, step: string): Promise<void>;
}

export interface ResolutionResult {
  recordsConsidered: number;
  pairsCompared: number;
  autoMatched: number;
  probableMatches: number;
  needsReview: number;
  candidatesCreated: number;
  candidatesUpdated: number;
  candidatesRemoved: number;
  blockedByRejection: number;
  averageConfidence: number | null;
}

/** Picks the most complete display name from a cluster's records. */
function bestName(records: ResolvableRecord[]): {
  canonicalName: string;
  firstName: string | null;
  middleInitial: string | null;
  lastName: string | null;
} {
  // Prefer a record with a middle initial, then the longest first name (a
  // full given name over a nickname), then the longest display form.
  const ranked = [...records].sort((a, b) => {
    const middle = Number(Boolean(b.middleInitial)) - Number(Boolean(a.middleInitial));
    if (middle !== 0) return middle;
    const firstLen = (b.firstName?.length ?? 0) - (a.firstName?.length ?? 0);
    if (firstLen !== 0) return firstLen;
    return b.normalizedName.length - a.normalizedName.length;
  });

  const best = ranked[0]!;
  return {
    canonicalName: best.normalizedName,
    firstName: best.firstName,
    middleInitial: ranked.find((r) => r.middleInitial)?.middleInitial ?? null,
    lastName: best.lastName,
  };
}

/** Most frequent non-null value, ties broken by the larger value. */
function consensus<T extends string | number>(values: Array<T | null | undefined>): T | null {
  const counts = new Map<T, number>();
  for (const v of values) {
    if (v === null || v === undefined) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  if (counts.size === 0) return null;

  let best: T | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && value > best)) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

export function careerStageFor(graduationYear: number | null, now = new Date()): CareerStage {
  if (!graduationYear) return "UNKNOWN";
  const currentYear = now.getFullYear();
  // Academic years run to roughly May, so a "graduating this year" student is
  // near graduation until mid-year and a recent graduate after.
  if (graduationYear > currentYear + 1) return "STUDENT";
  if (graduationYear === currentYear + 1) return "NEAR_GRADUATION";
  if (graduationYear === currentYear) return now.getMonth() >= 5 ? "RECENT_GRADUATE" : "NEAR_GRADUATION";
  if (graduationYear === currentYear - 1) return "RECENT_GRADUATE";
  return "ALUMNI";
}

export async function runEntityResolution(
  prisma: PrismaClient,
  universityId: string,
  report: ResolutionProgress,
  shouldStop: () => Promise<boolean>,
): Promise<ResolutionResult> {
  const records = (await prisma.normalizedRecord.findMany({
    where: { universityId },
    select: {
      id: true,
      normalizedName: true,
      firstName: true,
      middleInitial: true,
      lastName: true,
      suffix: true,
      nameKey: true,
      lastNamePhonetic: true,
      organizationCanonical: true,
      sportCanonical: true,
      majorCanonical: true,
      graduationYear: true,
      email: true,
      rawRecord: { select: { sourceId: true } },
    },
  })) as Array<Omit<ResolvableRecord, "sourceId"> & { rawRecord: { sourceId: string } }>;

  const resolvable: ResolvableRecord[] = records.map((r) => ({
    id: r.id,
    normalizedName: r.normalizedName,
    firstName: r.firstName,
    middleInitial: r.middleInitial,
    lastName: r.lastName,
    suffix: r.suffix,
    nameKey: r.nameKey,
    lastNamePhonetic: r.lastNamePhonetic,
    organizationCanonical: r.organizationCanonical,
    sportCanonical: r.sportCanonical,
    majorCanonical: r.majorCanonical,
    graduationYear: r.graduationYear,
    email: r.email,
    sourceId: r.rawRecord.sourceId,
  }));

  if (resolvable.length === 0) {
    return {
      recordsConsidered: 0, pairsCompared: 0, autoMatched: 0, probableMatches: 0,
      needsReview: 0, candidatesCreated: 0, candidatesUpdated: 0, candidatesRemoved: 0,
      blockedByRejection: 0, averageConfidence: null,
    };
  }

  const byId = new Map(resolvable.map((r) => [r.id, r]));

  // --- Prior human decisions ------------------------------------------------
  const decided = await prisma.entityMatch.findMany({
    where: { universityId, manualDecision: { not: null } },
    select: { recordAId: true, recordBId: true, manualDecision: true },
  });

  const rejectedPairs = new Set<string>();
  const confirmedEdges: ClusterEdge[] = [];
  for (const d of decided) {
    if (d.manualDecision === "REJECTED") rejectedPairs.add(pairKey(d.recordAId, d.recordBId));
    else if (d.manualDecision === "CONFIRMED") {
      confirmedEdges.push({ a: d.recordAId, b: d.recordBId, score: 100 });
    }
  }

  // --- Compare --------------------------------------------------------------
  const frequency = buildSurnameFrequency(resolvable);
  const { blocks, pairCount } = buildBlocks(resolvable);

  await report(0, pairCount, `Comparing ${pairCount.toLocaleString()} candidate pairs`);

  const edges: ClusterEdge[] = [];
  const matchRows: Prisma.EntityMatchCreateManyInput[] = [];
  let compared = 0;
  let autoMatched = 0;
  let probableMatches = 0;
  let needsReview = 0;
  let confidenceSum = 0;
  let confidenceCount = 0;

  for (const [aId, bId] of iteratePairs(blocks)) {
    if (compared % 2000 === 0) {
      if (await shouldStop()) break;
      await report(compared, pairCount, "Scoring pairs");
    }
    compared += 1;

    const a = byId.get(aId);
    const b = byId.get(bId);
    if (!a || !b) continue;

    const result = scorePair(a, b, frequency);

    // Clear non-matches are not persisted: storing every rejected pair would
    // dwarf the useful data and tell a reviewer nothing.
    if (result.matchScore < MATCH_THRESHOLDS.REVIEW) continue;

    confidenceSum += result.confidence;
    confidenceCount += 1;

    if (result.status === "AUTO_MATCHED") {
      autoMatched += 1;
      edges.push({ a: aId, b: bId, score: result.matchScore });
    } else if (result.status === "PROBABLE_MATCH") {
      probableMatches += 1;
    } else {
      needsReview += 1;
    }

    matchRows.push({
      universityId,
      recordAId: aId,
      recordBId: bId,
      matchScore: result.matchScore,
      confidence: result.confidence,
      status: result.status,
      resolutionMethod: "PROBABILISTIC",
      matchingFactors: result.matchingFactors as unknown as Prisma.InputJsonValue,
      conflictingFactors: result.conflictingFactors as unknown as Prisma.InputJsonValue,
    });
  }

  // Persist comparisons, leaving any pair a human has ruled on untouched.
  const decidedKeys = new Set(decided.map((d) => pairKey(d.recordAId, d.recordBId)));
  const fresh = matchRows.filter((row) => !decidedKeys.has(pairKey(row.recordAId, row.recordBId)));

  for (let i = 0; i < fresh.length; i += 1000) {
    const chunk = fresh.slice(i, i + 1000);
    await prisma.entityMatch.deleteMany({
      where: {
        universityId,
        manualDecision: null,
        OR: chunk.map((c) => ({ recordAId: c.recordAId, recordBId: c.recordBId })),
      },
    });
    await prisma.entityMatch.createMany({ data: chunk, skipDuplicates: true });
  }

  await report(pairCount, pairCount, "Clustering");

  // --- Cluster --------------------------------------------------------------
  const pinned = await prisma.candidateSourceRecord.findMany({
    where: { pinned: true, candidate: { universityId } },
    select: { normalizedRecordId: true, candidateId: true },
  });
  const pinnedByRecord = new Map(pinned.map((p) => [p.normalizedRecordId, p.candidateId]));

  const { clusters, blockedByRejection } = clusterRecords(
    resolvable.map((r) => r.id),
    edges,
    rejectedPairs,
    confirmedEdges,
  );

  // --- Map clusters onto candidates ----------------------------------------
  const existingLinks = await prisma.candidateSourceRecord.findMany({
    where: { candidate: { universityId } },
    select: { normalizedRecordId: true, candidateId: true, pinned: true },
  });
  const candidateByRecord = new Map(existingLinks.map((l) => [l.normalizedRecordId, l.candidateId]));

  let candidatesCreated = 0;
  let candidatesUpdated = 0;
  const survivingCandidateIds = new Set<string>();

  let clusterIndex = 0;
  for (const [, memberIds] of clusters) {
    if (clusterIndex % 100 === 0) {
      if (await shouldStop()) break;
      await report(clusterIndex, clusters.size, "Building candidates");
    }
    clusterIndex += 1;

    // A record a human pinned to a candidate stays there, whatever clustering
    // now thinks.
    const freeMembers = memberIds.filter((id) => !pinnedByRecord.has(id));
    if (freeMembers.length === 0) continue;

    const members = freeMembers.map((id) => byId.get(id)!).filter(Boolean);
    if (members.length === 0) continue;

    // Reuse the candidate that already owns the most of these records, so ids
    // stay stable and CRM links keep working across re-runs.
    const ownerCounts = new Map<string, number>();
    for (const id of freeMembers) {
      const owner = candidateByRecord.get(id);
      if (owner) ownerCounts.set(owner, (ownerCounts.get(owner) ?? 0) + 1);
    }
    const reuseId = [...ownerCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    const name = bestName(members);
    const graduationYear = consensus(members.map((m) => m.graduationYear));
    const major = consensus(members.map((m) => m.majorCanonical));
    const sourceCount = new Set(members.map((m) => m.sourceId)).size;

    const clusterConfidence =
      members.length === 1
        ? null
        : Number(
            (
              edges
                .filter((e) => freeMembers.includes(e.a) && freeMembers.includes(e.b))
                .reduce((sum, e, _, arr) => sum + e.score / 100 / Math.max(arr.length, 1), 0) || 0.85
            ).toFixed(2),
          );

    const identityFields = {
      canonicalName: name.canonicalName,
      firstName: name.firstName,
      middleInitial: name.middleInitial,
      lastName: name.lastName,
      major,
      graduationYear,
      careerStage: careerStageFor(graduationYear),
    };

    let candidateId: string;

    if (reuseId) {
      const existing = await prisma.candidate.findUnique({
        where: { id: reuseId },
        select: { manuallyEdited: true },
      });

      await prisma.candidate.update({
        where: { id: reuseId },
        data: {
          // A human's correction to identity is never overwritten by a re-run.
          ...(existing?.manuallyEdited ? {} : identityFields),
          recordCount: members.length,
          sourceCount,
          matchConfidence: clusterConfidence,
        },
      });
      candidateId = reuseId;
      candidatesUpdated += 1;
    } else {
      const created = await prisma.candidate.create({
        data: {
          universityId,
          ...identityFields,
          status: "DISCOVERED",
          recordCount: members.length,
          sourceCount,
          matchConfidence: clusterConfidence,
        },
      });
      candidateId = created.id;
      candidatesCreated += 1;
    }

    survivingCandidateIds.add(candidateId);

    for (const memberId of freeMembers) {
      await prisma.candidateSourceRecord.upsert({
        where: { normalizedRecordId: memberId },
        update: { candidateId },
        create: { candidateId, normalizedRecordId: memberId },
      });
    }
  }

  // Candidates left with no records after re-clustering are removed. Their
  // records have moved to another candidate, so no evidence is lost.
  for (const id of pinnedByRecord.values()) survivingCandidateIds.add(id);

  const emptied = await prisma.candidate.findMany({
    where: { universityId, id: { notIn: [...survivingCandidateIds] }, sourceRecords: { none: {} } },
    select: { id: true },
  });
  if (emptied.length > 0) {
    await prisma.candidate.deleteMany({ where: { id: { in: emptied.map((c) => c.id) } } });
  }

  // Point each match row at the candidates its records now belong to, so the
  // review UI can show candidate A against candidate B.
  await linkMatchesToCandidates(prisma, universityId);

  return {
    recordsConsidered: resolvable.length,
    pairsCompared: compared,
    autoMatched,
    probableMatches,
    needsReview,
    candidatesCreated,
    candidatesUpdated,
    candidatesRemoved: emptied.length,
    blockedByRejection: blockedByRejection.length,
    averageConfidence:
      confidenceCount === 0 ? null : Number((confidenceSum / confidenceCount).toFixed(2)),
  };
}

/** Caches the current candidate ids onto each match row. */
export async function linkMatchesToCandidates(
  prisma: PrismaClient,
  universityId: string,
): Promise<void> {
  const links = await prisma.candidateSourceRecord.findMany({
    where: { candidate: { universityId } },
    select: { normalizedRecordId: true, candidateId: true },
  });
  const owner = new Map(links.map((l) => [l.normalizedRecordId, l.candidateId]));

  const matches = await prisma.entityMatch.findMany({
    where: { universityId },
    select: { id: true, recordAId: true, recordBId: true, candidateAId: true, candidateBId: true },
  });

  for (const match of matches) {
    const a = owner.get(match.recordAId) ?? null;
    const b = owner.get(match.recordBId) ?? null;
    if (a === match.candidateAId && b === match.candidateBId) continue;
    await prisma.entityMatch.update({
      where: { id: match.id },
      data: { candidateAId: a, candidateBId: b },
    });
  }
}
