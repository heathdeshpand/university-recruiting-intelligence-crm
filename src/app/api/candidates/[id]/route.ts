import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse, guardMutation, notFound, requireUser } from "@/lib/auth/guard";
import { parseBody, json } from "@/lib/api/respond";
import { updateCandidateSchema } from "@/lib/api/validation";
import { recordAudit } from "@/lib/api/audit";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requireUser();
    const { id } = await params;

    const candidate = await prisma.candidate.findUnique({
      where: { id },
      include: {
        university: { select: { name: true, slug: true } },
        signals: { include: { definition: true } },
        patterns: true,
        scores: { include: { factors: { orderBy: { points: "desc" } } } },
      },
    });
    if (!candidate) throw notFound("That candidate does not exist.");

    return json({ candidate });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * Applies a manual correction.
 *
 * Any edit sets `manuallyEdited`, which the pipeline honours: later runs will
 * not overwrite identity fields a person has corrected. Scores are left stale
 * on purpose and the response says so, rather than silently recomputing and
 * hiding the fact that the numbers moved.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await guardMutation({ roles: ["ADMIN", "RECRUITER"] });
    const { id } = await params;
    const input = await parseBody(request, updateCandidateSchema);

    const existing = await prisma.candidate.findUnique({ where: { id } });
    if (!existing) throw notFound("That candidate does not exist.");

    const identityChanged =
      input.canonicalName !== undefined ||
      input.firstName !== undefined ||
      input.lastName !== undefined ||
      input.major !== undefined ||
      input.graduationYear !== undefined;

    const candidate = await prisma.candidate.update({
      where: { id },
      data: {
        ...(input.canonicalName !== undefined ? { canonicalName: input.canonicalName } : {}),
        ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
        ...(input.major !== undefined ? { major: input.major } : {}),
        ...(input.graduationYear !== undefined ? { graduationYear: input.graduationYear } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(identityChanged ? { manuallyEdited: true } : {}),
      },
    });

    await recordAudit({
      actorId: user.id,
      action: input.status !== undefined && !identityChanged ? "candidate.status_changed" : "candidate.updated",
      entityType: "candidate",
      entityId: id,
      universityId: candidate.universityId,
      summary:
        input.status !== undefined && !identityChanged
          ? `Set ${candidate.canonicalName} to ${input.status}`
          : `Edited ${candidate.canonicalName}`,
      metadata: { fields: Object.keys(input) },
    });

    return json({
      candidate,
      staleScores: identityChanged,
      note: identityChanged
        ? "Signals and scores were not recomputed. Re-run signal extraction and scoring to bring them in line with this edit."
        : undefined,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
