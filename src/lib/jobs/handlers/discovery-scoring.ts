import { runScoring } from "@/lib/pipeline/scoring/run";
import { recordAudit } from "@/lib/api/audit";
import type { JobHandler } from "@/lib/jobs/types";

/**
 * Scores every candidate on pre-enrichment signals and decides who qualifies
 * for enrichment.
 *
 * This is the gate the whole product is built around: only candidates at or
 * above the threshold are ever looked up in a directory. Everyone else stays
 * discovered, with their evidence intact, and is simply not enriched.
 */
export const discoveryScoringHandler: JobHandler = async (ctx) => {
  const result = await runScoring(
    ctx.prisma,
    ctx.universityId,
    "DISCOVERY",
    async (processed, total) => {
      if (ctx.job.total !== total) await ctx.setTotal(total);
      await ctx.setProgress(processed, `Scored ${processed} of ${total}`);
    },
    () => ctx.isCancelled(),
  );

  if (result.scored === 0) {
    return {
      summary: "There are no candidates to score. Run entity resolution and signal extraction first.",
      stats: { scored: 0 },
    };
  }

  await recordAudit({
    action: "score.calculated",
    entityType: "university",
    entityId: ctx.universityId,
    universityId: ctx.universityId,
    summary: `Discovery scoring: ${result.qualified} of ${result.scored} candidates qualified`,
    metadata: { ...result },
  });

  const pct = Math.round((result.qualified / result.scored) * 100);

  return {
    summary: `Scored ${result.scored.toLocaleString()} candidates. ${result.qualified.toLocaleString()} (${pct}%) reached the threshold of ${result.threshold} and entered the enrichment queue.`,
    stats: {
      scored: result.scored,
      qualified: result.qualified,
      threshold: result.threshold,
      averageScore: result.averageScore,
      config: result.configName,
    },
  };
};
