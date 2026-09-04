import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse, guardMutation, notFound } from "@/lib/auth/guard";
import { parseBody, json } from "@/lib/api/respond";
import { matchDecisionSchema } from "@/lib/api/validation";
import { recordAudit } from "@/lib/api/audit";
import { linkMatchesToCandidates } from "@/lib/pipeline/resolve";

type Params = { params: Promise<{ id: string }> };

/**
 * Records a human decision on an entity match.
 *
 * Confirming merges the two candidates immediately, rather than waiting for
 * the next resolution run, so the reviewer sees the effect of their decision.
 * Rejecting is remembered permanently: a later run may not re-merge the pair,
 * and clustering will refuse any transitive chain that would reunite them.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await guardMutation({ roles: ["ADMIN", "RECRUITER"] });
    const { id } = await params;
    const input = await parseBody(request, matchDecisionSchema);

    const match = await prisma.entityMatch.findUnique({
      where: { id },
      include: {
        recordA: { select: { id: true, normalizedName: true } },
        recordB: { select: { id: true, normalizedName: true } },
      },
    });
    if (!match) throw notFound("That match no longer exists.");

    if (input.decision === "REVIEW") {
      await prisma.entityMatch.update({
        where: { id },
        data: {
          status: "MANUAL_REVIEW",
          manualDecision: null,
          decidedById: null,
          decidedAt: null,
          decisionNote: input.note ?? null,
        },
      });

      await recordAudit({
        actorId: user.id,
        action: "match.flagged",
        entityType: "entityMatch",
        entityId: id,
        universityId: match.universityId,
        summary: `Flagged ${match.recordA.normalizedName} / ${match.recordB.normalizedName} for further review`,
      });

      return json({ ok: true, decision: "REVIEW" });
    }

    const confirmed = input.decision === "CONFIRMED";

    await prisma.entityMatch.update({
      where: { id },
      data: {
        manualDecision: confirmed ? "CONFIRMED" : "REJECTED",
        status: confirmed ? "AUTO_MATCHED" : "NOT_MATCHED",
        resolutionMethod: "MANUAL",
        decidedById: user.id,
        decidedAt: new Date(),
        decisionNote: input.note ?? null,
      },
    });

    let mergedInto: string | null = null;

    if (confirmed) {
      mergedInto = await mergeRecordsIntoOneCandidate(match.recordAId, match.recordBId, user.id);
      await linkMatchesToCandidates(prisma, match.universityId);
    }

    await recordAudit({
      actorId: user.id,
      action: confirmed ? "match.confirmed" : "match.rejected",
      entityType: "entityMatch",
      entityId: id,
      universityId: match.universityId,
      summary: confirmed
        ? `Confirmed ${match.recordA.normalizedName} and ${match.recordB.normalizedName} are the same person`
        : `Rejected the match between ${match.recordA.normalizedName} and ${match.recordB.normalizedName}`,
      metadata: { matchScore: match.matchScore, note: input.note ?? null },
    });

    return json({ ok: true, decision: input.decision, mergedInto });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * Moves both records onto a single candidate and pins them there.
 *
 * Pinning is what makes the decision stick: entity resolution treats a pinned
 * link as a human's assignment and will not move it, however the automatic
 * scores come out on the next run.
 */
async function mergeRecordsIntoOneCandidate(
  recordAId: string,
  recordBId: string,
  actorId: string,
): Promise<string | null> {
  const links = await prisma.candidateSourceRecord.findMany({
    where: { normalizedRecordId: { in: [recordAId, recordBId] } },
    include: { candidate: { select: { id: true, recordCount: true, createdAt: true } } },
  });

  if (links.length === 0) return null;

  // Keep the candidate that already holds more records, so the surviving row
  // is the one with more history attached to it.
  const target = links
    .map((l) => l.candidate)
    .sort((a, b) => b.recordCount - a.recordCount || a.createdAt.getTime() - b.createdAt.getTime())[0]!;

  const sourceIds = [...new Set(links.map((l) => l.candidateId))].filter((id) => id !== target.id);

  await prisma.$transaction(async (tx) => {
    if (sourceIds.length > 0) {
      await tx.candidateSourceRecord.updateMany({
        where: { candidateId: { in: sourceIds } },
        data: { candidateId: target.id },
      });
    }

    await tx.candidateSourceRecord.updateMany({
      where: { normalizedRecordId: { in: [recordAId, recordBId] } },
      data: { candidateId: target.id, pinned: true, addedBy: actorId },
    });

    // Candidates left with nothing are removed; their records moved, so no
    // evidence is lost.
    if (sourceIds.length > 0) {
      await tx.candidate.deleteMany({
        where: { id: { in: sourceIds }, sourceRecords: { none: {} } },
      });
    }

    const recordCount = await tx.candidateSourceRecord.count({ where: { candidateId: target.id } });
    await tx.candidate.update({
      where: { id: target.id },
      data: { recordCount, needsReview: false },
    });
  });

  return target.id;
}
