import type { Job, JobType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/util/logger";

const log = createLogger("jobs:queue");

/**
 * Job queue backed by the database.
 *
 * Claiming is a conditional UPDATE guarded on status, which makes it safe for
 * the in-process runner and a separate `npm run worker` process to compete for
 * the same queue without ever running a job twice.
 */

export interface EnqueueOptions {
  type: JobType;
  universityId: string;
  createdById?: string | null;
  metadata?: Record<string, unknown>;
  parentJobId?: string | null;
}

export async function enqueueJob(options: EnqueueOptions): Promise<Job> {
  const job = await prisma.job.create({
    data: {
      type: options.type,
      universityId: options.universityId,
      createdById: options.createdById ?? null,
      metadata: (options.metadata ?? {}) as Prisma.InputJsonValue,
      parentJobId: options.parentJobId ?? null,
      status: "QUEUED",
    },
  });
  log.info("Job enqueued", { jobId: job.id, type: job.type, universityId: job.universityId });
  return job;
}

/**
 * Refuses to enqueue a second job of the same type for the same university
 * while one is already pending, which is what stops an impatient double-click
 * from starting two collections at once.
 */
export async function findActiveJob(
  universityId: string,
  type?: JobType,
): Promise<Job | null> {
  return prisma.job.findFirst({
    where: {
      universityId,
      status: { in: ["QUEUED", "RUNNING"] },
      ...(type ? { type } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
}

/** Atomically claims the oldest queued job, or returns null. */
export async function claimNextJob(): Promise<Job | null> {
  // Bounded retry: another worker may win the race for a given row.
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = await prisma.job.findFirst({
      where: { status: "QUEUED" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!candidate) return null;

    const claimed = await prisma.job.updateMany({
      where: { id: candidate.id, status: "QUEUED" },
      data: { status: "RUNNING", startedAt: new Date(), progress: 0 },
    });

    if (claimed.count === 1) {
      return prisma.job.findUnique({ where: { id: candidate.id } });
    }
  }
  return null;
}

export async function cancelJob(jobId: string): Promise<boolean> {
  const { count } = await prisma.job.updateMany({
    where: { id: jobId, status: { in: ["QUEUED", "RUNNING"] } },
    data: { status: "CANCELLED", completedAt: new Date() },
  });
  return count > 0;
}

/**
 * Marks jobs that were RUNNING when the process died as failed.
 *
 * Without this, a crash or a dev-server restart leaves a job stuck on
 * "Running" forever with no way for a user to tell it is dead.
 */
export async function reclaimStaleJobs(olderThanMs = 15 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const { count } = await prisma.job.updateMany({
    where: { status: "RUNNING", startedAt: { lt: cutoff } },
    data: {
      status: "FAILED",
      completedAt: new Date(),
      error:
        "The job stopped without completing, usually because the server restarted while it was running. It is safe to run this stage again.",
    },
  });
  if (count > 0) log.warn("Reclaimed stale running jobs", { count });
  return count;
}
