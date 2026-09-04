import type { NextRequest } from "next/server";
import { errorResponse, guardMutation, requireUser } from "@/lib/auth/guard";
import { badRequest } from "@/lib/auth/guard";
import { parseBody, json } from "@/lib/api/respond";
import { runStageSchema } from "@/lib/api/validation";
import { getUniversityOr404 } from "@/lib/api/universities";
import { enqueueJob, findActiveJob } from "@/lib/jobs/queue";
import { kickRunner } from "@/lib/jobs/runner";
import { JOB_TYPE_LABELS } from "@/lib/jobs/types";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

/** Recent jobs for a university. */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requireUser();
    const { id } = await params;
    const university = await getUniversityOr404(id);

    const jobs = await prisma.job.findMany({
      where: { universityId: university.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return json({ jobs });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * Starts a pipeline stage.
 *
 * The request enqueues work and returns immediately with the job id; the
 * runner drains the queue in the background. No HTTP request ever waits on a
 * crawl, a resolution pass or a workbook build.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await guardMutation({
      roles: ["ADMIN", "RECRUITER"],
      rateLimitKey: "job",
    });
    const { id } = await params;
    const university = await getUniversityOr404(id);
    const input = await parseBody(request, runStageSchema);

    // One run of a stage at a time per university, so an impatient double
    // click cannot start two collections against the same sources.
    const active = await findActiveJob(university.id);
    if (active) {
      throw badRequest(
        `${JOB_TYPE_LABELS[active.type]} is already ${active.status.toLowerCase()} for this university. Wait for it to finish, or cancel it first.`,
      );
    }

    const job = await enqueueJob({
      type: input.type,
      universityId: university.id,
      createdById: user.id,
      metadata: input.sourceIds ? { sourceIds: input.sourceIds } : {},
    });

    kickRunner();

    return json({ job }, { status: 202 });
  } catch (e) {
    return errorResponse(e);
  }
}
