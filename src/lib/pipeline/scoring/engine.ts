import type { Confidence, SignalCategory, TriState } from "@prisma/client";

/**
 * The scoring engine.
 *
 * One pure function drives both the discovery score and the final score; the
 * only difference between them is which rule set is passed in. That is
 * deliberate -- it means the two scores are computed by identical, tested
 * logic and can never drift apart in behaviour.
 *
 * Four properties are enforced here and covered by tests:
 *
 *   No negative inference. A rule fires only when its signal is explicitly
 *   YES. A signal that is UNKNOWN -- because the university publishes nothing
 *   in that category -- contributes zero and costs nothing. There is no code
 *   path that subtracts points.
 *
 *   No double counting. Each rule reads one signal and fires at most once.
 *   Breadth is rewarded through `occurrences`, which counts distinct subjects,
 *   so being listed in the same club by three pages is still one organization.
 *
 *   Bounded contributions. Every rule may carry its own ceiling, and every
 *   category has a cap, so no single kind of evidence can dominate a score.
 *
 *   Explainability. Every point awarded comes back as a factor naming the
 *   rule, the evidence, and the source.
 */

export interface ScoringSignalInput {
  definitionKey: string;
  value: TriState;
  occurrences: number;
  confidence: Confidence;
  /** Best evidence supporting this signal, used to explain the points. */
  evidence?: {
    id: string;
    statement: string;
    sourceName: string | null;
    sourceUrl: string | null;
  } | null;
}

export interface ScoringRuleInput {
  key: string;
  label: string;
  category: SignalCategory;
  signalKey: string;
  requiredValue: TriState;
  points: number;
  minOccurrences: number;
  pointsPerExtraOccurrence: number;
  maxPoints: number | null;
  active: boolean;
}

export interface ScoringConfigInput {
  rules: ScoringRuleInput[];
  categoryCaps: Partial<Record<SignalCategory, number>>;
}

export interface ScoreFactorOutput {
  ruleKey: string;
  label: string;
  category: SignalCategory;
  points: number;
  evidenceId: string | null;
  evidenceSummary: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  confidence: Confidence;
}

export interface CategoryBreakdown {
  earned: number;
  max: number;
  /** Points the rules produced before the category cap was applied. */
  raw: number;
  capped: boolean;
}

export interface ScoreOutput {
  value: number;
  breakdown: Record<string, CategoryBreakdown>;
  factors: ScoreFactorOutput[];
  /** Rules that did not fire, and why. Powers the "why not higher?" view. */
  unmetRules: Array<{ ruleKey: string; label: string; reason: string }>;
}

/** Points a single rule awards for a signal, before any category cap. */
export function pointsForRule(rule: ScoringRuleInput, occurrences: number): number {
  const extra = Math.max(0, occurrences - rule.minOccurrences);
  const raw = rule.points + extra * rule.pointsPerExtraOccurrence;
  return rule.maxPoints !== null ? Math.min(raw, rule.maxPoints) : raw;
}

/** The most a rule could ever award, used to compute a category's maximum. */
export function maxPointsForRule(rule: ScoringRuleInput): number {
  if (rule.maxPoints !== null) return rule.maxPoints;
  // A rule with unbounded per-occurrence points has no theoretical maximum;
  // three occurrences is used as a realistic ceiling for display purposes.
  return rule.points + rule.pointsPerExtraOccurrence * 3;
}

export function computeScore(
  signals: ScoringSignalInput[],
  config: ScoringConfigInput,
): ScoreOutput {
  const signalByKey = new Map(signals.map((s) => [s.definitionKey, s]));
  const activeRules = config.rules.filter((r) => r.active);

  const factors: ScoreFactorOutput[] = [];
  const unmetRules: ScoreOutput["unmetRules"] = [];
  const rawByCategory = new Map<SignalCategory, number>();

  for (const rule of activeRules) {
    const signal = signalByKey.get(rule.signalKey);

    if (!signal) {
      // The crucial case: nothing is known about this signal. It is not a
      // failure and it is not a negative -- it simply contributes nothing.
      unmetRules.push({
        ruleKey: rule.key,
        label: rule.label,
        reason: "No source covered this, so it is unknown rather than absent.",
      });
      continue;
    }

    if (signal.value !== rule.requiredValue) {
      unmetRules.push({
        ruleKey: rule.key,
        label: rule.label,
        reason:
          signal.value === "UNKNOWN"
            ? "No source covered this, so it is unknown rather than absent."
            : "A source indicated this does not apply.",
      });
      continue;
    }

    if (signal.occurrences < rule.minOccurrences) {
      unmetRules.push({
        ruleKey: rule.key,
        label: rule.label,
        reason: `Requires at least ${rule.minOccurrences}; found ${signal.occurrences}.`,
      });
      continue;
    }

    const points = pointsForRule(rule, signal.occurrences);
    if (points <= 0) continue;

    rawByCategory.set(rule.category, (rawByCategory.get(rule.category) ?? 0) + points);

    factors.push({
      ruleKey: rule.key,
      label: rule.label,
      category: rule.category,
      points,
      evidenceId: signal.evidence?.id ?? null,
      evidenceSummary: signal.evidence?.statement ?? null,
      sourceName: signal.evidence?.sourceName ?? null,
      sourceUrl: signal.evidence?.sourceUrl ?? null,
      confidence: signal.confidence,
    });
  }

  // --- Apply category caps --------------------------------------------------
  const maxByCategory = new Map<SignalCategory, number>();
  for (const rule of activeRules) {
    maxByCategory.set(rule.category, (maxByCategory.get(rule.category) ?? 0) + maxPointsForRule(rule));
  }

  const breakdown: Record<string, CategoryBreakdown> = {};
  let total = 0;

  const categories = new Set<SignalCategory>([...maxByCategory.keys(), ...rawByCategory.keys()]);

  for (const category of categories) {
    const cap = config.categoryCaps[category];
    const raw = rawByCategory.get(category) ?? 0;
    const theoreticalMax = maxByCategory.get(category) ?? 0;

    // The displayed maximum is the cap when one is configured, because that
    // is the most a candidate can actually earn in this category.
    const max = cap ?? theoreticalMax;
    const earned = cap === undefined ? raw : Math.min(raw, cap);

    breakdown[category] = { earned, max, raw, capped: cap !== undefined && raw > cap };
    total += earned;
  }

  return {
    // Scores are always presented on a 0-100 scale.
    value: Math.max(0, Math.min(100, Math.round(total))),
    breakdown,
    factors: factors.sort((a, b) => b.points - a.points),
    unmetRules,
  };
}

/** Groups the headline categories the UI shows as a five-line breakdown. */
export const DISPLAY_GROUPS: Array<{ label: string; categories: SignalCategory[] }> = [
  { label: "Social", categories: ["SOCIAL"] },
  { label: "Competitive", categories: ["COMPETITIVE"] },
  {
    label: "Career / Sales",
    categories: ["SALES", "BUSINESS", "ENTREPRENEURSHIP", "WORK_EXPERIENCE", "CUSTOMER_FACING", "CAREER"],
  },
  { label: "Leadership", categories: ["LEADERSHIP"] },
  { label: "Timing", categories: ["TIMING", "JOB_SEARCH"] },
];

export interface DisplayGroupTotal {
  label: string;
  earned: number;
  max: number;
}

/** Collapses the per-category breakdown into the five display groups. */
export function groupBreakdown(breakdown: Record<string, CategoryBreakdown>): DisplayGroupTotal[] {
  return DISPLAY_GROUPS.map((group) => {
    let earned = 0;
    let max = 0;
    for (const category of group.categories) {
      const entry = breakdown[category];
      if (!entry) continue;
      earned += entry.earned;
      max += entry.max;
    }
    return { label: group.label, earned, max };
  }).filter((g) => g.max > 0);
}
