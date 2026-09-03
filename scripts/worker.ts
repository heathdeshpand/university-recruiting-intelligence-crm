/**
 * Standalone job worker.
 *
 *   npm run worker
 *
 * The application already drains the job queue in-process, so this is not
 * required for local use. It exists for deployments that want pipeline work
 * off the web process: because jobs are claimed with a conditional UPDATE,
 * this worker and the web process can share a queue safely.
 */

import { drainQueue } from "../src/lib/jobs/runner";
import { reclaimStaleJobs } from "../src/lib/jobs/queue";
import { prisma } from "../src/lib/db";

const POLL_INTERVAL_MS = 2000;

let shuttingDown = false;

async function main() {
  console.log("Job worker started. Polling for queued jobs; press Ctrl+C to stop.");

  const reclaimed = await reclaimStaleJobs();
  if (reclaimed > 0) {
    console.log(`Marked ${reclaimed} stale running job(s) as failed.`);
  }

  while (!shuttingDown) {
    await drainQueue();
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (shuttingDown) process.exit(1);
    shuttingDown = true;
    console.log("\nFinishing the current job, then stopping…");
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
