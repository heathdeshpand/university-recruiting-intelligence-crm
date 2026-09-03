import type { Job, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/util/logger";
import { errorMessage } from "@/lib/util/result";
import { claimNextJob, reclaimStaleJobs } from "@/lib/jobs/queue";
import { getJobHandler } from "@/lib/jobs/registry";
import { JobCancelledError, type JobContext } from "@/lib/jobs/types";

const log = createLogger("jobs:runner");

/**
 * In-process job runner.
 *
 * API routes enqueue work and return immediately; this drains the queue in the
 * background so no HTTP request ever waits on a crawl or a resolution pass.
 * A module-level flag keeps exactly one drain loop per process.
 *
 * Scope and honesty about it: this is a single-node runner. It is the right
 * shape for local use and a small deployment, and `npm run worker` runs the
 * same loop in a dedicated process. Multi-replica deployments would want a
 * real queue; the claim-by-conditional-update in queue.ts already makes that
 * a swap rather than a rewrite.
 */

let draining = false;
let reclaimedOnce = false;

/** Throttles progress writes so a fast loop cannot flood the database. */
const PROGRESS_WRITE_INTERVAL_MS = 400;

function buildContext(job: Job): JobContext {
  let lastWrite = 0;
  let localProgress = 0;
  let cancelled = false;
  let lastCancelCheck = 0;

  const jobLogger = log.child(job.type);

  const writeProgress = async (progress: number, step?: string, force = false) => {
    localProgress = progress;
    const now = Date.now();
    if (!force && now - lastWrite < PROGRESS_WRITE_INTERVAL_MS) return;
    lastWrite = now;
    await prisma.job
      .update({
        where: { id: job.id },
        data: { progress, ...(step ? { step } : {}) },
      })
      .catch(() => undefined);
  };

  return {
    job,
    universityId: job.universityId ?? "",
    prisma,
    logger: jobLogger,
    metadata: (job.metadata ?? {}) as Record<string, unknown>,

    async setTotal(total) {
      await prisma.job.update({ where: { id: job.id }, data: { total } });
    },

    async setProgress(progress, step) {
      await writeProgress(progress, step);
    },

    async tick(step) {
      await writeProgress(localProgress + 1, step);
    },

    async log(level, message, meta) {
      jobLogger[level](message, meta);
      await prisma.jobLog
        .create({
          data: {
            jobId: job.id,
            level,
            message: message.slice(0, 2000),
            meta: (meta ?? undefined) as Prisma.InputJsonValue | undefined,
          },
        })
        .catch(() => undefined);
    },

    async isCancelled() {
      const now = Date.now();
      // Polling the database on every unit of work would dominate the runtime
      // of a fast stage, so the check is time-boxed.
      if (cancelled) return true;
      if (now - lastCancelCheck < 1000) return false;
      lastCancelCheck = now;
      const current = await prisma.job.findUnique({
        where: { id: job.id },
        select: { status: true },
      });
      cancelled = current?.status === "CANCELLED";
      return cancelled;
    },

    async assertNotCancelled() {
      if (await this.isCancelled()) throw new JobCancelledError();
    },
  };
}

async function runJob(job: Job): Promise<void> {
  const ctx = buildContext(job);
  const started = Date.now();

  try {
    if (!job.universityId) {
      throw new Error("This job has no university attached, so there is nothing to process.");
    }

    const handler = getJobHandler(job.type);
    await ctx.log("info", `Started ${job.type.toLowerCase().replace(/_/g, " ")}.`);

    const result = await handler(ctx);

    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        progress: job.total > 0 ? job.total : 1,
        step: result.summary,
        metadata: {
          ...(job.metadata as Record<string, unknown> | null ?? {}),
          ...(result.stats ?? {}),
          durationMs: Date.now() - started,
        } as Prisma.InputJsonValue,
      },
    });

    await ctx.log("info", result.summary);
    log.info("Job completed", { jobId: job.id, type: job.type, ms: Date.now() - started });
  } catch (e) {
    if (e instanceof JobCancelledError) {
      await prisma.job
        .update({
          where: { id: job.id },
          data: { status: "CANCELLED", completedAt: new Date() },
        })
        .catch(() => undefined);
      await ctx.log("warn", "Cancelled before finishing.");
      return;
    }

    const message = errorMessage(e);
    await prisma.job
      .update({
        where: { id: job.id },
        data: { status: "FAILED", completedAt: new Date(), error: message.slice(0, 2000) },
      })
      .catch(() => undefined);
    await ctx.log("error", message);
    log.error("Job failed", { jobId: job.id, type: job.type, error: message });
  }
}

/**
 * Drains the queue until it is empty. Safe to call repeatedly; concurrent
 * calls return immediately while a drain is already in flight.
 */
export async function drainQueue(): Promise<void> {
  if (draining) return;
  draining = true;

  try {
    if (!reclaimedOnce) {
      reclaimedOnce = true;
      await reclaimStaleJobs().catch(() => undefined);
    }

    for (;;) {
      const job = await claimNextJob();
      if (!job) break;
      await runJob(job);
    }
  } catch (e) {
    log.error("Queue drain aborted", { error: errorMessage(e) });
  } finally {
    draining = false;
  }
}

/**
 * Kicks the runner without awaiting it, so an API route can enqueue work and
 * respond immediately. Errors are logged rather than surfaced to the caller,
 * because by design nobody is waiting on this promise.
 */
export function kickRunner(): void {
  void drainQueue().catch((e) => log.error("Runner error", { error: errorMessage(e) }));
}

export function isDraining(): boolean {
  return draining;
}
