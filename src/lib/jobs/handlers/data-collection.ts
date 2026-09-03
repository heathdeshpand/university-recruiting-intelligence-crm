import type { Prisma } from "@prisma/client";
import { fetchSourceContent } from "@/lib/pipeline/transport";
import { extract } from "@/lib/pipeline/extract/registry";
import { fingerprint } from "@/lib/util/hash";
import { ENRICHMENT_ONLY_SOURCE_TYPES } from "@/lib/config/discovery";
import { recordAudit } from "@/lib/api/audit";
import type { JobHandler } from "@/lib/jobs/types";

/**
 * Fetches every usable source and stores exactly what it returned.
 *
 * Two properties matter here and both are enforced structurally:
 *
 *   Isolation  -- each source is wrapped in its own try/catch, so one broken
 *                 page can never end the university's run. A failure is
 *                 written to that source's row and the loop continues.
 *
 *   Idempotency -- every record gets a fingerprint over its meaningful
 *                 content, and (sourceId, fingerprint) is a unique constraint.
 *                 Collecting the same source twice therefore produces no
 *                 duplicates, so re-running is always safe.
 */
export const dataCollectionHandler: JobHandler = async (ctx) => {
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
      active: true,
      ...(requestedIds ? { id: { in: requestedIds } } : {}),
      status: { in: ["VALIDATED", "ACTIVE"] },
      // Student directories cover the whole student body and are read only
      // during enrichment, for candidates that already qualified. Collecting
      // one here would invert the product's core funnel.
      sourceType: { notIn: [...ENRICHMENT_ONLY_SOURCE_TYPES] },
    },
    orderBy: { sourceType: "asc" },
  });

  if (sources.length === 0) {
    return {
      summary:
        "No validated sources to collect. Run source discovery and validation first, or activate a source manually.",
      stats: { sources: 0, recordsCreated: 0 },
    };
  }

  await ctx.setTotal(sources.length);
  await recordAudit({
    action: "collection.started",
    entityType: "university",
    entityId: university.id,
    universityId: university.id,
    summary: `Started collection across ${sources.length} source(s) for ${university.name}`,
  });

  let recordsCreated = 0;
  let recordsUnchanged = 0;
  let sourcesOk = 0;
  let sourcesFailed = 0;

  for (const source of sources) {
    await ctx.assertNotCancelled();

    try {
      const fetched = await fetchSourceContent(source, university.slug, university.isDemo);

      if (!fetched.ok) {
        sourcesFailed += 1;
        await ctx.prisma.universitySource.update({
          where: { id: source.id },
          data: {
            status: fetched.error.kind === "http_error" && fetched.error.status === 404 ? "UNAVAILABLE" : "FAILED",
            errorMessage: fetched.error.message,
            lastCollectedAt: new Date(),
          },
        });
        await ctx.prisma.sourceCheck.create({
          data: { sourceId: source.id, ok: false, message: fetched.error.message },
        });
        await ctx.log("error", `${source.name}: ${fetched.error.message}`);
        await ctx.tick(source.name);
        continue;
      }

      const page = fetched.value;
      const outcome = extract(
        {
          url: page.finalUrl,
          body: page.body,
          contentType: page.contentType,
          sourceType: source.sourceType,
        },
        source.parserType,
      );

      // Structural drift: the page still loads, but its shape changed since
      // the last collection. Worth a warning, not a failure.
      const previousHash = source.structureHash;
      const structureChanged =
        previousHash !== null && outcome.structureHash !== "" && previousHash !== outcome.structureHash;

      let created = 0;
      let unchanged = 0;

      for (const record of outcome.records) {
        const print = fingerprint({
          name: record.name,
          organization: record.organization ?? null,
          role: record.role ?? null,
          year: record.year ?? null,
          sport: record.sport ?? null,
          major: record.major ?? null,
          email: record.email ?? null,
          note: record.note ?? null,
        });

        try {
          await ctx.prisma.rawRecord.create({
            data: {
              universityId: university.id,
              sourceId: source.id,
              // `note` carries free text the source published verbatim, which is
              // the only thing work-experience and job-search signals may be
              // derived from. It is folded into the payload so normalization
              // carries it forward.
              rawPayload: {
                ...record.raw,
                ...(record.note ? { note: record.note } : {}),
              } as Prisma.InputJsonValue,
              rawName: record.name,
              rawOrganization: record.organization ?? null,
              rawRole: record.role ?? null,
              rawMajor: record.major ?? null,
              rawYear: record.year ?? null,
              rawSport: record.sport ?? null,
              rawUrl: record.profileUrl ?? page.finalUrl,
              fingerprint: print,
            },
          });
          created += 1;
        } catch (e) {
          // The unique constraint on (sourceId, fingerprint) rejecting a row
          // is the idempotency guarantee working, not an error.
          if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
            unchanged += 1;
          } else {
            throw e;
          }
        }
      }

      recordsCreated += created;
      recordsUnchanged += unchanged;

      const totalForSource = await ctx.prisma.rawRecord.count({ where: { sourceId: source.id } });
      const delta = totalForSource - source.recordCount;

      const warnings = [...outcome.warnings];
      if (structureChanged) {
        warnings.push(
          "The page's structure changed since the last collection. Extraction still worked, but the results are worth spot-checking.",
        );
      }
      // A source that used to return plenty and now returns almost nothing is
      // the classic silent-breakage case.
      if (source.recordCount > 20 && totalForSource < source.recordCount * 0.5) {
        warnings.push(
          `Record count dropped from ${source.recordCount} to ${totalForSource}. The source may have changed or been partially removed.`,
        );
      }

      const usable = outcome.records.length > 0;
      sourcesOk += usable ? 1 : 0;
      if (!usable) sourcesFailed += 1;

      await ctx.prisma.universitySource.update({
        where: { id: source.id },
        data: {
          status: usable ? "ACTIVE" : "REQUIRES_REVIEW",
          recordCount: totalForSource,
          lastCollectedAt: new Date(),
          structureHash: outcome.structureHash || source.structureHash,
          parserType: outcome.parserUsed === "NONE" ? source.parserType : outcome.parserUsed,
          errorMessage: usable ? (warnings[0] ?? null) : (warnings[0] ?? "No records could be extracted from this page."),
        },
      });

      await ctx.prisma.sourceCheck.create({
        data: {
          sourceId: source.id,
          ok: usable,
          httpStatus: page.status,
          recordCount: totalForSource,
          delta,
          structureHash: outcome.structureHash || null,
          message: warnings[0] ?? null,
        },
      });

      await ctx.log(
        usable ? "info" : "warn",
        `${source.name}: ${created} new, ${unchanged} unchanged (${totalForSource} total).` +
          (warnings.length > 0 ? ` ${warnings[0]}` : ""),
      );
    } catch (e) {
      // A genuinely unexpected failure in one source: record it and carry on.
      sourcesFailed += 1;
      const message = e instanceof Error ? e.message : String(e);
      await ctx.prisma.universitySource
        .update({
          where: { id: source.id },
          data: { status: "FAILED", errorMessage: message, lastCollectedAt: new Date() },
        })
        .catch(() => undefined);
      await ctx.log("error", `${source.name} failed unexpectedly: ${message}`);
    }

    await ctx.tick(source.name);
  }

  await recordAudit({
    action: "collection.completed",
    entityType: "university",
    entityId: university.id,
    universityId: university.id,
    summary: `Collected ${recordsCreated} new raw record(s) for ${university.name}`,
    metadata: { recordsCreated, recordsUnchanged, sourcesOk, sourcesFailed },
  });

  return {
    summary: `Collected ${recordsCreated} new record(s) from ${sourcesOk} source(s). ${recordsUnchanged} were already stored. ${sourcesFailed} source(s) had problems.`,
    stats: { recordsCreated, recordsUnchanged, sourcesOk, sourcesFailed },
  };
};
