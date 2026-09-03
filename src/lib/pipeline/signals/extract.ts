import type { CareerStage, Confidence, SignalCategory, TriState } from "@prisma/client";
import { SIGNAL_DEFINITIONS } from "@/lib/config/signals";
import { SIGNAL_PATTERNS } from "@/lib/config/patterns";
import type { BuiltEvidence } from "@/lib/pipeline/signals/evidence";

/**
 * Signal aggregation.
 *
 * Turns a candidate's evidence into a set of structured signals, then looks
 * for named combinations of those signals.
 *
 * Two rules govern how signals are counted, and both exist to stop the same
 * fact being rewarded twice:
 *
 *   `occurrences` counts DISTINCT subjects, not evidence rows. A candidate
 *   listed in the same club by three different pages has one organization,
 *   not three. This is what makes "member of multiple organizations" mean
 *   what it says.
 *
 *   A signal appears at most once per candidate, carrying every piece of
 *   evidence that supports it. Scoring reads the signal, never the evidence
 *   list, so no rule can fire twice on the same underlying fact.
 */

export interface AggregatedSignal {
  definitionKey: string;
  category: SignalCategory;
  value: TriState;
  confidence: Confidence;
  occurrences: number;
  detail: string | null;
  evidenceFingerprints: string[];
}

export interface DetectedPattern {
  patternKey: string;
  label: string;
  signalKeys: string[];
}

const DEFINITION_BY_KEY = new Map(SIGNAL_DEFINITIONS.map((d) => [d.key, d]));

const CONFIDENCE_RANK: Record<Confidence, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

function strongest(a: Confidence, b: Confidence): Confidence {
  return CONFIDENCE_RANK[a] >= CONFIDENCE_RANK[b] ? a : b;
}

export interface AggregateInput {
  evidence: BuiltEvidence[];
  careerStage: CareerStage;
  graduationYear: number | null;
}

export function aggregateSignals(input: AggregateInput): {
  signals: AggregatedSignal[];
  patterns: DetectedPattern[];
} {
  // key -> distinct subjects, supporting evidence, best confidence
  const accumulator = new Map<
    string,
    { subjects: Set<string>; fingerprints: Set<string>; confidence: Confidence }
  >();

  for (const item of input.evidence) {
    for (const signal of item.signals) {
      if (!DEFINITION_BY_KEY.has(signal.key)) continue;

      const entry = accumulator.get(signal.key) ?? {
        subjects: new Set<string>(),
        fingerprints: new Set<string>(),
        confidence: "LOW" as Confidence,
      };

      // A signal with no subject (a job-search statement, say) still counts
      // once; the fingerprint keeps repeated statements from inflating it.
      entry.subjects.add(signal.subject ?? item.fingerprint);
      entry.fingerprints.add(item.fingerprint);
      entry.confidence = strongest(entry.confidence, item.confidence);
      accumulator.set(signal.key, entry);
    }
  }

  const signals: AggregatedSignal[] = [];

  for (const [key, entry] of accumulator) {
    const definition = DEFINITION_BY_KEY.get(key)!;
    const occurrences = entry.subjects.size;

    // Signals that only mean anything in the plural are recorded but left at
    // UNKNOWN until there really are two, rather than being asserted as NO.
    const requiresMultiple = key === "MULTIPLE_ORGS" || key === "MULTIPLE_LEADERSHIP";
    if (requiresMultiple && occurrences < 2) continue;

    signals.push({
      definitionKey: key,
      category: definition.category,
      value: "YES",
      confidence: entry.confidence,
      occurrences,
      detail:
        occurrences > 1
          ? `${occurrences} distinct ${occurrences === 1 ? "instance" : "instances"}`
          : null,
      evidenceFingerprints: [...entry.fingerprints],
    });
  }

  // --- Timing signals -------------------------------------------------------
  // These are inferences from a graduation year, so they only exist when a
  // year is actually known. With no year, timing stays absent -- which the
  // UI renders as UNKNOWN, never as "not graduating soon".
  if (input.graduationYear !== null) {
    if (input.careerStage === "NEAR_GRADUATION") {
      signals.push({
        definitionKey: "NEAR_GRADUATION",
        category: "TIMING",
        value: "YES",
        confidence: "MEDIUM",
        occurrences: 1,
        detail: `Graduation year ${input.graduationYear}`,
        evidenceFingerprints: [],
      });
    } else if (input.careerStage === "RECENT_GRADUATE") {
      signals.push({
        definitionKey: "RECENT_GRADUATE",
        category: "TIMING",
        value: "YES",
        confidence: "MEDIUM",
        occurrences: 1,
        detail: `Graduation year ${input.graduationYear}`,
        evidenceFingerprints: [],
      });
    }
  }

  return { signals, patterns: detectPatterns(signals) };
}

/**
 * Finds named co-occurrences of signals.
 *
 * Patterns are descriptions, never conclusions: "four independent involvement
 * signals" is a count a recruiter can verify, and nothing here infers
 * anything about a person's character or motivation.
 */
export function detectPatterns(signals: AggregatedSignal[]): DetectedPattern[] {
  const present = new Set(signals.filter((s) => s.value === "YES").map((s) => s.definitionKey));
  const detected: DetectedPattern[] = [];

  for (const pattern of SIGNAL_PATTERNS) {
    const hasAllRequired = pattern.requires.every((k) => present.has(k));
    if (!hasAllRequired) continue;

    let matchedAny: string[] = [];
    if (pattern.anyOf && pattern.minOf) {
      matchedAny = pattern.anyOf.filter((k) => present.has(k));
      if (matchedAny.length < pattern.minOf) continue;
    }

    detected.push({
      patternKey: pattern.key,
      label: pattern.label,
      signalKeys: [...new Set([...pattern.requires, ...matchedAny])],
    });
  }

  return detected;
}
