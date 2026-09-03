import type { Prisma, PrismaClient, ScoreKind } from "@prisma/client";
import { computeScore, type ScoringRuleInput, type ScoringSignalInput } from "@/lib/pipeline/scoring/engine";
import { getDefaultScoringConfig } from "@/lib/config/bootstrap";
import { tierForScore } from "@/lib/config/scoring";

/**
 * Applies a scoring configuration to every candidate at a university.
 *
 * Persists the score, its per-category breakdown, and one ScoreFactor row per
 * point contribution. The factor rows keep a copy of the evidence statement
 * and source name, so a historical score stays explainable even if the
 * underlying evidence is later rebuilt.
 */

const BATCH = 100;

export interface ScoringRunResult {
  scored: number;
  averageScore: number | null;
  qualified: number;
  threshold: number;
  configName: string;
}

export interface ScoringProgress {
  (processed: number, total: number): Promise<void>;
}

export async function runScoring(
  prisma: PrismaClient,
  universityId: string,
  kind: ScoreKind,
  report: ScoringProgress,
  shouldStop: () => Promise<boolean>,
): Promise<ScoringRunResult> {
  const config = await getDefaultScoringConfig(prisma, kind);

  const settings = await prisma.universitySettings.findUnique({ where: { universityId } });
  const threshold = settings?.discoveryThreshold ?? config.discoveryThreshold;

  const rules: ScoringRuleInput[] = config.rules.map((r) => ({
    key: r.key,
    label: r.label,
    category: r.category,
    signalKey: r.signalKey,
    requiredValue: r.requiredValue,
    points: r.points,
    minOccurrences: r.minOccurrences,
    pointsPerExtraOccurrence: r.pointsPerExtraOccurrence,
    maxPoints: r.maxPoints,
    active: r.active,
  }));

  const categoryCaps = (config.categoryCaps ?? {}) as Record<string, number>;

  const total = await prisma.candidate.count({ where: { universityId } });
  let processed = 0;
  let scoreSum = 0;
  let qualified = 0;
  let cursor: string | undefined;

  for (;;) {
    if (await shouldStop()) break;

    const candidates = await prisma.candidate.findMany({
      where: { universityId },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        signals: {
          select: {
            definitionKey: true,
            value: true,
            occurrences: true,
            confidence: true,
            evidenceLinks: {
              take: 1,
              select: {
                evidence: {
                  select: {
                    id: true,
                    statement: true,
                    sourceUrl: true,
                    source: { select: { name: true } },
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
      const signalInputs: ScoringSignalInput[] = candidate.signals.map((s) => {
        const evidence = s.evidenceLinks[0]?.evidence;
        return {
          definitionKey: s.definitionKey,
          value: s.value,
          occurrences: s.occurrences,
          confidence: s.confidence,
          evidence: evidence
            ? {
                id: evidence.id,
                statement: evidence.statement,
                sourceName: evidence.source?.name ?? null,
                sourceUrl: evidence.sourceUrl,
              }
            : null,
        };
      });

      const result = computeScore(signalInputs, { rules, categoryCaps });

      await prisma.$transaction(async (tx) => {
        // One score per candidate per kind; replacing it also replaces its
        // factors through the cascade.
        await tx.score.deleteMany({ where: { candidateId: candidate.id, kind } });

        const score = await tx.score.create({
          data: {
            candidateId: candidate.id,
            kind,
            value: result.value,
            configId: config.id,
            breakdown: result.breakdown as unknown as Prisma.InputJsonValue,
          },
          select: { id: true },
        });

        if (result.factors.length > 0) {
          await tx.scoreFactor.createMany({
            data: result.factors.map((f) => ({
              scoreId: score.id,
              ruleKey: f.ruleKey,
              label: f.label,
              category: f.category,
              points: f.points,
              evidenceId: f.evidenceId,
              evidenceSummary: f.evidenceSummary,
              sourceName: f.sourceName,
              sourceUrl: f.sourceUrl,
              confidence: f.confidence,
            })),
          });
        }

        if (kind === "DISCOVERY") {
          const meetsThreshold = result.value >= threshold;
          await tx.candidate.update({
            where: { id: candidate.id },
            data: {
              discoveryScore: result.value,
              status: meetsThreshold ? "QUALIFIED" : "DISCOVERED",
              // Candidates below the threshold are explicitly marked as not
              // eligible rather than left in limbo, so the enrichment queue
              // can never silently pick them up.
              enrichmentStatus: meetsThreshold ? "QUEUED" : "NOT_ELIGIBLE",
            },
          });
        } else {
          await tx.candidate.update({
            where: { id: candidate.id },
            data: { finalScore: result.value, tier: tierForScore(result.value) },
          });
        }
      });

      scoreSum += result.value;
      if (result.value >= threshold) qualified += 1;
      processed += 1;
    }

    await report(processed, total);
    if (candidates.length < BATCH) break;
  }

  return {
    scored: processed,
    averageScore: processed === 0 ? null : Math.round(scoreSum / processed),
    qualified,
    threshold,
    configName: config.name,
  };
}
