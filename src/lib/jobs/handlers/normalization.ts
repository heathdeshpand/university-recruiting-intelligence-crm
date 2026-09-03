import type { Prisma } from "@prisma/client";
import { normalizeRecord } from "@/lib/pipeline/normalize";
import { recordAudit } from "@/lib/api/audit";
import type { JobHandler } from "@/lib/jobs/types";

const BATCH_SIZE = 500;

/**
 * Turns raw records into normalized ones.
 *
 * Processes in batches so a university with a hundred thousand records does
 * not have to fit in memory. Raw records that already have a normalized
 * counterpart are skipped, which makes re-running cheap and safe.
 */
export const normalizationHandler: JobHandler = async (ctx) => {
  const pending = await ctx.prisma.rawRecord.count({
    where: { universityId: ctx.universityId, normalized: null },
  });

  if (pending === 0) {
    const total = await ctx.prisma.normalizedRecord.count({ where: { universityId: ctx.universityId } });
    return {
      summary:
        total === 0
          ? "There are no raw records to normalize. Run data collection first."
          : `All ${total} raw record(s) are already normalized.`,
      stats: { normalized: 0, skipped: 0, alreadyNormalized: total },
    };
  }

  await ctx.setTotal(pending);

  let normalized = 0;
  let skipped = 0;
  let processed = 0;

  for (;;) {
    await ctx.assertNotCancelled();

    const batch = await ctx.prisma.rawRecord.findMany({
      where: { universityId: ctx.universityId, normalized: null },
      take: BATCH_SIZE,
      orderBy: { discoveredAt: "asc" },
    });
    if (batch.length === 0) break;

    const rows: Prisma.NormalizedRecordCreateManyInput[] = [];

    for (const raw of batch) {
      const fields = normalizeRecord(raw);

      // A raw record with no parseable person name is kept -- it is evidence
      // that the extractor produced something odd -- but it does not become a
      // normalized record and never reaches a candidate.
      if (!fields) {
        skipped += 1;
        continue;
      }

      rows.push({
        universityId: ctx.universityId,
        rawRecordId: raw.id,
        normalizedName: fields.normalizedName,
        firstName: fields.firstName ?? null,
        middleInitial: fields.middleInitial ?? null,
        lastName: fields.lastName ?? null,
        suffix: fields.suffix ?? null,
        nameKey: fields.nameKey,
        lastNamePhonetic: fields.lastNamePhonetic ?? null,
        organization: fields.organization ?? null,
        organizationCanonical: fields.organizationCanonical ?? null,
        organizationCategory: fields.organizationCategory ?? null,
        role: fields.role ?? null,
        roleCanonical: fields.roleCanonical ?? null,
        isLeadershipRole: fields.isLeadershipRole,
        sport: fields.sport ?? null,
        sportCanonical: fields.sportCanonical ?? null,
        major: fields.major ?? null,
        majorCanonical: fields.majorCanonical ?? null,
        graduationYear: fields.graduationYear ?? null,
        email: fields.email ?? null,
        sourceSpecific: raw.rawPayload as Prisma.InputJsonValue,
      });
    }

    if (rows.length > 0) {
      const result = await ctx.prisma.normalizedRecord.createMany({
        data: rows,
        skipDuplicates: true,
      });
      normalized += result.count;
    }

    processed += batch.length;
    await ctx.setProgress(processed, `Normalized ${normalized} of ${pending}`);

    if (batch.length < BATCH_SIZE) break;
  }

  await recordAudit({
    action: "normalization.completed",
    entityType: "university",
    entityId: ctx.universityId,
    universityId: ctx.universityId,
    summary: `Normalized ${normalized} record(s)`,
    metadata: { normalized, skipped },
  });

  return {
    summary:
      skipped > 0
        ? `Normalized ${normalized} record(s). ${skipped} were skipped because no person name could be parsed from them.`
        : `Normalized ${normalized} record(s).`,
    stats: { normalized, skipped },
  };
};
