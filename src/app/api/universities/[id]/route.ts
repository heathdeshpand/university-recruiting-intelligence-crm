import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse, guardMutation, requireUser } from "@/lib/auth/guard";
import { parseBody, json } from "@/lib/api/respond";
import { updateUniversitySchema } from "@/lib/api/validation";
import { getUniversityOr404 } from "@/lib/api/universities";
import { recordAudit } from "@/lib/api/audit";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requireUser();
    const { id } = await params;
    return json({ university: await getUniversityOr404(id) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await guardMutation({ roles: ["ADMIN", "RECRUITER"] });
    const { id } = await params;
    const university = await getUniversityOr404(id);
    const input = await parseBody(request, updateUniversitySchema);

    const updated = await prisma.university.update({
      where: { id: university.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.shortName !== undefined ? { shortName: input.shortName || null } : {}),
        ...(input.athleticName !== undefined ? { athleticName: input.athleticName || null } : {}),
        ...(input.aliases !== undefined ? { aliases: input.aliases } : {}),
        ...(input.city !== undefined ? { city: input.city || null } : {}),
        ...(input.state !== undefined ? { state: input.state || null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      },
    });

    if (input.discoveryThreshold !== undefined) {
      await prisma.universitySettings.upsert({
        where: { universityId: university.id },
        update: { discoveryThreshold: input.discoveryThreshold },
        create: { universityId: university.id, discoveryThreshold: input.discoveryThreshold },
      });
    }

    await recordAudit({
      actorId: user.id,
      action: "university.updated",
      entityType: "university",
      entityId: university.id,
      universityId: university.id,
      summary: `Updated ${updated.name}`,
      metadata: { fields: Object.keys(input) },
    });

    return json({ university: updated });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await guardMutation({ roles: ["ADMIN"] });
    const { id } = await params;
    const university = await getUniversityOr404(id);

    // Cascades remove sources, records, candidates, evidence, scores and jobs.
    await prisma.university.delete({ where: { id: university.id } });

    await recordAudit({
      actorId: user.id,
      action: "university.deleted",
      entityType: "university",
      entityId: university.id,
      summary: `Deleted ${university.name} and all data beneath it`,
    });

    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
