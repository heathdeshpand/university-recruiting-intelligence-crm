import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse, guardMutation, notFound, requireUser } from "@/lib/auth/guard";
import { json } from "@/lib/api/respond";
import { cancelJob } from "@/lib/jobs/queue";

type Params = { params: Promise<{ id: string }> };

/** Job status and log, polled by the progress UI. */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requireUser();
    const { id } = await params;

    const job = await prisma.job.findUnique({
      where: { id },
      include: { logs: { orderBy: { at: "desc" }, take: 100 } },
    });
    if (!job) throw notFound("That job does not exist.");

    return json({ job: { ...job, logs: job.logs.reverse() } });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    await guardMutation({ roles: ["ADMIN", "RECRUITER"] });
    const { id } = await params;

    const cancelled = await cancelJob(id);
    if (!cancelled) {
      throw notFound("That job has already finished, so there is nothing to cancel.");
    }

    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
