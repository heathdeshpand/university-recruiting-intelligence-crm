import { runEntityResolution } from "@/lib/pipeline/resolve";
import { recordAudit } from "@/lib/api/audit";
import type { JobHandler } from "@/lib/jobs/types";

/**
 * Resolves normalized records into canonical candidates.
 */
export const entityResolutionHandler: JobHandler = async (ctx) => {
  const result = await runEntityResolution(
    ctx.prisma,
    ctx.universityId,
    async (processed, total, step) => {
      if (total > 0 && ctx.job.total !== total) await ctx.setTotal(total);
      await ctx.setProgress(processed, step);
    },
    () => ctx.isCancelled(),
  );

  if (result.recordsConsidered === 0) {
    return {
      summary: "There are no normalized records to resolve. Run collection and normalization first.",
      stats: { recordsConsidered: 0 },
    };
  }

  await ctx.log(
    "info",
    `Compared ${result.pairsCompared.toLocaleString()} pairs: ${result.autoMatched} auto-matched, ` +
      `${result.probableMatches} probable, ${result.needsReview} flagged for review.`,
  );

  if (result.blockedByRejection > 0) {
    await ctx.log(
      "warn",
      `${result.blockedByRejection} merge(s) were refused because they would have re-joined a pair a reviewer had previously rejected.`,
    );
  }

  await recordAudit({
    action: "candidate.merged",
    entityType: "university",
    entityId: ctx.universityId,
    universityId: ctx.universityId,
    summary: `Entity resolution produced ${result.candidatesCreated + result.candidatesUpdated} candidate(s)`,
    metadata: { ...result },
  });

  return {
    summary:
      `${result.recordsConsidered.toLocaleString()} records resolved into ` +
      `${(result.candidatesCreated + result.candidatesUpdated).toLocaleString()} candidates. ` +
      `${result.probableMatches + result.needsReview} pair(s) need a human decision.`,
    stats: {
      recordsConsidered: result.recordsConsidered,
      pairsCompared: result.pairsCompared,
      autoMatched: result.autoMatched,
      probableMatches: result.probableMatches,
      needsReview: result.needsReview,
      candidatesCreated: result.candidatesCreated,
      candidatesUpdated: result.candidatesUpdated,
      candidatesRemoved: result.candidatesRemoved,
      blockedByRejection: result.blockedByRejection,
      averageConfidence: result.averageConfidence,
    },
  };
};
