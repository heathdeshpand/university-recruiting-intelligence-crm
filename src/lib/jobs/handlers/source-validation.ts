import { fetchSourceContent } from "@/lib/pipeline/transport";
import { validateSource } from "@/lib/pipeline/discovery/validator";
import { recordAudit } from "@/lib/api/audit";
import type { JobHandler } from "@/lib/jobs/types";

/**
 * Checks whether each discovered page actually contains extractable records.
 *
 * This is where a page titled "Club Sports" that only describes the programme
 * gets separated from one that lists its members. Validation is a dry run of
 * extraction: whatever the extractors can actually pull out decides the
 * outcome, not the page's title.
 */
export const sourceValidationHandler: JobHandler = async (ctx) => {
  const university = await ctx.prisma.university.findUnique({
    where: { id: ctx.universityId },
    select: { id: true, slug: true, isDemo: true, name: true },
  });
  if (!university) throw new Error("The university no longer exists.");

  const requestedIds = Array.isArray(ctx.metadata.sourceIds)
    ? (ctx.metadata.sourceIds as string[])
    : undefined;

  const sources = await ctx.prisma.universitySource.findMany({
    where: {
      universityId: university.id,
      ...(requestedIds ? { id: { in: requestedIds } } : {}),
      // Never re-validate a category that was searched and not found, and
      // never touch a source a human has disabled.
      status: { in: ["DISCOVERED", "VALIDATED", "ACTIVE", "REQUIRES_REVIEW", "FAILED"] },
      accessMethod: { not: "UNAVAILABLE" },
    },
    orderBy: { confidence: "desc" },
  });

  await ctx.setTotal(sources.length);

  let usable = 0;
  let needsReview = 0;
  let unusable = 0;

  for (const source of sources) {
    await ctx.assertNotCancelled();

    const fetched = await fetchSourceContent(source, university.slug, university.isDemo);

    if (!fetched.ok) {
      const failure = fetched.error;
      const isMissing = failure.kind === "http_error" && failure.status === 404;

      await ctx.prisma.universitySource.update({
        where: { id: source.id },
        data: {
          // A 404 means the page is gone, which is "unavailable" rather than
          // "failed" -- there is nothing to retry or fix.
          status: isMissing ? "UNAVAILABLE" : "FAILED",
          errorMessage: failure.message,
          lastValidatedAt: new Date(),
          confidence: 0,
        },
      });

      await ctx.log("warn", `${source.name}: ${failure.message}`);
      unusable += 1;
      await ctx.tick(source.name);
      continue;
    }

    const outcome = validateSource(fetched.value, source.sourceType);

    await ctx.prisma.universitySource.update({
      where: { id: source.id },
      data: {
        status: outcome.usable
          ? "VALIDATED"
          : outcome.needsDifferentAdapter
            ? "REQUIRES_REVIEW"
            : "REQUIRES_REVIEW",
        parserType: outcome.parserType,
        confidence: outcome.confidence,
        structureHash: outcome.structureHash || null,
        validationSummary: {
          recordEstimate: outcome.recordEstimate,
          reasons: outcome.reasons,
          pageTitle: outcome.pageTitle,
          needsDifferentAdapter: outcome.needsDifferentAdapter,
        },
        errorMessage: outcome.usable ? null : outcome.reasons[0] ?? null,
        lastValidatedAt: new Date(),
        ...(outcome.usable ? { name: source.name || outcome.pageTitle } : {}),
      },
    });

    if (outcome.usable) {
      usable += 1;
      await ctx.log(
        "info",
        `${source.name}: usable, about ${outcome.recordEstimate} records via the ${outcome.parserType} extractor.`,
      );
    } else {
      needsReview += 1;
      await ctx.log("warn", `${source.name}: ${outcome.reasons[0] ?? "not usable"}`);
    }

    await ctx.tick(source.name);
  }

  await recordAudit({
    action: "source.validated",
    entityType: "university",
    entityId: university.id,
    universityId: university.id,
    summary: `Validated ${sources.length} source(s) for ${university.name}`,
    metadata: { usable, needsReview, unusable },
  });

  return {
    summary: `${usable} source(s) contain extractable records, ${needsReview} need review, ${unusable} could not be reached.`,
    stats: { usable, needsReview, unusable, checked: sources.length },
  };
};
