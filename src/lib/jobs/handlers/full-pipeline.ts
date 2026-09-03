import type { JobType } from "@prisma/client";
import { getJobHandler } from "@/lib/jobs/registry";
import { JOB_TYPE_LABELS, PIPELINE_STAGES, type JobHandler, type JobResult } from "@/lib/jobs/types";

/**
 * Runs every pipeline stage in order.
 *
 * Stages run inline rather than as separate queued jobs, so the whole run is
 * one cancellable unit with one progress bar and a single ordered log.
 *
 * A stage that fails does not abort the run. Discovery finding nothing, or a
 * university having no directory to enrich against, are ordinary outcomes;
 * the remaining stages still have useful work to do. Every failure is logged
 * and reported in the summary, so a partially successful run is never
 * mistaken for a clean one.
 */
export const fullPipelineHandler: JobHandler = async (ctx) => {
  const stages: JobType[] = PIPELINE_STAGES;
  await ctx.setTotal(stages.length);

  const succeeded: string[] = [];
  const failed: Array<{ stage: string; error: string }> = [];

  for (const [index, stage] of stages.entries()) {
    await ctx.assertNotCancelled();

    const label = JOB_TYPE_LABELS[stage];
    await ctx.setProgress(index, label);
    await ctx.log("info", `— ${label} —`);

    try {
      const handler = getJobHandler(stage);
      // Each stage gets the parent's context, so its progress messages and
      // logs land on this job rather than disappearing.
      const result: JobResult = await handler(ctx);
      await ctx.log("info", result.summary);
      succeeded.push(label);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (e instanceof Error && e.name === "JobCancelledError") throw e;
      await ctx.log("error", `${label} failed: ${message}`);
      failed.push({ stage: label, error: message });
    }
  }

  await ctx.setProgress(stages.length, "Pipeline complete");

  const summary =
    failed.length === 0
      ? `All ${succeeded.length} stages completed.`
      : `${succeeded.length} of ${stages.length} stages completed. Failed: ${failed.map((f) => f.stage).join(", ")}.`;

  return {
    summary,
    stats: {
      stagesRun: stages.length,
      stagesSucceeded: succeeded.length,
      stagesFailed: failed.length,
      failures: failed.map((f) => `${f.stage}: ${f.error}`).join(" | ") || null,
    },
  };
};
