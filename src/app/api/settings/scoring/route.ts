import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse, guardMutation, notFound } from "@/lib/auth/guard";
import { parseBody, json } from "@/lib/api/respond";
import { scoringConfigUpdateSchema } from "@/lib/api/validation";
import { recordAudit } from "@/lib/api/audit";
import { z } from "zod";

const bodySchema = scoringConfigUpdateSchema.extend({
  configId: z.string().cuid(),
});

/**
 * Retunes a scoring configuration.
 *
 * Weights and the discovery threshold are data, so changing them is an update
 * rather than a deploy. Existing scores are deliberately left alone: they
 * record what the rules said at the time they ran, and silently rewriting
 * history would make a candidate's score unexplainable. The response says so,
 * and the UI tells the user to re-run scoring.
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await guardMutation({ roles: ["ADMIN"] });
    const input = await parseBody(request, bodySchema);

    const config = await prisma.scoringConfig.findUnique({ where: { id: input.configId } });
    if (!config) throw notFound("That scoring configuration does not exist.");

    if (input.discoveryThreshold !== undefined) {
      await prisma.scoringConfig.update({
        where: { id: config.id },
        data: { discoveryThreshold: input.discoveryThreshold },
      });
    }

    if (input.rules) {
      for (const rule of input.rules) {
        await prisma.scoringRule.updateMany({
          // Scoped to this config so a crafted id cannot edit another one.
          where: { id: rule.id, configId: config.id },
          data: { points: rule.points, active: rule.active },
        });
      }
    }

    await recordAudit({
      actorId: user.id,
      action: "config.updated",
      entityType: "scoringConfig",
      entityId: config.id,
      summary: `Updated ${config.name}`,
      metadata: {
        threshold: input.discoveryThreshold ?? null,
        rulesChanged: input.rules?.length ?? 0,
      },
    });

    return json({
      ok: true,
      note: "Existing scores were not changed. Re-run scoring for each university to apply the new weights.",
    });
  } catch (e) {
    return errorResponse(e);
  }
}
