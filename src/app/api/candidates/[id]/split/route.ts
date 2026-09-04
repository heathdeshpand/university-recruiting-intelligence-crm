import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, errorResponse, guardMutation, notFound } from "@/lib/auth/guard";
import { parseBody, json } from "@/lib/api/respond";
import { splitCandidateSchema } from "@/lib/api/validation";
import { recordAudit } from "@/lib/api/audit";
import { linkMatchesToCandidates } from "@/lib/pipeline/resolve";

type Params = { params: Promise<{ id: string }> };

/**
 * Detaches records from a candidate into a new one.
 *
 * The correction for an over-merge. Both the records that move and the ones
 * that stay are pinned, so entity resolution treats the split as a human's
 * decision and will not undo it on the next run.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await guardMutation({ roles: ["ADMIN", "RECRUITER"] });
    const { id } = await params;
    const input = await parseBody(request, splitCandidateSchema);

    const candidate = await prisma.candidate.findUnique({
      where: { id },
      include: {
        sourceRecords: {
          include: {
            normalizedRecord: {
              select: {
                id: true,
                normalizedName: true,
                firstName: true,
                middleInitial: true,
                lastName: true,
                majorCanonical: true,
                graduationYear: true,
              },
            },
          },
        },
      },
    });
    if (!candidate) throw notFound("That candidate does not exist.");

    const moving = candidate.sourceRecords.filter((l) =>
      input.normalizedRecordIds.includes(l.normalizedRecordId),
    );
    if (moving.length === 0) {
      throw badRequest("None of those records belong to this candidate.");
    }
    if (moving.length === candidate.sourceRecords.length) {
      throw badRequest(
        "Splitting off every record would leave the original candidate empty. Keep at least one record on it.",
      );
    }

    const first = moving[0]!.normalizedRecord;

    const created = await prisma.$transaction(async (tx) => {
      const next = await tx.candidate.create({
        data: {
          universityId: candidate.universityId,
          canonicalName: first.normalizedName,
          firstName: first.firstName,
          middleInitial: first.middleInitial,
          lastName: first.lastName,
          major: first.majorCanonical,
          graduationYear: first.graduationYear,
          status: "DISCOVERED",
          recordCount: moving.length,
          needsReview: true,
        },
      });

      await tx.candidateSourceRecord.updateMany({
        where: { normalizedRecordId: { in: moving.map((m) => m.normalizedRecordId) } },
        data: { candidateId: next.id, pinned: true, addedBy: user.id },
      });

      // The records that stayed are pinned too, so resolution cannot simply
      // pull the split back together on the next run.
      await tx.candidateSourceRecord.updateMany({
        where: { candidateId: candidate.id },
        data: { pinned: true, addedBy: user.id },
      });

      await tx.candidate.update({
        where: { id: candidate.id },
        data: { recordCount: candidate.sourceRecords.length - moving.length },
      });

      return next;
    });

    await linkMatchesToCandidates(prisma, candidate.universityId);

    await recordAudit({
      actorId: user.id,
      action: "candidate.split",
      entityType: "candidate",
      entityId: candidate.id,
      universityId: candidate.universityId,
      summary: `Split ${moving.length} record(s) off ${candidate.canonicalName} into a new candidate`,
      metadata: { newCandidateId: created.id, movedRecords: moving.length },
    });

    return json({
      candidate: created,
      note: "Signals and scores were not recomputed for either candidate. Re-run signal extraction and scoring.",
    });
  } catch (e) {
    return errorResponse(e);
  }
}
