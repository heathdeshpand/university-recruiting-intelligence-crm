import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse, guardMutation, notFound } from "@/lib/auth/guard";
import { parseBody, json } from "@/lib/api/respond";
import { updateSourceSchema } from "@/lib/api/validation";
import { recordAudit } from "@/lib/api/audit";

type Params = { params: Promise<{ id: string }> };

/**
 * Manual correction of a source.
 *
 * A recruiter can reclassify a source discovery got wrong, choose a different
 * extractor, activate one that validation flagged, or disable one entirely.
 * Disabling is respected by discovery: a re-run will not quietly switch a
 * disabled source back on.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await guardMutation({ roles: ["ADMIN", "RECRUITER"] });
    const { id } = await params;
    const input = await parseBody(request, updateSourceSchema);

    const existing = await prisma.universitySource.findUnique({ where: { id } });
    if (!existing) throw notFound("That source does not exist.");

    const source = await prisma.universitySource.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.sourceType !== undefined ? { sourceType: input.sourceType } : {}),
        ...(input.parserType !== undefined ? { parserType: input.parserType } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        // Disabling a source implies deactivating it; the two would otherwise
        // drift apart and the UI would show a contradiction.
        ...(input.status === "DISABLED" ? { active: false } : {}),
      },
    });

    const action =
      input.status === "DISABLED" || input.active === false
        ? "source.disabled"
        : input.status === "ACTIVE" || input.active === true
          ? "source.activated"
          : "source.reclassified";

    await recordAudit({
      actorId: user.id,
      action,
      entityType: "universitySource",
      entityId: id,
      universityId: source.universityId,
      summary: `Updated source "${source.name}"`,
      metadata: { fields: Object.keys(input) },
    });

    return json({ source });
  } catch (e) {
    return errorResponse(e);
  }
}
