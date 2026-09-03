import type { Prisma } from "@prisma/client";
import { enrichCandidate, loadDirectories } from "@/lib/pipeline/enrich";
import { fingerprint } from "@/lib/util/hash";
import { recordAudit } from "@/lib/api/audit";
import type { JobHandler } from "@/lib/jobs/types";

const BATCH = 100;

/**
 * Enriches only the candidates that passed the discovery threshold.
 *
 * The queue is built by discovery scoring, which sets enrichmentStatus to
 * QUEUED for qualifying candidates and NOT_ELIGIBLE for everyone else. This
 * handler never looks at a candidate outside that queue, which is what makes
 * the funnel real rather than decorative.
 */
export const enrichmentHandler: JobHandler = async (ctx) => {
  const university = await ctx.prisma.university.findUnique({
    where: { id: ctx.universityId },
    select: { id: true, slug: true, isDemo: true, name: true },
  });
  if (!university) throw new Error("The university no longer exists.");

  const queued = await ctx.prisma.candidate.count({
    where: { universityId: ctx.universityId, enrichmentStatus: "QUEUED" },
  });

  if (queued === 0) {
    const eligible = await ctx.prisma.candidate.count({
      where: { universityId: ctx.universityId, discoveryScore: { not: null } },
    });
    return {
      summary:
        eligible === 0
          ? "No candidates have a discovery score yet. Run discovery scoring first."
          : "No candidates are currently queued for enrichment. Either none reached the threshold, or they have all been enriched already.",
      stats: { queued: 0 },
    };
  }

  const { directories, problems } = await loadDirectories(
    ctx.prisma,
    university.id,
    university.slug,
    university.isDemo,
  );

  for (const problem of problems) await ctx.log("warn", problem);

  if (directories.length === 0) {
    // A university with no public directory is a completely normal case, and
    // the honest outcome is to say so rather than to invent contact details.
    await ctx.prisma.candidate.updateMany({
      where: { universityId: ctx.universityId, enrichmentStatus: "QUEUED" },
      data: { enrichmentStatus: "FAILED" },
    });

    return {
      summary: `${university.name} has no usable enrichment source, so no contact information could be looked up. ${queued} qualified candidate(s) remain fully scored on their public involvement.`,
      stats: { queued, enriched: 0, noMatch: 0, ambiguous: 0, directories: 0 },
    };
  }

  await ctx.setTotal(queued);
  await ctx.log(
    "info",
    `Enriching ${queued} qualified candidate(s) against ${directories.length} directory source(s) holding ${directories.reduce((n, d) => n + d.entries.length, 0).toLocaleString()} entries.`,
  );

  let processed = 0;
  let enriched = 0;
  let noMatch = 0;
  let ambiguous = 0;

  for (;;) {
    await ctx.assertNotCancelled();

    const candidates = await ctx.prisma.candidate.findMany({
      where: { universityId: ctx.universityId, enrichmentStatus: "QUEUED" },
      take: BATCH,
      orderBy: { discoveryScore: "desc" },
      select: {
        id: true,
        canonicalName: true,
        firstName: true,
        middleInitial: true,
        lastName: true,
        major: true,
        graduationYear: true,
        email: true,
        discoveryScore: true,
        manuallyEdited: true,
      },
    });

    if (candidates.length === 0) break;

    for (const candidate of candidates) {
      const job = await ctx.prisma.enrichmentJob.create({
        data: {
          universityId: ctx.universityId,
          candidateId: candidate.id,
          sourceId: directories[0]!.sourceId,
          status: "PROCESSING",
          qualifiedScore: candidate.discoveryScore,
          reason: `Discovery score of ${candidate.discoveryScore} met the threshold.`,
          attempts: 1,
          startedAt: new Date(),
        },
        select: { id: true },
      });

      // Try each directory in turn and keep the first confident match.
      let best = null as ReturnType<typeof enrichCandidate> | null;
      for (const directory of directories) {
        const attempt = enrichCandidate(candidate, directory);
        if (!best || attempt.outcome === "MATCHED") best = attempt;
        if (attempt.outcome === "MATCHED") break;
      }

      const attempt = best!;

      await ctx.prisma.enrichmentResult.create({
        data: {
          enrichmentJobId: job.id,
          outcome: attempt.outcome,
          matchConfidence: attempt.matchConfidence,
          matchedName: attempt.matchedName,
          fields: attempt.fields as unknown as Prisma.InputJsonValue,
          matchingFactors: attempt.matchingFactors as unknown as Prisma.InputJsonValue,
          conflictingFactors: attempt.conflictingFactors as unknown as Prisma.InputJsonValue,
          sourceUrl: attempt.sourceUrl,
        },
      });

      if (attempt.outcome === "MATCHED") {
        enriched += 1;

        await ctx.prisma.candidate.update({
          where: { id: candidate.id },
          data: {
            // A human's edits are never overwritten, and an existing value is
            // only filled in when it was missing.
            ...(candidate.manuallyEdited
              ? {}
              : {
                  email: candidate.email ?? attempt.fields.email ?? null,
                  major: candidate.major ?? attempt.fields.major ?? null,
                  graduationYear: candidate.graduationYear ?? attempt.fields.graduationYear ?? null,
                }),
            enrichmentStatus: "ENRICHED",
            status: "ENRICHED",
          },
        });

        // Contact information gets an evidence row like everything else, so
        // its provenance is visible on the candidate page.
        if (attempt.fields.email) {
          const print = fingerprint({
            type: "CONTACT_INFORMATION",
            value: attempt.fields.email,
            source: directories[0]!.sourceId,
          });
          await ctx.prisma.evidence.upsert({
            where: { candidateId_fingerprint: { candidateId: candidate.id, fingerprint: print } },
            update: {},
            create: {
              candidateId: candidate.id,
              sourceId: directories[0]!.sourceId,
              evidenceType: "CONTACT_INFORMATION",
              assertionKind: "FACT",
              statement: `Directory lists an institutional email address for ${attempt.matchedName}`,
              originalValue: attempt.fields.email,
              sourceUrl: attempt.sourceUrl,
              confidence: attempt.matchConfidence && attempt.matchConfidence >= 0.92 ? "HIGH" : "MEDIUM",
              fingerprint: print,
            },
          });
        }

        await ctx.prisma.enrichmentJob.update({
          where: { id: job.id },
          data: { status: "ENRICHED", completedAt: new Date() },
        });
      } else if (attempt.outcome === "AMBIGUOUS") {
        ambiguous += 1;
        await ctx.prisma.candidate.update({
          where: { id: candidate.id },
          data: { enrichmentStatus: "MANUAL_REVIEW", needsReview: true },
        });
        await ctx.prisma.enrichmentJob.update({
          where: { id: job.id },
          data: { status: "MANUAL_REVIEW", completedAt: new Date(), error: attempt.message },
        });
      } else {
        noMatch += 1;
        await ctx.prisma.candidate.update({
          where: { id: candidate.id },
          data: { enrichmentStatus: "FAILED" },
        });
        await ctx.prisma.enrichmentJob.update({
          where: { id: job.id },
          data: { status: "FAILED", completedAt: new Date(), error: attempt.message },
        });
      }

      processed += 1;
    }

    await ctx.setProgress(processed, `Enriched ${enriched} of ${processed} attempted`);
  }

  await recordAudit({
    action: "enrichment.completed",
    entityType: "university",
    entityId: ctx.universityId,
    universityId: ctx.universityId,
    summary: `Enrichment: ${enriched} matched, ${ambiguous} ambiguous, ${noMatch} not found`,
    metadata: { queued, enriched, ambiguous, noMatch },
  });

  return {
    summary: `Attempted ${processed} qualified candidate(s): ${enriched} matched a directory entry, ${ambiguous} were too ambiguous to accept, and ${noMatch} were not found.`,
    stats: { queued, enriched, ambiguous, noMatch, directories: directories.length },
  };
};
