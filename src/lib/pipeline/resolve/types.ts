import type { MatchStatus } from "@prisma/client";

/** The subset of a normalized record that entity resolution compares. */
export interface ResolvableRecord {
  id: string;
  normalizedName: string;
  firstName: string | null;
  middleInitial: string | null;
  lastName: string | null;
  suffix: string | null;
  nameKey: string;
  lastNamePhonetic: string | null;
  organizationCanonical: string | null;
  sportCanonical: string | null;
  majorCanonical: string | null;
  graduationYear: number | null;
  email: string | null;
  sourceId: string;
}

export interface MatchFactor {
  /** Short label shown in the review UI, e.g. "Same graduation year". */
  label: string;
  /** The two values that were compared, for the reviewer to judge. */
  detail?: string;
  points: number;
}

export interface PairwiseMatch {
  matchScore: number;
  confidence: number;
  status: MatchStatus;
  matchingFactors: MatchFactor[];
  conflictingFactors: MatchFactor[];
}

/** Score bands. Configurable, and deliberately conservative at the top. */
export const MATCH_THRESHOLDS = {
  /** At or above this, records are merged without asking. */
  AUTO: 85,
  /** Strong but unconfirmed; surfaced for review, not merged. */
  PROBABLE: 70,
  /** Worth a human's time. */
  REVIEW: 50,
} as const;

export function statusForScore(score: number): MatchStatus {
  if (score >= MATCH_THRESHOLDS.AUTO) return "AUTO_MATCHED";
  if (score >= MATCH_THRESHOLDS.PROBABLE) return "PROBABLE_MATCH";
  if (score >= MATCH_THRESHOLDS.REVIEW) return "MANUAL_REVIEW";
  return "NOT_MATCHED";
}
