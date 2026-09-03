import type { Prisma } from "@prisma/client";
import { buildEvidence, type EvidenceInput } from "@/lib/pipeline/signals/evidence";
import { aggregateSignals } from "@/lib/pipeline/signals/extract";
import { careerStageFor } from "@/lib/pipeline/resolve";
import { recordAudit } from "@/lib/api/audit";
import type { JobHandler } from "@/lib/jobs/types";

const CANDIDATE_BATCH = 100;

/**
 * Builds each candidate's evidence, signals and signal patterns.
 *
 * Runs per candidate so that a candidate's evidence set is rewritten
 * atomically: stale evidence from a previous run is removed and rebuilt from
 * the records the candidate currently owns. That matters because entity
 * resolution can move records between candidates, and evidence must follow
 * the record, not linger on whoever used to own it.
 */
export const signalExtractionHandler: JobHandler = async (ctx) => {
  const total = await ctx.prisma.candidate.count({ where: { universityId: ctx.universityId } });

  if (total === 0) {
    return {
      summary: "There are no candidates yet. Run entity resolution first.",
      stats: { candidates: 0 },
    };
  }

  await ctx.setTotal(total);

  let processed = 0;
  let evidenceCreated = 0;
  let signalsCreated = 0;
  let patternsDetected = 0;
  let cursor: string | undefined;

  for (;;) {
    await ctx.assertNotCancelled();

    const candidates = await ctx.prisma.candidate.findMany({
      where: { universityId: ctx.universityId },
      take: CANDIDATE_BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        graduationYear: true,
        careerStage: true,
        sourceRecords: {
          select: {
            normalizedRecord: {
              select: {
                id: true,
                organization: true,
                organizationCanonical: true,
                organizationCategory: true,
                role: true,
                roleCanonical: true,
                isLeadershipRole: true,
                sport: true,
                sportCanonical: true,
                major: true,
                majorCanonical: true,
                graduationYear: true,
                sourceSpecific: true,
                rawRecord: {
                  select: {
                    rawUrl: true,
                    sourceId: true,
                    source: { select: { sourceType: true, url: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (candidates.length === 0) break;
    cursor = candidates[candidates.length - 1]!.id;

    for (const candidate of candidates) {
      const inputs: EvidenceInput[] = candidate.sourceRecords.map((link) => {
        const record = link.normalizedRecord;
        const payload = (record.sourceSpecific ?? {}) as Record<string, unknown>;
        const note = typeof payload.note === "string" ? payload.note : null;

        return {
          normalizedRecordId: record.id,
          sourceId: record.rawRecord.sourceId,
          sourceUrl: record.rawRecord.rawUrl ?? record.rawRecord.source.url,
          sourceType: record.rawRecord.source.sourceType,
          organization: record.organization,
          organizationCanonical: record.organizationCanonical,
          organizationCategory: record.organizationCategory,
          role: record.role,
          roleCanonical: record.roleCanonical,
          isLeadershipRole: record.isLeadershipRole,
          sport: record.sport,
          sportCanonical: record.sportCanonical,
          major: record.major,
          majorCanonical: record.majorCanonical,
          graduationYear: record.graduationYear,
          note,
        };
      });

      const built = inputs.flatMap(buildEvidence);

      // Deduplicate identical statements arriving from several records.
      const byFingerprint = new Map(built.map((e) => [e.fingerprint, e]));
      const unique = [...byFingerprint.values()];

      const careerStage = careerStageFor(candidate.graduationYear);
      const { signals, patterns } = aggregateSignals({
        evidence: unique,
        careerStage,
        graduationYear: candidate.graduationYear,
      });

      await ctx.prisma.$transaction(async (tx) => {
        // Rebuild rather than merge: a record that moved to another candidate
        // must not leave its evidence behind here.
        await tx.evidence.deleteMany({ where: { candidateId: candidate.id } });
        await tx.signal.deleteMany({ where: { candidateId: candidate.id } });
        await tx.signalPattern.deleteMany({ where: { candidateId: candidate.id } });

        const evidenceIdByFingerprint = new Map<string, string>();
        for (const item of unique) {
          const created = await tx.evidence.create({
            data: {
              candidateId: candidate.id,
              sourceId: item.sourceId,
              normalizedRecordId: item.normalizedRecordId,
              evidenceType: item.evidenceType,
              assertionKind: item.assertionKind,
              statement: item.statement,
              originalValue: item.originalValue,
              sourceUrl: item.sourceUrl,
              confidence: item.confidence,
              fingerprint: item.fingerprint,
            },
            select: { id: true },
          });
          evidenceIdByFingerprint.set(item.fingerprint, created.id);
        }
        evidenceCreated += unique.length;

        for (const signal of signals) {
          const created = await tx.signal.create({
            data: {
              candidateId: candidate.id,
              definitionKey: signal.definitionKey,
              category: signal.category,
              value: signal.value,
              confidence: signal.confidence,
              occurrences: signal.occurrences,
              detail: signal.detail,
            },
            select: { id: true },
          });

          const links = signal.evidenceFingerprints
            .map((fp) => evidenceIdByFingerprint.get(fp))
            .filter((id): id is string => Boolean(id))
            .map((evidenceId) => ({ signalId: created.id, evidenceId }));

          if (links.length > 0) {
            await tx.signalEvidence.createMany({ data: links, skipDuplicates: true });
          }
        }
        signalsCreated += signals.length;

        if (patterns.length > 0) {
          await tx.signalPattern.createMany({
            data: patterns.map((p) => ({
              candidateId: candidate.id,
              patternKey: p.patternKey,
              label: p.label,
              signalKeys: p.signalKeys,
            })) satisfies Prisma.SignalPatternCreateManyInput[],
            skipDuplicates: true,
          });
        }
        patternsDetected += patterns.length;

        await tx.candidate.update({
          where: { id: candidate.id },
          data: { signalCount: signals.length, careerStage },
        });
      });

      processed += 1;
    }

    await ctx.setProgress(processed, `Extracted signals for ${processed} of ${total} candidates`);
    if (candidates.length < CANDIDATE_BATCH) break;
  }

  await recordAudit({
    action: "signals.extracted",
    entityType: "university",
    entityId: ctx.universityId,
    universityId: ctx.universityId,
    summary: `Extracted ${signalsCreated} signal(s) across ${processed} candidate(s)`,
    metadata: { evidenceCreated, signalsCreated, patternsDetected },
  });

  return {
    summary: `Built ${evidenceCreated.toLocaleString()} evidence records and ${signalsCreated.toLocaleString()} signals across ${processed.toLocaleString()} candidates, detecting ${patternsDetected} signal pattern(s).`,
    stats: { candidates: processed, evidenceCreated, signalsCreated, patternsDetected },
  };
};
