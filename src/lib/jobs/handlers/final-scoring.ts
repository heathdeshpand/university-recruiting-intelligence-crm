import { runScoring } from "@/lib/pipeline/scoring/run";
import { recordAudit } from "@/lib/api/audit";
import type { JobHandler } from "@/lib/jobs/types";

/**
 * Produces the final ranking and tier from all available signals, including
 * anything enrichment added.
 */
export const finalScoringHandler: JobHandler = async (ctx) => {
  const result = await runScoring(
    ctx.prisma,
    ctx.universityId,
    "FINAL",
    async (processed, total) => {
      if (ctx.job.total !== total) await ctx.setTotal(total);
      await ctx.setProgress(processed, `Scored ${processed} of ${total}`);
    },
    () => ctx.isCancelled(),
  );

  if (result.scored === 0) {
    return {
      summary: "There are no candidates to score.",
      stats: { scored: 0 },
    };
  }

  const tiers = await ctx.prisma.candidate.groupBy({
    by: ["tier"],
    where: { universityId: ctx.universityId },
    _count: { _all: true },
  });
  const tierCounts = Object.fromEntries(tiers.map((t) => [t.tier, t._count._all]));

  await recordAudit({
    action: "score.calculated",
    entityType: "university",
    entityId: ctx.universityId,
    universityId: ctx.universityId,
    summary: `Final scoring across ${result.scored} candidate(s)`,
    metadata: { ...result, ...tierCounts },
  });

  return {
    summary: `Final scores computed for ${result.scored.toLocaleString()} candidates, averaging ${result.averageScore}. Tier A: ${tierCounts.TIER_A ?? 0}, B: ${tierCounts.TIER_B ?? 0}, C: ${tierCounts.TIER_C ?? 0}, D: ${tierCounts.TIER_D ?? 0}.`,
    stats: {
      scored: result.scored,
      averageScore: result.averageScore,
      tierA: tierCounts.TIER_A ?? 0,
      tierB: tierCounts.TIER_B ?? 0,
      tierC: tierCounts.TIER_C ?? 0,
      tierD: tierCounts.TIER_D ?? 0,
    },
  };
};
