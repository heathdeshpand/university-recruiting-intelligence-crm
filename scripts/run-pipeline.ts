/**
 * Runs the pipeline for one university from the command line.
 *
 *   npm run pipeline -- example-state-university
 *   npm run pipeline -- example-state-university ENTITY_RESOLUTION
 *
 * Useful for development and for reproducing a run without the UI. It uses
 * exactly the same job handlers the application does.
 */

import type { JobType } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { enqueueJob } from "../src/lib/jobs/queue";
import { drainQueue } from "../src/lib/jobs/runner";
import { PIPELINE_STAGES } from "../src/lib/jobs/types";

async function main() {
  const [slug, stage] = process.argv.slice(2);

  if (!slug) {
    const universities = await prisma.university.findMany({ select: { slug: true, name: true } });
    console.error("Usage: npm run pipeline -- <university-slug> [STAGE]\n");
    console.error("Universities:");
    for (const u of universities) console.error(`  ${u.slug}  (${u.name})`);
    console.error(`\nStages: FULL_PIPELINE, ${PIPELINE_STAGES.join(", ")}, EXPORT`);
    process.exitCode = 1;
    return;
  }

  const university = await prisma.university.findUnique({ where: { slug } });
  if (!university) {
    console.error(`No university with slug "${slug}".`);
    process.exitCode = 1;
    return;
  }

  const type = (stage ?? "FULL_PIPELINE") as JobType;
  const job = await enqueueJob({ type, universityId: university.id });
  console.log(`Queued ${type} for ${university.name} (job ${job.id}).\n`);

  await drainQueue();

  const finished = await prisma.job.findUnique({
    where: { id: job.id },
    include: { logs: { orderBy: { at: "asc" } } },
  });

  for (const log of finished?.logs ?? []) {
    console.log(`  [${log.level}] ${log.message}`);
  }

  console.log(`\nStatus: ${finished?.status}`);
  if (finished?.error) console.log(`Error: ${finished.error}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
