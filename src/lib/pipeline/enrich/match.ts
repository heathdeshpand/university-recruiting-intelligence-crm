import { buildSurnameFrequency, scorePair } from "@/lib/pipeline/resolve/score";
import type { ResolvableRecord } from "@/lib/pipeline/resolve/types";
import { phoneticKey } from "@/lib/util/text";
import type { DirectoryIndex, EnrichmentAttempt, EnrichmentFields } from "@/lib/pipeline/enrich/types";

/**
 * Directory matching.
 *
 * Pure functions only: given a candidate and an already-loaded directory
 * index, decide whether they are the same person. Keeping this free of any
 * I/O means the matching rules can be tested exhaustively without a database
 * or a network, which is exactly what you want for the step that decides
 * whose contact details get attached to whom.
 */

/** Confidence at or above which a directory match is accepted. */
export const DIRECTORY_MATCH_THRESHOLD = 0.85;
/** How close the runner-up may be before the match is called ambiguous. */
export const AMBIGUITY_MARGIN = 0.08;

/** The candidate side of a directory comparison. */
export interface EnrichableCandidate {
  id: string;
  canonicalName: string;
  firstName: string | null;
  middleInitial: string | null;
  lastName: string | null;
  major: string | null;
  graduationYear: number | null;
  email: string | null;
}

export function enrichCandidate(
  candidate: EnrichableCandidate,
  directory: DirectoryIndex,
): EnrichmentAttempt {
  const phonetic = candidate.lastName ? phoneticKey(candidate.lastName) : "";
  const pool = directory.byPhonetic.get(phonetic) ?? [];

  if (pool.length === 0) {
    return {
      outcome: "NO_MATCH",
      matchConfidence: null,
      matchedName: null,
      fields: {},
      matchingFactors: [],
      conflictingFactors: [],
      sourceUrl: directory.sourceUrl,
      message: `No entry with a comparable surname was found in ${directory.sourceName}.`,
    };
  }

  const candidateRecord: ResolvableRecord = {
    id: candidate.id,
    normalizedName: candidate.canonicalName,
    firstName: candidate.firstName,
    middleInitial: candidate.middleInitial,
    lastName: candidate.lastName,
    suffix: null,
    nameKey: "",
    lastNamePhonetic: phonetic,
    organizationCanonical: null,
    sportCanonical: null,
    majorCanonical: candidate.major,
    graduationYear: candidate.graduationYear,
    email: candidate.email,
    sourceId: "candidate",
  };

  const frequency = buildSurnameFrequency(directory.entries);

  const scored = pool
    .map((entry) => ({ entry, result: scorePair(candidateRecord, entry, frequency) }))
    .sort((a, b) => b.result.matchScore - a.result.matchScore);

  const best = scored[0];
  if (!best || best.result.confidence < DIRECTORY_MATCH_THRESHOLD - 0.25) {
    return {
      outcome: "NO_MATCH",
      matchConfidence: best?.result.confidence ?? null,
      matchedName: null,
      fields: {},
      matchingFactors: [],
      conflictingFactors: best?.result.conflictingFactors.map((f) => ({ label: f.label, detail: f.detail })) ?? [],
      sourceUrl: directory.sourceUrl,
      message: `The closest entry in ${directory.sourceName} scored ${Math.round((best?.result.confidence ?? 0) * 100)}%, which is too low to accept.`,
    };
  }

  const runnerUp = scored[1];
  const isAmbiguous =
    runnerUp !== undefined &&
    best.result.confidence - runnerUp.result.confidence < AMBIGUITY_MARGIN &&
    runnerUp.result.confidence >= DIRECTORY_MATCH_THRESHOLD - 0.15;

  if (isAmbiguous) {
    // Two directory entries fit about equally well. Guessing would silently
    // attach the wrong person's contact details, so this goes to a human.
    return {
      outcome: "AMBIGUOUS",
      matchConfidence: best.result.confidence,
      matchedName: best.entry.normalizedName,
      fields: {},
      matchingFactors: best.result.matchingFactors.map((f) => ({ label: f.label, detail: f.detail })),
      conflictingFactors: best.result.conflictingFactors.map((f) => ({ label: f.label, detail: f.detail })),
      sourceUrl: directory.sourceUrl,
      message: `Two directory entries matched almost equally well (${Math.round(best.result.confidence * 100)}% and ${Math.round(runnerUp!.result.confidence * 100)}%). Left for manual review rather than guessing.`,
    };
  }

  if (best.result.confidence < DIRECTORY_MATCH_THRESHOLD) {
    return {
      outcome: "AMBIGUOUS",
      matchConfidence: best.result.confidence,
      matchedName: best.entry.normalizedName,
      fields: {},
      matchingFactors: best.result.matchingFactors.map((f) => ({ label: f.label, detail: f.detail })),
      conflictingFactors: best.result.conflictingFactors.map((f) => ({ label: f.label, detail: f.detail })),
      sourceUrl: directory.sourceUrl,
      message: `The best directory match scored ${Math.round(best.result.confidence * 100)}%, below the ${Math.round(DIRECTORY_MATCH_THRESHOLD * 100)}% needed to accept it automatically.`,
    };
  }

  // Only non-sensitive fields the directory actually published.
  const fields: EnrichmentFields = {};
  if (best.entry.email) fields.email = best.entry.email;
  if (best.entry.major) fields.major = best.entry.major;
  if (best.entry.graduationYear) fields.graduationYear = best.entry.graduationYear;

  return {
    outcome: "MATCHED",
    matchConfidence: best.result.confidence,
    matchedName: best.entry.normalizedName,
    fields,
    matchingFactors: best.result.matchingFactors.map((f) => ({ label: f.label, detail: f.detail })),
    conflictingFactors: best.result.conflictingFactors.map((f) => ({ label: f.label, detail: f.detail })),
    sourceUrl: directory.sourceUrl,
    message: `Matched ${best.entry.normalizedName} in ${directory.sourceName} at ${Math.round(best.result.confidence * 100)}% confidence.`,
  };
}
