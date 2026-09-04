import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse, guardMutation, requireUser } from "@/lib/auth/guard";
import { json } from "@/lib/api/respond";
import { getUniversityOr404 } from "@/lib/api/universities";
import { enqueueJob } from "@/lib/jobs/queue";
import { kickRunner } from "@/lib/jobs/runner";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requireUser();
    const { id } = await params;
    const university = await getUniversityOr404(id);

    const exports = await prisma.export.findMany({
      where: { universityId: university.id },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { createdBy: { select: { name: true } } },
    });

    return json({ exports });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Queues a workbook build. Returns immediately with the export row. */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await guardMutation({ roles: ["ADMIN", "RECRUITER"], rateLimitKey: "export" });
    const { id } = await params;
    const university = await getUniversityOr404(id);

    const record = await prisma.export.create({
      data: {
        universityId: university.id,
        filename: `${university.slug}.xlsx`,
        status: "QUEUED",
        createdById: user.id,
      },
    });

    const job = await enqueueJob({
      type: "EXPORT",
      universityId: university.id,
      createdById: user.id,
      metadata: { exportId: record.id },
    });

    kickRunner();

    return json({ export: record, job }, { status: 202 });
  } catch (e) {
    return errorResponse(e);
  }
}
